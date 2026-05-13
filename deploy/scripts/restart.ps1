# =============================================================================
# restart.ps1 —— 远程重启服务（不重建镜像）
# 用法: pwsh ./deploy/scripts/restart.ps1            # 重启全部
#       pwsh ./deploy/scripts/restart.ps1 backend    # 仅重启 backend
# =============================================================================
param(
    [string]$Service = '',
    [string]$RemoteHost = '192.168.10.130',
    [string]$RemoteUser = 'root',
    [string]$RemoteAppDir = '/opt/smart-admin'
)
$ErrorActionPreference = 'Stop'

$svc = if ($Service) { $Service } else { '' }
$cmd = "cd $RemoteAppDir && docker compose -f deploy/docker-compose.yml restart $svc && docker compose -f deploy/docker-compose.yml ps"
Write-Host "==> $cmd" -ForegroundColor Cyan
& ssh "${RemoteUser}@${RemoteHost}" $cmd
