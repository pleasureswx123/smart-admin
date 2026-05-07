"""公文模板/草稿仓储层。"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
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
