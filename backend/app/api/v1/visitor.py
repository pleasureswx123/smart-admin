"""访客模块 REST 接口。"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Query, UploadFile, status

from app.api.deps import RedisDep, SessionDep
from app.db.session import get_session_factory
from app.schemas.visitor import (
    HostMatchResponse,
    NotifyResponse,
    OcrCardResponse,
    VisitorListResponse,
    VisitorOut,
    VisitorRegisterRequest,
    VisitorStats,
    WeeklyTrendResponse,
)
from app.services import visitor_service

router = APIRouter(prefix="/visitor", tags=["visitor"])

# 名片图片白名单与上限（与制度文档上传保持一致风格）
_OCR_ALLOWED_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
_OCR_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


async def _notify_in_background(vid: UUID) -> None:
    """BackgroundTask 入口：自管会话，避免请求会话提前关闭。"""
    factory = get_session_factory()
    async with factory() as session:
        await visitor_service.notify_dingtalk(session, vid)


@router.get("/search-host", response_model=HostMatchResponse)
async def search_host(
    redis: RedisDep,
    q: str = Query("", min_length=0, max_length=64),
    limit: int = Query(8, ge=1, le=20),
) -> HostMatchResponse:
    """根据关键字（中文/拼音/缩写/部门/职位）模糊查找员工。"""
    matches = await visitor_service.search_host(redis, q.strip(), limit=limit)
    return HostMatchResponse(matches=matches)


@router.post("/ocr-card", response_model=OcrCardResponse)
async def ocr_card(file: UploadFile = File(...)) -> OcrCardResponse:
    """名片 OCR：multipart 上传，仅在内存处理后丢弃，不落盘。"""
    mime = (file.content_type or "").lower()
    if mime not in _OCR_ALLOWED_MIME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"仅支持 jpg/png/webp（收到 {mime or '未知'}）",
        )
    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="空文件")
    if len(data) > _OCR_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"图片过大（>{_OCR_MAX_BYTES // 1024 // 1024} MB）",
        )
    return await visitor_service.ocr_card(data, mime_type=mime)


@router.post("", response_model=VisitorOut, status_code=status.HTTP_201_CREATED)
async def register_visitor(
    payload: VisitorRegisterRequest,
    session: SessionDep,
    redis: RedisDep,
    background: BackgroundTasks,
) -> VisitorOut:
    """登记访客；后台异步触发钉钉通知（不阻塞返回）。"""
    try:
        rec = await visitor_service.register_visitor(session, redis, payload)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    background.add_task(_notify_in_background, rec.id)
    return visitor_service.to_visitor_out(rec)


@router.get("", response_model=VisitorListResponse)
async def list_visitors(
    session: SessionDep,
    status_filter: str | None = Query(None, alias="status", pattern="^(registered|entered|left)$"),
    search: str | None = Query(None, max_length=64),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> VisitorListResponse:
    items, total = await visitor_service.list_visitors_paged(
        session, status=status_filter, search=search, page=page, page_size=page_size
    )
    return VisitorListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/stats/today", response_model=VisitorStats)
async def stats_today(session: SessionDep) -> VisitorStats:
    return await visitor_service.get_today_stats(session)


@router.get("/stats/weekly-trend", response_model=WeeklyTrendResponse)
async def stats_weekly_trend(session: SessionDep) -> WeeklyTrendResponse:
    return await visitor_service.get_weekly_trend(session)


@router.get("/{vid}", response_model=VisitorOut)
async def get_visitor(vid: UUID, session: SessionDep) -> VisitorOut:
    from app.repositories import visitor as repo

    rec = await repo.get_visitor(session, vid)
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="访客记录不存在")
    return visitor_service.to_visitor_out(rec)


@router.post("/{vid}/check-in", response_model=VisitorOut)
async def check_in(vid: UUID, session: SessionDep) -> VisitorOut:
    try:
        rec = await visitor_service.check_in(session, vid)
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    return visitor_service.to_visitor_out(rec)


@router.post("/{vid}/check-out", response_model=VisitorOut)
async def check_out(vid: UUID, session: SessionDep) -> VisitorOut:
    try:
        rec = await visitor_service.check_out(session, vid)
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    return visitor_service.to_visitor_out(rec)


@router.post("/{vid}/notify", response_model=NotifyResponse)
async def notify(vid: UUID, session: SessionDep) -> NotifyResponse:
    """同步触发一次钉钉推送（用于失败后重试）。"""
    try:
        rec = await visitor_service.notify_dingtalk(session, vid)
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return NotifyResponse(push_status=rec.push_status, push_error=rec.push_error)
