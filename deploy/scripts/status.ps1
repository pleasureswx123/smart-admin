# =============================================================================
# status.ps1 —— 远程查看容器状态与健康检查
# 用法: pwsh ./deploy/scripts/status.ps1
# =============================================================================
param(
    [string]$RemoteHost = '192.168.10.130',
    [string]$RemoteUser = 'root',
    [string]$RemoteAppDir = '/opt/smart-admin'
)
$ErrorActionPreference = 'Stop'

$cmd = @"
set -e
cd $RemoteAppDir
echo '==> docker compose ps:'
docker compose -f deploy/docker-compose.yml ps
echo ''
echo '==> backend 健康检查:'
docker inspect --format='{{.State.Health.Status}}' smart-admin-backend 2>/dev/null || echo 'N/A'
echo ''
echo '==> 磁盘占用:'
du -sh data/* 2>/dev/null || true
echo ''
echo '==> 对外访问地址: http://`$(hostname -I | awk '\''{print `$1}'\''):8081'
"@

& ssh "${RemoteUser}@${RemoteHost}" $cmd
