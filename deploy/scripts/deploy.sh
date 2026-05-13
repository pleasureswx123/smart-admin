#!/usr/bin/env bash
# =============================================================================
# deploy.sh
# 本地一键部署脚本（Git Bash / WSL / Linux / macOS）。
# 功能与 deploy.ps1 完全对等，推荐 Git Bash 用户使用本脚本。
#
# 前置条件：
#   1. 已完成 SSH 免密：ssh-copy-id root@192.168.10.130
#      （或执行 ./deploy/scripts/setup-ssh.ps1 一次）
#   2. 已准备 deploy/server.env（从 deploy/server.env.example 复制后修改）
#
# 使用方法：
#   bash ./deploy/scripts/deploy.sh
#   或：./deploy/scripts/deploy.sh   （需有可执行权限）
#
# 环境变量覆盖（可选）：
#   REMOTE_HOST=192.168.10.130
#   REMOTE_USER=root
#   REMOTE_APP_DIR=/opt/smart-admin
# =============================================================================
set -euo pipefail

# ───── 颜色输出 ─────
if [ -t 1 ]; then
  C_CYAN='\033[0;36m'; C_GREEN='\033[0;32m'; C_RED='\033[0;31m'; C_YELLOW='\033[0;33m'; C_RESET='\033[0m'
else
  C_CYAN=''; C_GREEN=''; C_RED=''; C_YELLOW=''; C_RESET=''
fi
info()  { printf "${C_CYAN}==> %s${C_RESET}\n" "$*"; }
ok()    { printf "${C_GREEN}  ✓ %s${C_RESET}\n" "$*"; }
warn()  { printf "${C_YELLOW}  %s${C_RESET}\n" "$*"; }
err()   { printf "${C_RED}✗ %s${C_RESET}\n" "$*" >&2; }

# ───── 参数 ─────
REMOTE_HOST="${REMOTE_HOST:-192.168.10.130}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/opt/smart-admin}"

# ───── 切到仓库根目录 ─────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"
info "仓库根目录: $REPO_ROOT"
info "目标: $REMOTE_USER@$REMOTE_HOST:$REMOTE_APP_DIR"

# ───── 1. 检查 server.env ─────
SERVER_ENV="$REPO_ROOT/deploy/server.env"
if [ ! -f "$SERVER_ENV" ]; then
  err "未找到 deploy/server.env"
  warn "请执行: cp deploy/server.env.example deploy/server.env"
  warn "然后编辑 deploy/server.env，至少修改 APP_SECRET_KEY 与 POSTGRES_PASSWORD"
  exit 1
fi

# ───── 2. 检查 SSH 免密 ─────
info "检查 SSH 免密..."
if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "$REMOTE_USER@$REMOTE_HOST" 'echo ok' >/dev/null 2>&1; then
  err "SSH 免密未配置"
  warn "请执行: ssh-copy-id $REMOTE_USER@$REMOTE_HOST"
  warn "或在 Windows PowerShell 执行: pwsh ./deploy/scripts/setup-ssh.ps1"
  exit 1
fi
ok "SSH 免密正常"

# ───── 3. 打包源码 ─────
# 在 Git Bash 下使用系统 tar（GNU tar 也能用，但要小心路径转换）。
# 把 tar 包写到 /tmp（Git Bash 会映射到 C:\Users\<user>\AppData\Local\Temp）。
TARBALL="/tmp/smart-admin-deploy.tar.gz"
[ -f "$TARBALL" ] && rm -f "$TARBALL"

info "打包源码到 $TARBALL ..."
EXCLUDES=(
  --exclude=./data
  --exclude=./frontend/node_modules
  --exclude=./frontend/.next
  --exclude=./backend/.venv
  --exclude=./backend/data
  --exclude=./backend/__pycache__
  --exclude=./backend/.pytest_cache
  --exclude=./.git
  --exclude=./.idea
  --exclude=./.vscode
  --exclude=./*.tsbuildinfo
  --exclude=./.env
  --exclude=./.env.*
  --exclude=./deploy/server.env
  --exclude=*.pyc
)
tar -czf "$TARBALL" "${EXCLUDES[@]}" .
TAR_SIZE_MB=$(du -m "$TARBALL" | awk '{print $1}')
ok "打包完成，大小 ${TAR_SIZE_MB} MB"

# ───── 4. 上传 tar 包 + server.env ─────
info "上传 tar 包到服务器..."
scp -o BatchMode=yes "$TARBALL" "$REMOTE_USER@$REMOTE_HOST:/tmp/smart-admin-deploy.tar.gz"

info "上传 server.env 作为远端 .env..."
ssh "$REMOTE_USER@$REMOTE_HOST" "mkdir -p $REMOTE_APP_DIR"
scp -o BatchMode=yes "$SERVER_ENV" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_APP_DIR/.env"

# ───── 5. 远端执行 remote-deploy.sh ─────
info "远端执行部署脚本..."
ssh "$REMOTE_USER@$REMOTE_HOST" bash -s <<EOF
set -e
APP_DIR=$REMOTE_APP_DIR
mkdir -p "\$APP_DIR"
# 从 tar 包中先提取 remote-deploy.sh（首次部署时 APP_DIR 还是空的）
tar -xzf /tmp/smart-admin-deploy.tar.gz -C /tmp ./deploy/scripts/remote-deploy.sh
chmod +x /tmp/deploy/scripts/remote-deploy.sh
APP_DIR="\$APP_DIR" TARBALL=/tmp/smart-admin-deploy.tar.gz /tmp/deploy/scripts/remote-deploy.sh
rm -rf /tmp/deploy
EOF

# ───── 6. 本地清理 ─────
rm -f "$TARBALL"

echo ""
printf "${C_GREEN}✅ 部署完成！${C_RESET}\n"
printf "${C_GREEN}   访问地址: http://%s:8081${C_RESET}\n" "$REMOTE_HOST"
printf "${C_GREEN}   健康检查: http://%s:8081/api/v1/health${C_RESET}\n" "$REMOTE_HOST"
echo ""
echo "运维命令（PowerShell）："
echo "  查看状态:  pwsh ./deploy/scripts/status.ps1"
echo "  查看日志:  pwsh ./deploy/scripts/logs.ps1 backend"
echo "  重跑 seed: pwsh ./deploy/scripts/seed.ps1"
echo ""
echo "或直接 SSH:"
echo "  ssh $REMOTE_USER@$REMOTE_HOST 'cd $REMOTE_APP_DIR && docker compose -f deploy/docker-compose.yml ps'"
