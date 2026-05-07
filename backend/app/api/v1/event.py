"""团建策划师 API：城市/活动选项、生成方案（SSE/JSON）、详情、PDF 导出。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated
from uuid import UUID

import structlog
from fastapi import APIRouter, Header, HTTPException, Response, status
from fastapi.responses import FileResponse, StreamingResponse

from app.api.deps import SessionDep
from app.core.config import settings
from app.schemas.event import (
    ActivityTypeItem,
    CityItem,
    ExportPdfResponse,
    PlanRead,
    PlanRequest,
)
from app.services import event_service

router = APIRouter(prefix="/event", tags=["event"])
log = structlog.get_logger(__name__)


def _format_sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


@router.get("/cities", response_model=list[CityItem])
async def list_cities() -> list[CityItem]:
    return [CityItem(**c) for c in event_service.CITIES]


@router.get("/activity-types", response_model=list[ActivityTypeItem])
async def list_activity_types() -> list[ActivityTypeItem]:
    return [ActivityTypeItem(**t) for t in event_service.ACTIVITY_TYPES]


@router.post(
    "/plan",
    responses={
        200: {
            "content": {
                "application/json": {"schema": PlanRead.model_json_schema()},
                "text/event-stream": {},
            }
        }
    },
)
async def generate_plan(
    session: SessionDep,
    payload: PlanRequest,
    accept: Annotated[str | None, Header()] = None,
) -> Response:
    """生成 A/B 团建方案，按 Accept 分流：
    - `text/event-stream` -> SSE（meta/node/plan/done）
    - 其他 -> JSON `PlanRead`
    """
    wants_stream = accept is not None and "text/event-stream" in accept.lower()
    if wants_stream:

        async def event_source():
            async for ev, data in event_service.stream_generate_plan(
                session,
                participants=payload.participants,
                per_capita_budget=payload.per_capita_budget,
                city=payload.city,
                activity_types=list(payload.activity_types),
            ):
                yield _format_sse(ev, data)

        return StreamingResponse(
            event_source(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # 同步 JSON 路径：消费完整流，最后查库返回
    plan_id: str | None = None
    async for ev, data in event_service.stream_generate_plan(
        session,
        participants=payload.participants,
        per_capita_budget=payload.per_capita_budget,
        city=payload.city,
        activity_types=list(payload.activity_types),
    ):
        if ev == "plan":
            plan_id = data.get("plan_id") or plan_id
        elif ev == "error":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=data.get("message") or "生成失败",
            )
    if not plan_id:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="未生成方案")
    plan = await event_service.get_plan(session, UUID(plan_id))
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="方案不存在")
    body = PlanRead.model_validate(plan)
    return Response(content=body.model_dump_json(), media_type="application/json")


@router.get("/plans/{plan_id}", response_model=PlanRead)
async def get_plan(session: SessionDep, plan_id: UUID) -> PlanRead:
    plan = await event_service.get_plan(session, plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="方案不存在")
    return PlanRead.model_validate(plan)


@router.post("/plans/{plan_id}/export-pdf", response_model=ExportPdfResponse)
async def export_pdf(session: SessionDep, plan_id: UUID) -> ExportPdfResponse:
    plan = await event_service.get_plan(session, plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="方案不存在")
    return await event_service.export_plan_pdf(plan=plan)


@router.get("/exports/{file_name}")
async def download_pdf(file_name: str) -> FileResponse:
    """下载团建方案 PDF（仅允许 .pdf 后缀，文件名做 basename 过滤）。"""
    safe = Path(file_name).name
    if not safe.endswith(".pdf"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅支持 PDF")
    target = Path(settings.EVENT_EXPORT_DIR) / safe
    if not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在")
    return FileResponse(target, media_type="application/pdf", filename=safe)
