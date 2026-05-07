"""\u56e2\u5efa\u670d\u52a1\u5c42\uff1a\u7f16\u6392 LangGraph \u8fd0\u884c\u3001\u843d\u5e93\u3001PDF \u5bfc\u51fa\u3002"""
from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.graphs.event_planner import run_event_planner, stream_event_planner
from app.core.config import settings
from app.models.event import EventPlan
from app.repositories import event as event_repo
from app.schemas.event import ExportPdfResponse

log = structlog.get_logger(__name__)

CITIES: list[dict] = [
    {"code": "BJ", "name": "\u5317\u4eac"},
    {"code": "SH", "name": "\u4e0a\u6d77"},
    {"code": "GZ", "name": "\u5e7f\u5dde"},
    {"code": "SZ", "name": "\u6df1\u5733"},
    {"code": "HZ", "name": "\u676d\u5dde"},
    {"code": "CD", "name": "\u6210\u90fd"},
    {"code": "WH", "name": "\u6b66\u6c49"},
    {"code": "NJ", "name": "\u5357\u4eac"},
]

ACTIVITY_TYPES: list[dict] = [
    {"id": "bbq", "label": "\u70e7\u70e4"},
    {"id": "outdoor", "label": "\u6237\u5916"},
    {"id": "script", "label": "\u5267\u672c\u6740"},
    {"id": "camping", "label": "\u9732\u8425"},
    {"id": "indoor", "label": "\u5ba4\u5185"},
    {"id": "party", "label": "\u6d3e\u5bf9"},
]


