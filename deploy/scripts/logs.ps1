# =============================================================================
# logs.ps1 —— 远程跟踪容器日志
# 用法:
#   pwsh ./deploy/scripts/logs.ps1            # 全部服务，最近 200 行
#   pwsh ./deploy/scripts/logs.ps1 backend    # 仅 backend，实时跟踪
#   pwsh ./deploy/scripts/logs.ps1 nginx 500  # 指定服务 + 行数（不跟踪）
# =============================================================================
param(
    [string]$Service = '',
    [int]$Tail = 200,
    [switch]$NoFollow,
    [string]$RemoteHost = '192.168.10.130',
    [string]$RemoteUser = 'root',
    [string]$RemoteAppDir = '/opt/smart-admin'
)
$ErrorActionPreference = 'Stop'

$followFlag = if ($NoFollow -or -not $Service) { '' } else { '-f' }
$svcArg = if ($Service) { $Service } else { '' }

$cmd = "cd $RemoteAppDir && docker compose -f deploy/docker-compose.yml logs --tail=$Tail $followFlag $svcArg"
Write-Host "==> $cmd" -ForegroundColor Cyan
& ssh -t "${RemoteUser}@${RemoteHost}" $cmd
