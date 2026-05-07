from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from app.cache.redis import dispose_redis, init_redis
from app.core.logging import configure_logging
from app.db.session import dispose_engine, init_engine

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """FastAPI 生命周期：启动时初始化 DB / Redis，关闭时释放。"""
    configure_logging()
    init_engine()
    redis = init_redis()
    # 启动时把员工通讯录加载到 Redis 拼音倒排索引（失败不影响启动）
    try:
        from app.services.visitor_service import rebuild_index_from_db
        count = await rebuild_index_from_db(redis)
        log.info("app.startup.visitor_index", employees=count)
    except Exception as e:  # pragma: no cover - 启动期容错
        log.warning("app.startup.visitor_index.failed", error=str(e))
    log.info("app.startup", message="resources initialized")
    try:
        yield
    finally:
        await dispose_redis()
        await dispose_engine()
        log.info("app.shutdown", message="resources released")
