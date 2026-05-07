"""制度知识库仓储层：KnowledgeFile + PolicyChunk 的 DB 操作。"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.policy import KnowledgeFile, PolicyChunk


async def create_knowledge_file(
    session: AsyncSession,
    *,
    name: str,
    category: str,
    file_path: str,
    size_bytes: int,
    access_level: str = "public",
    page_count: int | None = None,
    status: str = "processing",
) -> KnowledgeFile:
    """创建一条 KnowledgeFile（默认状态 processing，待 ingest 完成后更新）。"""
    file = KnowledgeFile(
        name=name,
        category=category,
        access_level=access_level,
        file_path=file_path,
        size_bytes=size_bytes,
        page_count=page_count,
        status=status,
    )
    session.add(file)
    await session.flush()
    return file


async def get_knowledge_file(
    session: AsyncSession, file_id: UUID
) -> KnowledgeFile | None:
    return await session.get(KnowledgeFile, file_id)


async def update_file_status(
    session: AsyncSession,
    file_id: UUID,
    *,
    status: str,
    chunk_count: int | None = None,
) -> None:
    file = await session.get(KnowledgeFile, file_id)
    if file is None:
        raise LookupError(f"KnowledgeFile {file_id} not found")
    file.status = status
    if chunk_count is not None:
        file.chunk_count = chunk_count
    await session.flush()


async def bulk_insert_chunks(
    session: AsyncSession,
    *,
    file_id: UUID,
    items: list[dict[str, Any]],
) -> int:
    """批量插入 PolicyChunk。

    items 中每条需包含：chunk_index, content, embedding, metadata, page(可选)。
    """
    if not items:
        return 0
    chunks = [
        PolicyChunk(
            file_id=file_id,
            chunk_index=item["chunk_index"],
            content=item["content"],
            page=item.get("page"),
            chunk_metadata=item.get("metadata") or {},
            embedding=item["embedding"],
        )
        for item in items
    ]
    session.add_all(chunks)
    await session.flush()
    return len(chunks)


async def search_chunks_by_vector(
    session: AsyncSession,
    *,
    query_embedding: list[float],
    category: str | None = None,
    top_k: int = 5,
) -> list[tuple[PolicyChunk, float]]:
    """按 cosine 距离检索 chunk，返回 (chunk, similarity_score)。

    similarity_score = 1 - cosine_distance（越大越相似，范围 [0, 2]，常见 [0, 1]）。
    可选 category 过滤：联表 KnowledgeFile.category。
    """
    distance = PolicyChunk.embedding.cosine_distance(query_embedding)  # type: ignore[attr-defined]
    stmt = (
        select(PolicyChunk, distance.label("distance"))
        .order_by(distance.asc())
        .limit(top_k)
    )
    if category is not None:
        stmt = stmt.join(
            KnowledgeFile, KnowledgeFile.id == PolicyChunk.file_id
        ).where(KnowledgeFile.category == category)

    result = await session.execute(stmt)
    rows = result.all()
    return [(row[0], 1.0 - float(row[1])) for row in rows]


async def count_chunks_by_file(session: AsyncSession, file_id: UUID) -> int:
    stmt = select(func.count(PolicyChunk.id)).where(PolicyChunk.file_id == file_id)
    result = await session.execute(stmt)
    return int(result.scalar_one())


async def list_knowledge_files(
    session: AsyncSession,
    *,
    category: str | None = None,
    status_in: list[str] | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[KnowledgeFile]:
    stmt = select(KnowledgeFile).order_by(KnowledgeFile.created_at.desc())
    if category is not None:
        stmt = stmt.where(KnowledgeFile.category == category)
    if status_in:
        stmt = stmt.where(KnowledgeFile.status.in_(status_in))
    stmt = stmt.limit(limit).offset(offset)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def list_categories_with_file_count(
    session: AsyncSession,
) -> list[tuple[str, int]]:
    """按 category 聚合，返回 [(category, file_count)]，仅 ready 状态。"""
    stmt = (
        select(KnowledgeFile.category, func.count(KnowledgeFile.id))
        .where(KnowledgeFile.status == "ready")
        .group_by(KnowledgeFile.category)
        .order_by(KnowledgeFile.category.asc())
    )
    result = await session.execute(stmt)
    return [(row[0], int(row[1])) for row in result.all()]


async def delete_knowledge_file(
    session: AsyncSession, file_id: UUID
) -> KnowledgeFile | None:
    """删除文件及其全部 chunk；返回被删除记录（用于读取 file_path 清盘）。"""
    file = await session.get(KnowledgeFile, file_id)
    if file is None:
        return None
    await session.execute(delete(PolicyChunk).where(PolicyChunk.file_id == file_id))
    await session.delete(file)
    await session.flush()
    return file
