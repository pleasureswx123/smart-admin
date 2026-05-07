# syntax=docker/dockerfile:1.7

# ── 阶段 1：builder —— 含编译器，用于构建 pycairo 等需要 C 扩展的依赖 ──
FROM python:3.12-slim AS builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv

# 清华 apt 镜像
RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list

# 编译依赖：gcc + libcairo（pycairo 编译）+ libpq-dev（psycopg）+ pkg-config
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       gcc g++ pkg-config \
       libcairo2-dev libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /uvx /usr/local/bin/

WORKDIR /app
COPY pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY scripts ./scripts

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

# ── 阶段 2：runtime —— 只留运行时库，不含编译工具 ──
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:$PATH"

# 清华 apt 镜像
RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list

# 只装运行时库（无 -dev，无编译器）
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       curl ca-certificates libpq5 libcairo2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /uvx /usr/local/bin/

WORKDIR /app

# 从 builder 拷贝已编译好的 venv + 应用代码
COPY --from=builder /app/.venv  ./.venv
COPY --from=builder /app/app    ./app
COPY --from=builder /app/alembic ./alembic
COPY --from=builder /app/alembic.ini ./alembic.ini
COPY --from=builder /app/scripts ./scripts

RUN chmod +x ./scripts/entrypoint.sh

EXPOSE 8000

CMD ["./scripts/entrypoint.sh"]
