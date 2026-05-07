"""制度万事通服务层：编排 loader → embedding → 入库 → 检索。"""
from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.ark import get_embeddings
from app.ai.loaders.markdown import MarkdownChunk, load_markdown
from app.repositories import policy as policy_repo

logger = structlog.get_logger(__name__)

# 限制 embedding 并发，避免火山方舟接口被限流
_EMBED_CONCURRENCY = 5


async def ingest_markdown_file(
    session: AsyncSession,
    *,
    file_path: str | Path,
    name: str,
    category: str,
    access_level: str = "public",
) -> UUID:
    """全流程：切分 → embedding → 入库。返回新建 KnowledgeFile.id。

    入库失败时抛异常并把文件状态置为 failed（不阻塞调用方处理）。
    成功时状态置为 ready 并写入 chunk_count。
    """
    path = Path(file_path)
    size_bytes = path.stat().st_size if path.exists() else 0

    file = await policy_repo.create_knowledge_file(
        session,
        name=name,
        category=category,
        file_path=str(path),
        size_bytes=size_bytes,
        access_level=access_level,
        status="processing",
    )
    file_id = file.id
    await session.commit()

    try:
        chunks = load_markdown(path, source_name=name)
        if not chunks:
            await policy_repo.update_file_status(
                session, file_id, status="ready", chunk_count=0
            )
            await session.commit()
            logger.info("ingest_markdown_empty", file_id=str(file_id), name=name)
            return file_id

        embeddings = await _embed_chunks_with_limit(chunks)
        items = [
            {
                "chunk_index": c.chunk_index,
                "content": c.content,
                "page": c.page,
                "metadata": c.metadata,
                "embedding": emb,
            }
            for c, emb in zip(chunks, embeddings, strict=True)
        ]
        inserted = await policy_repo.bulk_insert_chunks(
            session, file_id=file_id, items=items
        )
        await policy_repo.update_file_status(
            session, file_id, status="ready", chunk_count=inserted
        )
        await session.commit()
        logger.info(
            "ingest_markdown_success",
            file_id=str(file_id),
            name=name,
            chunks=inserted,
        )
        return file_id
    except Exception as exc:  # pragma: no cover
        await session.rollback()
        try:
            await policy_repo.update_file_status(session, file_id, status="failed")
            await session.commit()
        except Exception:
            await session.rollback()
        logger.exception("ingest_markdown_failed", file_id=str(file_id), error=str(exc))
        raise


async def _embed_chunks_with_limit(
    chunks: list[MarkdownChunk],
) -> list[list[float]]:
    """带并发上限的 embedding 调用，避免一次性打爆方舟接口。"""
    embeddings = get_embeddings()
    semaphore = asyncio.Semaphore(_EMBED_CONCURRENCY)

    async def _one(text: str) -> list[float]:
        async with semaphore:
            return await embeddings.aembed_query(text)

    return await asyncio.gather(*(_one(c.content) for c in chunks))


async def retrieve_chunks(
    session: AsyncSession,
    *,
    question: str,
    category: str | None = None,
    top_k: int = 5,
) -> list[tuple]:
    """生成问题向量，按 cosine 距离取 top_k chunk。

    返回 list[(PolicyChunk, similarity_score)]；下游负责拼 prompt 与组装 Citation。
    """
    embeddings = get_embeddings()
    query_vec = await embeddings.aembed_query(question)
    return await policy_repo.search_chunks_by_vector(
        session,
        query_embedding=query_vec,
        category=category,
        top_k=top_k,
    )
