"""公文模板/草稿仓储层。"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import DocumentDraft, DocumentTemplate


async def list_templates(
    session: AsyncSession,
    *,
    type_: str | None = None,
    only_system: bool = False,
) -> list[DocumentTemplate]:
    stmt = select(DocumentTemplate).order_by(
        DocumentTemplate.is_system.desc(), DocumentTemplate.created_at.desc()
    )
    if type_ is not None:
        stmt = stmt.where(DocumentTemplate.type == type_)
    if only_system:
        stmt = stmt.where(DocumentTemplate.is_system.is_(True))
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_template(
    session: AsyncSession, template_id: UUID
) -> DocumentTemplate | None:
    return await session.get(DocumentTemplate, template_id)


async def create_template(
    session: AsyncSession,
    *,
    type_: str,
    name: str,
    description: str,
    body: str,
    is_system: bool = False,
) -> DocumentTemplate:
    tpl = DocumentTemplate(
        type=type_,
        name=name,
        description=description,
        body=body,
        is_system=is_system,
    )
    session.add(tpl)
    await session.flush()
    await session.refresh(tpl)
    return tpl


async def create_draft(
    session: AsyncSession, **fields: Any
) -> DocumentDraft:
    draft = DocumentDraft(**fields)
    session.add(draft)
    await session.flush()
    await session.refresh(draft)
    return draft


async def get_draft(
    session: AsyncSession, draft_id: UUID
) -> DocumentDraft | None:
    return await session.get(DocumentDraft, draft_id)


async def update_draft(
    session: AsyncSession, draft: DocumentDraft, **fields: Any
) -> DocumentDraft:
    for k, v in fields.items():
        setattr(draft, k, v)
    await session.flush()
    await session.refresh(draft)
    return draft


# ── 模板 CRUD ──────────────────────────────────────────────────────────────

async def update_template(
    session: AsyncSession,
    template_id: UUID,
    *,
    name: str | None = None,
    description: str | None = None,
    body: str | None = None,
) -> DocumentTemplate | None:
    """更新模板字段（仅修改传入的非 None 字段）。"""
    tpl = await session.get(DocumentTemplate, template_id)
    if tpl is None:
        return None
    if name is not None:
        tpl.name = name
    if description is not None:
        tpl.description = description
    if body is not None:
        tpl.body = body
    await session.flush()
    await session.refresh(tpl)
    return tpl


async def delete_template(
    session: AsyncSession, template_id: UUID
) -> DocumentTemplate | None:
    """删除单个模板；返回被删除记录（不存在则 None）。"""
    tpl = await session.get(DocumentTemplate, template_id)
    if tpl is None:
        return None
    await session.delete(tpl)
    await session.flush()
    return tpl


# ── 文档类型 CRUD（基于 template.type 字段聚合）────────────────────────────

async def list_types(session: AsyncSession) -> list[dict]:
    """返回各 type 的名称及对应模板数量（按 type 排序）。"""
    stmt = (
        select(DocumentTemplate.type, func.count(DocumentTemplate.id).label("template_count"))
        .group_by(DocumentTemplate.type)
        .order_by(DocumentTemplate.type)
    )
    result = await session.execute(stmt)
    return [{"type": row.type, "template_count": row.template_count} for row in result]


async def rename_type(
    session: AsyncSession, old_name: str, new_name: str
) -> int:
    """将所有 type=old_name 的模板改为 new_name；返回影响行数。"""
    stmt = (
        update(DocumentTemplate)
        .where(DocumentTemplate.type == old_name)
        .values(type=new_name)
    )
    result = await session.execute(stmt)
    await session.flush()
    return result.rowcount  # type: ignore[return-value]


async def delete_type(session: AsyncSession, type_name: str) -> int:
    """删除某类型下的所有模板；返回删除行数。"""
    stmt = delete(DocumentTemplate).where(DocumentTemplate.type == type_name)
    result = await session.execute(stmt)
    await session.flush()
    return result.rowcount  # type: ignore[return-value]