async def stream_generate_plan(
    session: AsyncSession,
    *,
    participants: int,
    per_capita_budget: int,
    city: str,
    activity_types: list[str],
    session_id: str | None = None,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """\u4e0e graph \u4e00\u81f4\u7684\u4e8b\u4ef6\u6d41\uff1bplan \u4e8b\u4ef6\u5728\u843d\u5e93\u540e\u8865\u4e0a plan_id\uff0cdone \u540c\u6b65\u8865 plan_id\u3002"""
    started = time.perf_counter()
    plan_a: dict = {}
    plan_b: dict = {}
    final_state: dict = {}
    retries = 0
    success = False
    error: str | None = None

    try:
        async for ev, data in stream_event_planner(
            participants=participants,
            per_capita_budget=per_capita_budget,
            city=city,
            activity_types=activity_types,
            session_id=session_id,
        ):
            if ev == "plan":
                plan_a = data["plan_a"]
                plan_b = data["plan_b"]
                # \u843d\u5e93\u540e\u4e0b\u53d1 plan_id
                plan = await event_repo.create_plan(
                    session,
                    participants=participants,
                    per_capita_budget=per_capita_budget,
                    city=city,
                    activity_types=activity_types,
                    plan_a=plan_a,
                    plan_b=plan_b,
                )
                await session.commit()
                yield "plan", {**data, "plan_id": str(plan.id)}
                continue
            if ev == "done":
                final_state = data.get("final_state") or {}
                retries = data.get("retries", 0)
                success = True
                # \u8865\u5145 plan_id
                yield "done", {**data, "plan_id": str(plan.id) if "plan" in locals() and plan else ""}
                continue
            yield ev, data
    except Exception as exc:  # noqa: BLE001
        error = str(exc)
        log.exception("event.stream.failed")
        yield "error", {"message": error}

    duration_ms = int((time.perf_counter() - started) * 1000)
    plan_id_for_run: UUID | None = locals().get("plan").id if locals().get("plan") else None
    if plan_id_for_run is not None:
        await event_repo.create_run(
            session,
            plan_id=plan_id_for_run,
            final_state=final_state,
            total_retries=retries,
            duration_ms=duration_ms,
            success=success,
            error=error,
        )
        await session.commit()


async def get_plan(session: AsyncSession, plan_id: UUID) -> EventPlan | None:
    return await event_repo.get_plan(session, plan_id)


# ============================================================
# PDF \u5bfc\u51fa
# ============================================================
_PDF_HTML = """<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page {{ size: A4; margin: 1.8cm 1.8cm 1.8cm 1.8cm; }}
    body {{ font-family: "SimSun", "Songti SC", serif; font-size: 11pt; line-height: 1.6; color: #111; }}
    h1 {{ text-align: center; font-size: 20pt; margin: 6pt 0 14pt 0; }}
    h2 {{ font-size: 15pt; border-bottom: 1px solid #888; padding-bottom: 4pt; margin: 16pt 0 8pt 0; }}
    h3 {{ font-size: 13pt; margin: 12pt 0 4pt 0; }}
    .meta {{ color: #444; margin-bottom: 8pt; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 6pt; }}
    th, td {{ border: 1px solid #888; padding: 4pt 6pt; font-size: 10pt; }}
    th {{ background: #eee; }}
    .right {{ text-align: right; }}
    .total-row td {{ background: #f4f4f4; font-weight: bold; }}
    .footer {{ text-align: right; color: #666; font-size: 10pt; margin-top: 18pt; }}
  </style>
</head>
<body>
<h1>\u56e2\u5efa\u65b9\u6848\u6c47\u603b</h1>
<p class="meta">\u57ce\u5e02\uff1a{city} \u3000 \u4eba\u6570\uff1a{participants} \u3000 \u4eba\u5747\u9884\u7b97\uff1a\u00a5{per_capita_budget} \u3000 \u603b\u9884\u7b97\uff1a\u00a5{cap}</p>
<p class="meta">\u6d3b\u52a8\u7c7b\u578b\uff1a{activity_types}</p>
{plans_html}
<div class="footer">\u65b9\u6848 ID\uff1a{plan_id}</div>
</body>
</html>"""


def _render_plan_section(title: str, plan: dict) -> str:
    name = plan.get("name", "")
    desc = plan.get("description", "")
    schedule = plan.get("schedule") or []
    venues = plan.get("venues") or []
    budget = plan.get("budget") or []
    total = int(plan.get("total") or 0)

    sched_rows = "".join(
        f"<tr><td>{s.get('time','')}</td><td>{s.get('activity','')}</td>"
        f"<td>{s.get('location','')}</td></tr>"
        for s in schedule
    )
    venue_rows = "".join(
        f"<tr><td>{v.get('name','')}</td><td>{v.get('address','')}</td>"
        f"<td>{v.get('phone','')}</td><td class='right'>{v.get('rating',0)}</td></tr>"
        for v in venues
    )
    budget_rows = "".join(
        f"<tr><td>{b.get('item','')}</td><td class='right'>{b.get('unit_price',0)}</td>"
        f"<td class='right'>{b.get('quantity',0)}</td><td class='right'>{b.get('total',0)}</td></tr>"
        for b in budget
    )
    total_row = (
        f"<tr class='total-row'><td colspan='3' class='right'>\u5408\u8ba1</td>"
        f"<td class='right'>{total}</td></tr>"
    )
    return (
        f"<h2>{title}\uff1a{name}</h2>"
        f"<p>{desc}</p>"
        f"<h3>\u884c\u7a0b\u5b89\u6392</h3>"
        f"<table><thead><tr><th>\u65f6\u95f4</th><th>\u6d3b\u52a8</th><th>\u5730\u70b9</th></tr></thead>"
        f"<tbody>{sched_rows or '<tr><td colspan=3>\u65e0</td></tr>'}</tbody></table>"
        f"<h3>\u573a\u5730/\u9910\u5385</h3>"
        f"<table><thead><tr><th>\u540d\u79f0</th><th>\u5730\u5740</th><th>\u7535\u8bdd</th><th>\u8bc4\u5206</th></tr></thead>"
        f"<tbody>{venue_rows or '<tr><td colspan=4>\u65e0</td></tr>'}</tbody></table>"
        f"<h3>\u9884\u7b97\u660e\u7ec6\uff08\u5143\uff09</h3>"
        f"<table><thead><tr><th>\u9879\u76ee</th><th>\u5355\u4ef7</th><th>\u6570\u91cf</th><th>\u5c0f\u8ba1</th></tr></thead>"
        f"<tbody>{budget_rows}{total_row}</tbody></table>"
    )


def _render_pdf_sync(html: str, target: Path) -> int:
    from xhtml2pdf import pisa

    with target.open("wb") as fh:
        result = pisa.CreatePDF(src=html, dest=fh, encoding="utf-8")
    if result.err:
        raise RuntimeError(f"PDF \u6e32\u67d3\u5931\u8d25\uff1a{result.err} \u4e2a\u9519\u8bef")
    return target.stat().st_size


async def export_plan_pdf(*, plan: EventPlan) -> ExportPdfResponse:
    export_dir = Path(settings.EVENT_EXPORT_DIR)
    export_dir.mkdir(parents=True, exist_ok=True)

    plans_html = (
        _render_plan_section("\u4e3b\u9009\u65b9\u6848 A", plan.plan_a or {})
        + _render_plan_section("\u5907\u9009\u65b9\u6848 B", plan.plan_b or {})
    )
    cap = plan.participants * plan.per_capita_budget
    types = " / ".join(plan.activity_types or [])
    html = _PDF_HTML.format(
        city=plan.city,
        participants=plan.participants,
        per_capita_budget=plan.per_capita_budget,
        cap=cap,
        activity_types=types,
        plans_html=plans_html,
        plan_id=str(plan.id),
    )
    file_name = f"{plan.id.hex}.pdf"
    target = export_dir / file_name
    size = await asyncio.to_thread(_render_pdf_sync, html, target)
    download_url = f"/api/v1/event/exports/{file_name}"
    log.info("event.export_pdf", plan_id=str(plan.id), file_path=str(target), size=size)
    return ExportPdfResponse(
        download_url=download_url,
        file_path=str(target),
        size_bytes=size,
    )
