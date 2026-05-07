# syntax=docker/dockerfile:1.7
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv

# 系统依赖：libpq（asyncpg/psycopg），构建时编译需要 build-essential（pgvector 等纯 Python 不需要）
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates libpq5 \
    && rm -rf /var/lib/apt/lists/*

# 安装 uv（来自官方静态二进制）
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /uvx /usr/local/bin/

WORKDIR /app

# 先拷依赖文件以利用层缓存
COPY pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# 拷贝应用源码 + alembic 迁移目录与入口脚本
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY scripts ./scripts

# 入口脚本可执行
RUN chmod +x ./scripts/entrypoint.sh

# 同步项目自身（不再装依赖）
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

EXPOSE 8000

CMD ["./scripts/entrypoint.sh"]
