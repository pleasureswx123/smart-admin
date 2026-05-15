"""公文 Copilot 服务层：模板查询、Reflective Writer 编排、草稿持久化、PDF 导出。"""
from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.graphs.doc_reflective import (
    node_auditor,
    run_doc_reflective,
    stream_doc_reflective,
)
from app.core.config import settings
from app.models.document import DocumentDraft, DocumentTemplate
from app.repositories import document as doc_repo
from app.schemas.document import ExportPdfResponse

logger = structlog.get_logger(__name__)


async def list_templates(
    session: AsyncSession, *, type_: str | None = None
) -> list[DocumentTemplate]:
    return await doc_repo.list_templates(session, type_=type_)


async def get_template(
    session: AsyncSession, template_id: UUID
) -> DocumentTemplate | None:
    return await doc_repo.get_template(session, template_id)


async def _resolve_template_body(
    session: AsyncSession,
    *,
    type_: str,
    template_id: UUID | None,
) -> tuple[DocumentTemplate, str]:
    """返回 (template, body)。template_id 缺省时取该 type 下首个系统模板。"""
    if template_id is not None:
        tpl = await doc_repo.get_template(session, template_id)
        if tpl is None:
            raise ValueError(f"模板不存在：{template_id}")
        return tpl, tpl.body
    candidates = await doc_repo.list_templates(session, type_=type_, only_system=True)
    if not candidates:
        raise ValueError(f"未找到 type={type_} 的系统模板")
    tpl = candidates[0]
    return tpl, tpl.body


async def generate_draft(
    session: AsyncSession,
    *,
    type_: str,
    topic: str,
    keywords: list[str],
    tone: str,
    template_id: UUID | None = None,
    user_id: UUID | None = None,
) -> DocumentDraft:
    """非流式：跑 Reflective Writer 全流程并落库。"""
    tpl, body = await _resolve_template_body(
        session, type_=type_, template_id=template_id
    )
    final = await run_doc_reflective(
        type_=type_,
        topic=topic,
        keywords=keywords,
        tone=tone,
        template_body=body,
    )
    draft = await doc_repo.create_draft(
        session,
        user_id=user_id,
        template_id=tpl.id,
        type=type_,
        topic=topic,
        keywords=keywords,
        tone=tone,
        content=final.get("content", ""),
        audit_feedback=final.get("audit_items", []),
        retry_count=int(final.get("retry_count", 0)),
        passed=bool(final.get("passed")),
    )
    await session.commit()
    logger.info(
        "document.generate_draft",
        draft_id=str(draft.id),
        type=type_,
        rounds=draft.retry_count,
        passed=draft.passed,
    )
    return draft


async def stream_generate_draft(
    session: AsyncSession,
    *,
    type_: str,
    topic: str,
    keywords: list[str],
    tone: str,
    template_id: UUID | None = None,
    user_id: UUID | None = None,
    session_id: str | None = None,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """流式：转发 graph 事件并在 done 前落库；最后一个事件附 draft_id。"""
    tpl, body = await _resolve_template_body(
        session, type_=type_, template_id=template_id
    )
    final_content = ""
    final_items: list[dict] = []
    final_passed = False
    final_rounds = 0

    async for event_name, data in stream_doc_reflective(
        type_=type_,
        topic=topic,
        keywords=keywords,
        tone=tone,
        template_body=body,
        session_id=session_id,
    ):
        if event_name == "stage" and data.get("node") == "writer" and data.get("status") == "loading":
            final_content = ""
        elif event_name == "token":
            final_content += data.get("delta", "")
        elif event_name == "audit":
            final_items = data.get("items") or []
            final_passed = bool(data.get("passed"))
            final_rounds = int(data.get("round") or final_rounds)
        if event_name == "done":
            # 在 done 之前持久化，再附 draft_id 一并返回
            draft = await doc_repo.create_draft(
                session,
                user_id=user_id,
                template_id=tpl.id,
                type=type_,
                topic=topic,
                keywords=keywords,
                tone=tone,
                content=final_content,
                audit_feedback=final_items,
                retry_count=final_rounds,
                passed=final_passed,
            )
            await session.commit()
            data = {**data, "draft_id": str(draft.id)}
            logger.info(
                "document.stream_generate_draft",
                draft_id=str(draft.id),
                type=type_,
                rounds=final_rounds,
                passed=final_passed,
            )
        yield event_name, data


async def audit_only(
    *, type_: str, content: str
) -> dict[str, Any]:
    """单独跑 auditor，不写库。"""
    state = {"type": type_, "topic": "", "content": content, "retry_count": 0}
    return await node_auditor(state)  # {audit_items, passed}



_PDF_HTML_TEMPLATE = """<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page {{ size: A4; margin: 2.2cm 2.2cm 2.2cm 2.2cm; }}
    body {{ font-family: "SimSun", "Songti SC", serif; font-size: 12pt; line-height: 1.7; color: #000; }}
    h1 {{ text-align: center; font-size: 20pt; margin: 8pt 0 16pt 0; }}
    h2 {{ font-size: 15pt; margin: 14pt 0 6pt 0; }}
    h3 {{ font-size: 13pt; margin: 10pt 0 4pt 0; }}
    p, li {{ text-indent: 2em; margin: 4pt 0; }}
    ul, ol {{ margin: 4pt 0 4pt 1.5em; }}
    blockquote {{ margin: 4pt 1em; color: #444; }}
    .meta {{ text-align: right; color: #666; font-size: 10pt; margin-top: 24pt; }}
  </style>
</head>
<body>
{body}
<div class="meta">草稿 ID：{draft_id} ｜ 生成时间：{created_at}</div>
</body>
</html>"""


def _render_pdf(html: str, target: Path) -> int:
    """同步渲染 HTML -> PDF；用 xhtml2pdf。返回字节数。"""
    from xhtml2pdf import pisa

    with target.open("wb") as fh:
        result = pisa.CreatePDF(src=html, dest=fh, encoding="utf-8")
    if result.err:
        raise RuntimeError(f"PDF 渲染失败：{result.err} 个错误")
    return target.stat().st_size


async def export_draft_pdf(*, draft: DocumentDraft) -> ExportPdfResponse:
    """把草稿 Markdown 渲染为 PDF，落在 settings.DOCUMENT_EXPORT_DIR。"""
    import asyncio

    import markdown as md_lib

    export_dir = Path(settings.DOCUMENT_EXPORT_DIR)
    export_dir.mkdir(parents=True, exist_ok=True)

    body_html = md_lib.markdown(
        draft.content or "", extensions=["extra", "sane_lists"]
    )
    html = _PDF_HTML_TEMPLATE.format(
        body=body_html,
        draft_id=str(draft.id),
        created_at=draft.created_at.isoformat(timespec="seconds"),
    )

    file_name = f"{draft.id.hex}.pdf"
    target = export_dir / file_name
    size = await asyncio.to_thread(_render_pdf, html, target)
    download_url = f"/api/v1/document/exports/{file_name}"
    logger.info(
        "document.export_pdf",
        draft_id=str(draft.id),
        file_path=str(target),
        size=size,
    )
    return ExportPdfResponse(
        download_url=download_url,
        file_path=str(target),
        size_bytes=size,
    )
