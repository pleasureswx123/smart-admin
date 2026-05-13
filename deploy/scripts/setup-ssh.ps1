# =============================================================================
# setup-ssh.ps1
# 一次性配置 SSH 免密登录到部署服务器，之后 deploy.ps1 即可无密码自动部署。
#
# 用法 A（交互式，推荐手动跑）：
#   pwsh ./deploy/scripts/setup-ssh.ps1
#   （执行过程中会要求输入一次服务器 root 密码）
#
# 用法 B（自动化，传入密码，便于 CI/无人值守）：
#   pwsh ./deploy/scripts/setup-ssh.ps1 -Password 'lbt@123.com'
#   （密码以明文参数形式传入，仅适合内网环境）
# =============================================================================

param(
    [string]$RemoteHost = '192.168.10.130',
    [string]$RemoteUser = 'root',
    [string]$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519",
    [string]$Password = ''
)

$ErrorActionPreference = 'Stop'

Write-Host "==> 目标服务器: $RemoteUser@$RemoteHost" -ForegroundColor Cyan

# 1) 确保 ~/.ssh 目录
$sshDir = Split-Path -Parent $KeyPath
if (-not (Test-Path $sshDir)) {
    New-Item -ItemType Directory -Path $sshDir -Force | Out-Null
    Write-Host "==> 已创建 $sshDir"
}

# 2) 若本地没有密钥则生成（ed25519）
if (-not (Test-Path $KeyPath)) {
    Write-Host "==> 本地未发现密钥，正在生成 ed25519 密钥对..." -ForegroundColor Yellow
    & ssh-keygen -t ed25519 -f $KeyPath -N '""' -C "smart-admin-deploy@$env:COMPUTERNAME"
    if ($LASTEXITCODE -ne 0) { throw "ssh-keygen 生成密钥失败" }
} else {
    Write-Host "==> 已存在本地密钥: $KeyPath"
}

$pubKeyPath = "$KeyPath.pub"
if (-not (Test-Path $pubKeyPath)) { throw "找不到公钥文件 $pubKeyPath" }
$pubKey = (Get-Content -Raw -Path $pubKeyPath).Trim()
Write-Host "==> 本地公钥指纹:"
& ssh-keygen -lf $pubKeyPath

# 3) 准备远端命令
$remoteCmd = @'
mkdir -p ~/.ssh && chmod 700 ~/.ssh && \
touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && \
grep -qxF "__PUBKEY__" ~/.ssh/authorized_keys || echo "__PUBKEY__" >> ~/.ssh/authorized_keys && \
echo "[remote] authorized_keys 行数: $(wc -l < ~/.ssh/authorized_keys)"
'@
$remoteCmd = $remoteCmd.Replace('__PUBKEY__', $pubKey)

# 4) 推送公钥
$askpassFile = $null
$prevAskpass = $env:SSH_ASKPASS
$prevAskpassRequire = $env:SSH_ASKPASS_REQUIRE
$prevDisplay = $env:DISPLAY

try {
    if ($Password) {
        Write-Host "==> 使用 -Password 参数自动推送公钥（SSH_ASKPASS 机制）" -ForegroundColor Yellow
        $askpassFile = Join-Path ([System.IO.Path]::GetTempPath()) ("askpass-" + [Guid]::NewGuid().ToString('N') + ".bat")
        "@echo off`r`necho $Password" | Out-File -Encoding ASCII -FilePath $askpassFile
        $env:SSH_ASKPASS = $askpassFile
        $env:SSH_ASKPASS_REQUIRE = 'force'
        $env:DISPLAY = ':0'
        $authArgs = @('-o','PreferredAuthentications=password','-o','PubkeyAuthentication=no')
    } else {
        Write-Host "==> 下一步将要求输入一次 root 密码" -ForegroundColor Yellow
        $authArgs = @()
    }

    & ssh -o StrictHostKeyChecking=accept-new @authArgs "$RemoteUser@$RemoteHost" $remoteCmd
    if ($LASTEXITCODE -ne 0) { throw "推送公钥失败（请检查密码 / 网络）" }
} finally {
    if ($askpassFile -and (Test-Path $askpassFile)) { Remove-Item $askpassFile -Force -ErrorAction SilentlyContinue }
    $env:SSH_ASKPASS = $prevAskpass
    $env:SSH_ASKPASS_REQUIRE = $prevAskpassRequire
    $env:DISPLAY = $prevDisplay
}

# 5) 验证免密登录
Write-Host ""
Write-Host "==> 验证免密登录（BatchMode）..." -ForegroundColor Cyan
& ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$RemoteUser@$RemoteHost" 'echo "[remote] 免密登录成功: $(hostname) / $(uname -sr)"'
if ($LASTEXITCODE -ne 0) {
    Write-Host "免密登录验证失败" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "SSH 免密配置完成。后续可直接执行: pwsh ./deploy/scripts/deploy.ps1" -ForegroundColor Green
