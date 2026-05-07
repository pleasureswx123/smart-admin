"""访客模块 REST 接口。"""
from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status

from app.api.deps import RedisDep
from app.schemas.visitor import HostMatchResponse, OcrCardResponse
from app.services import visitor_service

router = APIRouter(prefix="/visitor", tags=["visitor"])

# 名片图片白名单与上限（与制度文档上传保持一致风格）
_OCR_ALLOWED_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
_OCR_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


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
