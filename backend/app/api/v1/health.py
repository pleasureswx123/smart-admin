from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter
from sqlalchemy import text

from app.ai.ark import get_chat_model, get_embeddings
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


@router.get("/health/ark")
async def health_ark() -> dict[str, Any]:
    """ARK 连通性探针：实际调用 chat + embedding。"""
    result: dict[str, Any] = {
        "chat_model": settings.ARK_CHAT_MODEL,
        "embedding_model": settings.ARK_EMBEDDING_MODEL,
        "configured_embedding_dim": settings.ARK_EMBEDDING_DIM,
    }

    try:
        chat = get_chat_model()
        reply = await chat.ainvoke("用一句话自我介绍")
        result["chat_reply"] = reply.content
    except Exception as exc:  # noqa: BLE001
        log.warning("health.ark.chat_failed", error=str(exc))
        result["chat_error"] = f"{exc.__class__.__name__}: {exc}"

    try:
        emb = get_embeddings()
        vec = await emb.aembed_query("smart-admin connectivity test")
        result["embedding_dim"] = len(vec)
        result["embedding_dim_match"] = len(vec) == settings.ARK_EMBEDDING_DIM
    except Exception as exc:  # noqa: BLE001
        log.warning("health.ark.embed_failed", error=str(exc))
        result["embedding_error"] = f"{exc.__class__.__name__}: {exc}"

    return result
