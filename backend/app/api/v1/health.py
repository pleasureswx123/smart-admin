from __future__ import annotations

import structlog
from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import RedisDep, SessionDep
from app.core.config import settings

router = APIRouter(tags=["health"])
log = structlog.get_logger(__name__)


@router.get("/health")
async def health(session: SessionDep, redis: RedisDep) -> dict[str, str]:
    """探活：检查 DB / Redis / 火山配置是否就绪。"""
    db_status = "ok"
    try:
        await session.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001
        log.warning("health.db_failed", error=str(exc))
        db_status = f"error: {exc.__class__.__name__}"

    redis_status = "ok"
    try:
        pong = await redis.ping()
        if not pong:
            redis_status = "error: ping returned falsy"
    except Exception as exc:  # noqa: BLE001
        log.warning("health.redis_failed", error=str(exc))
        redis_status = f"error: {exc.__class__.__name__}"

    ark_status = "ok" if settings.ARK_API_KEY else "missing ARK_API_KEY"

    return {"db": db_status, "redis": redis_status, "ark": ark_status}
