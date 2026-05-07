from __future__ import annotations

from redis.asyncio import ConnectionPool, Redis

from app.core.config import settings

_pool: ConnectionPool | None = None
_client: Redis | None = None


def init_redis() -> Redis:
    """在 FastAPI lifespan 启动阶段创建全局 Redis 客户端。"""
    global _pool, _client
    if _client is None:
        _pool = ConnectionPool.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            max_connections=20,
        )
        _client = Redis(connection_pool=_pool)
    return _client


async def dispose_redis() -> None:
    global _pool, _client
    if _client is not None:
        await _client.aclose()
        _client = None
    if _pool is not None:
        await _pool.disconnect()
        _pool = None


def get_redis() -> Redis:
    """FastAPI 依赖：返回单例 Redis 客户端。"""
    if _client is None:
        raise RuntimeError("Redis client not initialized. Call init_redis() first.")
    return _client
