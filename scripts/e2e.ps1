<#
.SYNOPSIS
  Smart-Admin 32 端点 E2E 冒烟脚本（PowerShell 7+ / Windows PowerShell 5.1）

.DESCRIPTION
  按 health -> policy -> document -> visitor -> event 顺序串行调用全部 32 个后端端点关键路径，
  每步输出 [PASS]/[FAIL]/[SKIP]，结束打印汇总。任何失败都不会中断后续测试。
  复用 backend/scripts/sample_policy.md 作为知识库样本，名片 OCR 默认 SKIP（除非 -CardImage 指定）。

.EXAMPLE
  pwsh ./scripts/e2e.ps1
  pwsh ./scripts/e2e.ps1 -BaseUrl http://127.0.0.1:8000 -CardImage backend/test_card.jpg
#>
[CmdletBinding()]
param(
  [string]$BaseUrl = "http://127.0.0.1:8000",
  [string]$SamplePolicy = "backend/scripts/sample_policy.md",
  [string]$CardImage = "",
  [int]$SseTimeoutSec = 120
)

$ErrorActionPreference = "Continue"
$script:Results = @()

function Step {
  param(
    [Parameter(Mandatory)] [string]$Name,
    [Parameter(Mandatory)] [scriptblock]$Block
  )
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $value = & $Block
    $sw.Stop()
    Write-Host ("[PASS {0,5}ms] {1}" -f $sw.ElapsedMilliseconds, $Name) -ForegroundColor Green
    $script:Results += [pscustomobject]@{ name=$Name; status="PASS"; ms=$sw.ElapsedMilliseconds; err="" }
    return $value
  } catch {
    $sw.Stop()
    $msg = $_.Exception.Message
    if ($msg.Length -gt 180) { $msg = $msg.Substring(0,180) + "..." }
    Write-Host ("[FAIL {0,5}ms] {1}  -> {2}" -f $sw.ElapsedMilliseconds, $Name, $msg) -ForegroundColor Red
    $script:Results += [pscustomobject]@{ name=$Name; status="FAIL"; ms=$sw.ElapsedMilliseconds; err=$msg }
    return $null
  }
}

function Skip {
  param([string]$Name, [string]$Why)
  Write-Host ("[SKIP       ] {0}  -> {1}" -f $Name, $Why) -ForegroundColor Yellow
  $script:Results += [pscustomobject]@{ name=$Name; status="SKIP"; ms=0; err=$Why }
}

function Get-Json { param([string]$Path) Invoke-RestMethod -Uri "$BaseUrl$Path" -Method GET }
function Post-Json {
  param([string]$Path, $Body, [int]$ExpectStatus = 0)
  $json = if ($null -eq $Body) { "" } else { ($Body | ConvertTo-Json -Depth 10 -Compress) }
  Invoke-RestMethod -Uri "$BaseUrl$Path" -Method POST -ContentType "application/json" -Body $json
}
function Delete-Path { param([string]$Path) Invoke-RestMethod -Uri "$BaseUrl$Path" -Method DELETE }

function Consume-Sse {
  # 用 curl.exe 消费 SSE 流，等待 done/error/end 事件后返回所有原始 frame 行
  param([string]$Path, $Body, [int]$Timeout = 60)
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    $json = ($Body | ConvertTo-Json -Depth 10 -Compress)
    & curl.exe -sS --max-time $Timeout -N `
      -H "Content-Type: application/json" -H "Accept: text/event-stream" `
      -X POST "$BaseUrl$Path" -d $json -o $tmp 2>$null
    return Get-Content $tmp -Raw
  } finally {
    Remove-Item $tmp -ErrorAction SilentlyContinue
  }
}

