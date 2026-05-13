# =============================================================================
# seed.ps1 —— 远程重新执行种子数据脚本（幂等，可重复运行）
# 用法: pwsh ./deploy/scripts/seed.ps1
#       pwsh ./deploy/scripts/seed.ps1 -Only policy   # 仅 policy
#       pwsh ./deploy/scripts/seed.ps1 -Only document # 仅 document
# =============================================================================
param(
    [ValidateSet('all','policy','document')]
    [string]$Only = 'all',
    [string]$RemoteHost = '192.168.10.130',
    [string]$RemoteUser = 'root',
    [string]$RemoteAppDir = '/opt/smart-admin'
)
$ErrorActionPreference = 'Stop'

$lines = @("set -e", "cd $RemoteAppDir")
if ($Only -in @('all','policy')) {
    $lines += "echo '==> seed_policy.py'; docker compose -f deploy/docker-compose.yml exec -T backend uv run --no-sync python scripts/seed_policy.py"
}
if ($Only -in @('all','document')) {
    $lines += "echo '==> seed_document.py'; docker compose -f deploy/docker-compose.yml exec -T backend uv run --no-sync python scripts/seed_document.py"
}
$cmd = $lines -join " && "

& ssh "${RemoteUser}@${RemoteHost}" $cmd
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ seed 完成" -ForegroundColor Green
} else {
    Write-Host "✗ seed 失败" -ForegroundColor Red
    exit 1
}
