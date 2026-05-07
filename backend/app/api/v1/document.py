"""公文 Copilot API：模板 / 草稿 / 审计 / 导出。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Header, HTTPException, Query, Response, status
from fastapi.responses import FileResponse, StreamingResponse

from app.api.deps import SessionDep
from app.core.config import settings
from app.repositories import document as doc_repo
from app.schemas.document import (
    AuditItem,
    AuditOnlyRequest,
    AuditOnlyResponse,
    DraftRead,
    DraftRequest,
    DraftResponse,
    ExportPdfResponse,
    SaveTemplateRequest,
    TemplateRead,
)
from app.services import document_service

router = APIRouter(prefix="/document", tags=["document"])
log = structlog.get_logger(__name__)


def _format_sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


@router.get("/templates", response_model=list[TemplateRead])
async def list_templates(
    session: SessionDep,
    type: Annotated[str | None, Query(description="按类型过滤")] = None,
) -> list[TemplateRead]:
    rows = await document_service.list_templates(session, type_=type)
    return [TemplateRead.model_validate(r) for r in rows]


@router.post(
    "/draft",
    responses={
        200: {
            "content": {
                "application/json": {"schema": DraftResponse.model_json_schema()},
                "text/event-stream": {},
            }
        }
    },
)
async def create_draft(
    session: SessionDep,
    payload: DraftRequest,
    accept: Annotated[str | None, Header()] = None,
) -> Response:
    """生成公文草稿（Reflective Writer），按 Accept 分流：
    - `text/event-stream` -> SSE（meta/stage/token/audit/done）
    - 其他 -> JSON `DraftResponse`
    """
    wants_stream = accept is not None and "text/event-stream" in accept.lower()
    if wants_stream:

        async def event_source():
            async for ev, data in document_service.stream_generate_draft(
                session,
                type_=payload.type,
                topic=payload.topic,
                keywords=payload.keywords,
                tone=payload.tone,
                template_id=payload.template_id,
            ):
                yield _format_sse(ev, data)

        return StreamingResponse(
            event_source(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    try:
        draft = await document_service.generate_draft(
            session,
            type_=payload.type,
            topic=payload.topic,
            keywords=payload.keywords,
            tone=payload.tone,
            template_id=payload.template_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    body = DraftResponse(
        draft_id=draft.id,
        content=draft.content,
        audit_feedback=[AuditItem.model_validate(it) for it in draft.audit_feedback],
        passed=draft.passed,
        rounds=draft.retry_count,
    )
    return Response(content=body.model_dump_json(), media_type="application/json")


@router.post("/audit", response_model=AuditOnlyResponse)
async def audit_only(payload: AuditOnlyRequest) -> AuditOnlyResponse:
    """对外部传入的草稿仅执行 auditor 节点。"""
    result = await document_service.audit_only(
        type_=payload.type, content=payload.content
    )
    return AuditOnlyResponse(
        audit_feedback=[AuditItem.model_validate(it) for it in result.get("audit_items", [])],
        passed=bool(result.get("passed")),
    )


@router.get("/drafts/{draft_id}", response_model=DraftRead)
async def get_draft(session: SessionDep, draft_id: UUID) -> DraftRead:
    draft = await doc_repo.get_draft(session, draft_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="草稿不存在")
    return DraftRead.model_validate(draft)


@router.post(
    "/{draft_id}/export-pdf", response_model=ExportPdfResponse
)
async def export_pdf(session: SessionDep, draft_id: UUID) -> ExportPdfResponse:
    """将草稿渲染为 PDF（Markdown -> HTML -> PDF via xhtml2pdf）。"""
    draft = await doc_repo.get_draft(session, draft_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="草稿不存在")
    return await document_service.export_draft_pdf(draft=draft)


@router.get("/exports/{file_name}")
async def download_pdf(file_name: str) -> FileResponse:
    """下载已生成的 PDF（仅允许 hex 文件名 + .pdf 后缀）。"""
    safe = Path(file_name).name
    if not safe.endswith(".pdf"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅支持 PDF")
    target = Path(settings.DOCUMENT_EXPORT_DIR) / safe
    if not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在")
    return FileResponse(target, media_type="application/pdf", filename=safe)


@router.post(
    "/{draft_id}/save-template",
    response_model=TemplateRead,
    status_code=status.HTTP_201_CREATED,
)
async def save_template(
    session: SessionDep, draft_id: UUID, payload: SaveTemplateRequest
) -> TemplateRead:
    """把当前草稿正文另存为用户模板（is_system=false）。"""
    draft = await doc_repo.get_draft(session, draft_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="草稿不存在")
    tpl = await doc_repo.create_template(
        session,
        type_=draft.type,
        name=payload.name,
        description=payload.description,
        body=draft.content,
        is_system=False,
    )
    await session.commit()
    return TemplateRead.model_validate(tpl)
