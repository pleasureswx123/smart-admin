#!/usr/bin/env sh
# 容器启动入口：先做迁移与必要的初始化，再启 uvicorn。
set -e

echo "[entrypoint] running alembic upgrade head ..."
uv run --no-sync alembic upgrade head

echo "[entrypoint] starting uvicorn ..."
exec uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'
