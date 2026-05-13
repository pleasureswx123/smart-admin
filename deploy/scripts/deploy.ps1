# =============================================================================
# deploy.ps1
# 本地一键部署脚本（Windows 11 PowerShell）。
# 既用于 **首次部署** 也用于 **迭代更新**，逻辑完全相同（首次部署会自动 seed）。
#
# 前置条件：
#   1. 已执行过 ./deploy/scripts/setup-ssh.ps1 完成 SSH 免密
#   2. 已在 deploy/server.env 准备好服务器端环境变量
#      （从 deploy/server.env.example 复制后按需修改）
#
# 使用方法：
#   pwsh ./deploy/scripts/deploy.ps1
#   或：powershell -ExecutionPolicy Bypass -File deploy/scripts/deploy.ps1
#
# 可选参数：
#   -SkipBuild        仅同步代码不重建镜像（应急用，慎用）
#   -RemoteHost x.x.x.x  覆盖默认服务器地址
# =============================================================================

param(
    [string]$RemoteHost = '192.168.10.130',
    [string]$RemoteUser = 'root',
    [string]$RemoteAppDir = '/opt/smart-admin',
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

# 切到仓库根目录（脚本位置 → ../../）
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $RepoRoot
Write-Host "==> 仓库根目录: $RepoRoot" -ForegroundColor Cyan
Write-Host "==> 目标: $RemoteUser@${RemoteHost}:$RemoteAppDir" -ForegroundColor Cyan

# ───── 1. 检查 server.env ─────
$ServerEnv = Join-Path $RepoRoot 'deploy\server.env'
if (-not (Test-Path $ServerEnv)) {
    Write-Host "✗ 未找到 deploy/server.env" -ForegroundColor Red
    Write-Host "  请执行: Copy-Item deploy/server.env.example deploy/server.env" -ForegroundColor Yellow
    Write-Host "  然后编辑 deploy/server.env，至少修改 APP_SECRET_KEY 与 POSTGRES_PASSWORD" -ForegroundColor Yellow
    exit 1
}

# ───── 2. 检查 SSH 免密 ─────
Write-Host "==> 检查 SSH 免密..." -ForegroundColor Cyan
& ssh -o BatchMode=yes -o ConnectTimeout=5 "$RemoteUser@$RemoteHost" 'echo ok' | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ SSH 免密未配置。请先执行: pwsh ./deploy/scripts/setup-ssh.ps1" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ SSH 免密正常" -ForegroundColor Green

# ───── 3. 打包源码（tar，使用 Windows 自带 bsdtar） ─────
$Tarball = Join-Path $env:TEMP 'smart-admin-deploy.tar.gz'
if (Test-Path $Tarball) { Remove-Item $Tarball -Force }

Write-Host "==> 打包源码到 $Tarball ..." -ForegroundColor Cyan
# tar 排除项：data/、node_modules、.venv、.git、.next、build、.env*、IDE / 构建缓存
$excludes = @(
    '--exclude=./data',
    '--exclude=./frontend/node_modules',
    '--exclude=./frontend/.next',
    '--exclude=./backend/.venv',
    '--exclude=./backend/data',
    '--exclude=./backend/__pycache__',
    '--exclude=./backend/.pytest_cache',
    '--exclude=./.git',
    '--exclude=./.idea',
    '--exclude=./.vscode',
    '--exclude=./*.tsbuildinfo',
    '--exclude=./.env',
    '--exclude=./.env.*',
    '--exclude=./deploy/server.env',
    '--exclude=*.pyc'
)
# 使用 cmd /c 调用 tar，避免 PowerShell 对 -- 参数的转义问题
$SystemTar = Join-Path $env:SystemRoot 'System32\tar.exe'
if (-not (Test-Path $SystemTar)) { $SystemTar = 'tar' }
$tarArgs = @('-czf', $Tarball) + $excludes + @('.')
& $SystemTar @tarArgs
if ($LASTEXITCODE -ne 0) { throw "tar 打包失败" }
$tarSize = [math]::Round((Get-Item $Tarball).Length / 1MB, 2)
Write-Host "  ✓ 打包完成，大小 ${tarSize} MB" -ForegroundColor Green

# ───── 4. 上传 tar 包 + server.env ─────
Write-Host "==> 上传 tar 包到服务器..." -ForegroundColor Cyan
& scp -o BatchMode=yes $Tarball "${RemoteUser}@${RemoteHost}:/tmp/smart-admin-deploy.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "scp 上传 tar 失败" }

Write-Host "==> 上传 server.env 作为远端 .env..." -ForegroundColor Cyan
# 先确保目录存在
& ssh "${RemoteUser}@${RemoteHost}" "mkdir -p $RemoteAppDir"
& scp -o BatchMode=yes $ServerEnv "${RemoteUser}@${RemoteHost}:$RemoteAppDir/.env"
if ($LASTEXITCODE -ne 0) { throw "scp 上传 server.env 失败" }

# ───── 5. 远端执行 remote-deploy.sh ─────
Write-Host "==> 远端执行部署脚本..." -ForegroundColor Cyan
# remote-deploy.sh 已经包含在 tar 里，先解压临时拷贝出来执行
$remoteScript = @"
set -e
APP_DIR=$RemoteAppDir
mkdir -p `$APP_DIR
# 提取部署脚本到 /tmp 以便首次部署也能跑
tar -xzf /tmp/smart-admin-deploy.tar.gz -C /tmp ./deploy/scripts/remote-deploy.sh
chmod +x /tmp/deploy/scripts/remote-deploy.sh
APP_DIR=`$APP_DIR TARBALL=/tmp/smart-admin-deploy.tar.gz /tmp/deploy/scripts/remote-deploy.sh
rm -rf /tmp/deploy
"@

& ssh "${RemoteUser}@${RemoteHost}" $remoteScript
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ 远端部署失败，请查看上方日志" -ForegroundColor Red
    exit 1
}

# ───── 6. 本地清理 ─────
Remove-Item $Tarball -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "✅ 部署完成！" -ForegroundColor Green
Write-Host "   访问地址: http://${RemoteHost}:8081" -ForegroundColor Green
Write-Host "   API 文档: http://${RemoteHost}:8081/api/v1/health" -ForegroundColor Green
Write-Host ""
Write-Host "运维命令："
Write-Host "  查看状态:  pwsh ./deploy/scripts/status.ps1"
Write-Host "  查看日志:  pwsh ./deploy/scripts/logs.ps1 backend"
Write-Host "  重跑 seed: pwsh ./deploy/scripts/seed.ps1"