Write-Host "=== Smart-Admin E2E ($BaseUrl) ===" -ForegroundColor Cyan
Write-Host ("Started at {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))

# 1) Health (2)
Step "GET  /health"     { $r = Get-Json "/api/v1/health";     if ($r.db -ne 'ok') { throw "db=$($r.db)" } }
Step "GET  /health/ark" { $r = Get-Json "/api/v1/health/ark"; if (-not $r.ok)    { throw "ark not ok: $($r | ConvertTo-Json -Compress)" } }

# 2) Policy (7)
$script:fileId = $null
Step "POST /policy/files (upload md)" {
  if (-not (Test-Path $SamplePolicy)) { throw "sample not found: $SamplePolicy" }
  $form = @{ file = Get-Item $SamplePolicy; category = "考勤"; access_level = "public" }
  $r = Invoke-RestMethod -Uri "$BaseUrl/api/v1/policy/files" -Method POST -Form $form
  $script:fileId = $r.id
  if (-not $script:fileId) { throw "no id in response" }
}
Step "GET  /policy/files"           { $r = Get-Json "/api/v1/policy/files?limit=10"; if ($r.Count -lt 1) { throw "empty list" } }
Step "GET  /policy/files/{id}"      { if (-not $script:fileId) { throw "skip: no fileId" }; Get-Json "/api/v1/policy/files/$($script:fileId)" | Out-Null }
Step "GET  /policy/categories"      { Get-Json "/api/v1/policy/categories" | Out-Null }
Step "GET  /policy/quick-questions" { Get-Json "/api/v1/policy/quick-questions" | Out-Null }
Step "POST /policy/chat (SSE)" {
  $raw = Consume-Sse -Path "/api/v1/policy/chat" -Body @{ question = "请假流程"; top_k = 3 } -Timeout $SseTimeoutSec
  if ($raw -notmatch "event:\s*done") { throw "no done event" }
}
Step "DELETE /policy/files/{id}" { if (-not $script:fileId) { throw "skip: no fileId" }; Delete-Path "/api/v1/policy/files/$($script:fileId)" | Out-Null }

# 3) Document (7)
$script:draftId = $null
Step "GET  /document/templates" { $r = Get-Json "/api/v1/document/templates"; if ($r.Count -lt 1) { throw "empty templates" } }
Step "POST /document/draft (SSE)" {
  $raw = Consume-Sse -Path "/api/v1/document/draft" -Body @{ type="notice"; topic="测试通知"; keywords=@("会议"); tone="formal" } -Timeout $SseTimeoutSec
  if ($raw -notmatch "event:\s*done") { throw "no done event" }
  $m = [regex]::Match($raw, '"draft_id"\s*:\s*"([0-9a-f-]+)"')
  if ($m.Success) { $script:draftId = $m.Groups[1].Value }
}
Step "POST /document/audit" {
  $body = @{ type="notice"; content="# 通知 各部门：今日下午两点会议室开会，请按时参加。" }
  $r = Post-Json "/api/v1/document/audit" $body
  if ($null -eq $r.passed) { throw "missing passed field" }
}
Step "GET  /document/drafts/{id}"        { if (-not $script:draftId) { throw "skip: no draftId" }; Get-Json "/api/v1/document/drafts/$($script:draftId)" | Out-Null }
$script:docPdf = $null
Step "POST /document/{id}/export-pdf"    {
  if (-not $script:draftId) { throw "skip: no draftId" }
  $r = Post-Json "/api/v1/document/$($script:draftId)/export-pdf" $null
  $script:docPdf = $r.download_url
  if (-not $script:docPdf) { throw "no download_url" }
}
Step "GET  /document/exports/{name}"     {
  if (-not $script:docPdf) { throw "skip: no pdf url" }
  $tmp = [System.IO.Path]::GetTempFileName()
  Invoke-WebRequest -Uri "$BaseUrl$($script:docPdf)" -OutFile $tmp | Out-Null
  if ((Get-Item $tmp).Length -lt 1024) { throw "pdf too small" }
  Remove-Item $tmp -ErrorAction SilentlyContinue
}
Step "POST /document/{id}/save-template" {
  if (-not $script:draftId) { throw "skip: no draftId" }
  Post-Json "/api/v1/document/$($script:draftId)/save-template" @{ name="E2E模板-$(Get-Random)"; description="冒烟自动保存" } | Out-Null
}


# 4) Visitor (10)
Step "GET  /visitor/search-host" { $r = Get-Json ("/api/v1/visitor/search-host?q=zhang" + "&" + "limit=5"); if ($null -eq $r.matches) { throw "no matches field" } }
if ($CardImage -and (Test-Path $CardImage)) {
  Step "POST /visitor/ocr-card" {
    $form = @{ file = Get-Item $CardImage }
    Invoke-RestMethod -Uri "$BaseUrl/api/v1/visitor/ocr-card" -Method POST -Form $form | Out-Null
  }
} else {
  Skip "POST /visitor/ocr-card" "missing -CardImage path"
}
$script:vid = $null
Step "POST /visitor (register)" {
  $r = Post-Json "/api/v1/visitor" @{ name="冒烟测试客"; company="E2E公司"; phone="13900001234"; purpose="冒烟"; host_name="张三"; source="desk" }
  $script:vid = $r.id
  if (-not $script:vid) { throw "no visitor id" }
}
Step "GET  /visitor (list)"             { $r = Get-Json "/api/v1/visitor?page=1&page_size=5"; if ($null -eq $r.total) { throw "no total" } }
Step "GET  /visitor/stats/today"        { Get-Json "/api/v1/visitor/stats/today" | Out-Null }
Step "GET  /visitor/stats/weekly-trend" { $r = Get-Json "/api/v1/visitor/stats/weekly-trend"; if ($r.points.Count -lt 7) { throw "expect 7 points" } }
Step "GET  /visitor/{id}"               { if (-not $script:vid) { throw "skip: no vid" }; Get-Json "/api/v1/visitor/$($script:vid)" | Out-Null }
Step "POST /visitor/{id}/check-in"      { if (-not $script:vid) { throw "skip: no vid" }; Post-Json "/api/v1/visitor/$($script:vid)/check-in" $null | Out-Null }
Step "POST /visitor/{id}/check-out"     { if (-not $script:vid) { throw "skip: no vid" }; Post-Json "/api/v1/visitor/$($script:vid)/check-out" $null | Out-Null }
Step "POST /visitor/{id}/notify"        { if (-not $script:vid) { throw "skip: no vid" }; Post-Json "/api/v1/visitor/$($script:vid)/notify" $null | Out-Null }

# 5) Event (6)
$script:planId = $null
Step "GET  /event/cities"         { $r = Get-Json "/api/v1/event/cities"; if ($r.Count -lt 1) { throw "empty cities" } }
Step "GET  /event/activity-types" { $r = Get-Json "/api/v1/event/activity-types"; if ($r.Count -lt 1) { throw "empty activity-types" } }
Step "POST /event/plan (SSE)" {
  $raw = Consume-Sse -Path "/api/v1/event/plan" `
    -Body @{ participants=20; per_capita_budget=200; city="上海"; activity_types=@("bbq","outdoor") } `
    -Timeout $SseTimeoutSec
  $m = [regex]::Match($raw, '"plan_id"\s*:\s*"([0-9a-f-]+)"')
  if ($m.Success) { $script:planId = $m.Groups[1].Value } else { throw "no plan_id in stream" }
}
Step "GET  /event/plans/{id}"             { if (-not $script:planId) { throw "skip: no planId" }; Get-Json "/api/v1/event/plans/$($script:planId)" | Out-Null }
$script:planPdf = $null
Step "POST /event/plans/{id}/export-pdf"  {
  if (-not $script:planId) { throw "skip: no planId" }
  $r = Post-Json "/api/v1/event/plans/$($script:planId)/export-pdf" $null
  $script:planPdf = $r.download_url
  if (-not $script:planPdf) { throw "no download_url" }
}
Step "GET  /event/exports/{name}" {
  if (-not $script:planPdf) { throw "skip: no pdf url" }
  $tmp = [System.IO.Path]::GetTempFileName()
  Invoke-WebRequest -Uri "$BaseUrl$($script:planPdf)" -OutFile $tmp | Out-Null
  if ((Get-Item $tmp).Length -lt 1024) { throw "pdf too small" }
  Remove-Item $tmp -ErrorAction SilentlyContinue
}

# ===== 汇总 =====
$pass = ($script:Results | Where-Object status -eq "PASS").Count
$fail = ($script:Results | Where-Object status -eq "FAIL").Count
$skip = ($script:Results | Where-Object status -eq "SKIP").Count
$total = $script:Results.Count
Write-Host ""
Write-Host ("=== Summary: {0}/{1} PASS, {2} FAIL, {3} SKIP ===" -f $pass, $total, $fail, $skip) -ForegroundColor Cyan
$script:Results | Format-Table -AutoSize name,status,ms,err

if ($fail -gt 0) { exit 1 } else { exit 0 }
