"""访客模块 REST 接口。"""
from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import RedisDep
from app.schemas.visitor import HostMatchResponse
from app.services import visitor_service

router = APIRouter(prefix="/visitor", tags=["visitor"])


@router.get("/search-host", response_model=HostMatchResponse)
async def search_host(
    redis: RedisDep,
    q: str = Query("", min_length=0, max_length=64),
    limit: int = Query(8, ge=1, le=20),
) -> HostMatchResponse:
    """根据关键字（中文/拼音/缩写/部门/职位）模糊查找员工。"""
    matches = await visitor_service.search_host(redis, q.strip(), limit=limit)
    return HostMatchResponse(matches=matches)
