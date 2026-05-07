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
    init_redis()
    log.info("app.startup", message="resources initialized")
    try:
        yield
    finally:
        await dispose_redis()
        await dispose_engine()
        log.info("app.shutdown", message="resources released")
