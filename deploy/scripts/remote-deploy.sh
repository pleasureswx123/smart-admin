#!/usr/bin/env bash
# =============================================================================
# remote-deploy.sh
# 在部署服务器（Ubuntu 24.04）上执行的部署脚本，由本地 deploy.ps1 通过 ssh 调起。
# 工作流：
#   1. 在 /opt/smart-admin 解压新代码（保留 .env / data/ 不动）
#   2. docker compose build --pull → up -d
#   3. 等待 backend 健康检查通过
#   4. 首次部署自动执行 seed_policy.py + seed_document.py（带幂等性）
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/smart-admin}"
TARBALL="${TARBALL:-/tmp/smart-admin-deploy.tar.gz}"
COMPOSE_FILE="$APP_DIR/deploy/docker-compose.yml"
FIRST_RUN_FLAG="$APP_DIR/.deploy/first-run.done"
LOG_PREFIX="[remote-deploy]"

log() { echo "$LOG_PREFIX $*"; }

# ───── 1. 依赖检查 ─────
log "检查 docker / docker compose ..."
if ! command -v docker >/dev/null 2>&1; then
  log "未检测到 docker，正在安装（apt）..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y docker.io docker-compose-v2
  systemctl enable --now docker
fi
docker --version
docker compose version

# ───── 2. 准备目录 ─────
log "准备目录 $APP_DIR ..."
mkdir -p "$APP_DIR" "$APP_DIR/.deploy"
mkdir -p "$APP_DIR/data/postgres" "$APP_DIR/data/redis"
mkdir -p "$APP_DIR/data/knowledge_base" "$APP_DIR/data/uploads" "$APP_DIR/data/exports" "$APP_DIR/data/logs"

# ───── 3. 备份当前 .env（如存在）后解压 ─────
if [ ! -f "$TARBALL" ]; then
  log "错误：tar 包不存在 $TARBALL" >&2
  exit 1
fi

log "解压代码包到 $APP_DIR （--keep-newer-files 防止误覆盖 .env / data/）..."
# .env 和 data/ 不在 tar 包中（本地 deploy.ps1 已排除），所以直接解压安全
tar -xzf "$TARBALL" -C "$APP_DIR"
rm -f "$TARBALL"

# ───── 4. 确认 .env 存在（由 deploy.ps1 单独上传） ─────
if [ ! -f "$APP_DIR/.env" ]; then
  log "错误：$APP_DIR/.env 不存在，请先在本地准备 deploy/server.env" >&2
  exit 1
fi

# ───── 5. 构建并启动容器 ─────
cd "$APP_DIR"
log "docker compose build --pull ..."
docker compose -f "$COMPOSE_FILE" build --pull

log "docker compose up -d ..."
docker compose -f "$COMPOSE_FILE" up -d

# ───── 6. 等待 backend 健康检查通过 ─────
log "等待 backend 健康检查（最长 180s）..."
for i in $(seq 1 36); do
  status=$(docker inspect --format='{{.State.Health.Status}}' smart-admin-backend 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ]; then
    log "backend 已 healthy ✓"
    break
  fi
  if [ "$i" = "36" ]; then
    log "backend 未在 180s 内 healthy，最后状态: $status"
    log "最近日志："
    docker compose -f "$COMPOSE_FILE" logs --tail=80 backend || true
    exit 1
  fi
  sleep 5
done

# ───── 7. 首次部署 → seed 数据 ─────
if [ ! -f "$FIRST_RUN_FLAG" ]; then
  log "首次部署：执行 seed_policy.py 与 seed_document.py（幂等）..."
  docker compose -f "$COMPOSE_FILE" exec -T backend uv run --no-sync python scripts/seed_policy.py || {
    log "seed_policy.py 失败（请检查 ARK_API_KEY 是否正确）"
    exit 1
  }
  docker compose -f "$COMPOSE_FILE" exec -T backend uv run --no-sync python scripts/seed_document.py || {
    log "seed_document.py 失败"
    exit 1
  }
  touch "$FIRST_RUN_FLAG"
  log "✓ seed 完成，已写入首次部署标记"
else
  log "非首次部署，跳过 seed（迁移已由 entrypoint.sh 自动执行）"
fi

# ───── 8. 状态汇总 ─────
log "当前容器状态:"
docker compose -f "$COMPOSE_FILE" ps

log ""
log "✅ 部署完成。访问地址: http://$(hostname -I | awk '{print $1}'):8081"
