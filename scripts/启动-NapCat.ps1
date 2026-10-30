# 启动-NapCat.ps1 —— 只启动 NapCat（QQ 传输层），不启动任何 DSH 桥。
# 现在的架构：NapCat 只负责把 QQ 消息吐到 WS :3001；真正回话的是 DSH 里的 Aurabot 插件。
# 用法：
#   .\启动-NapCat.ps1              启动并等到 3001 监听
#   .\启动-NapCat.ps1 -Stop        只停 NapCat（Aurabot 会显示 onebot 断开，NapCat 回来后自动重连）
#   .\启动-NapCat.ps1 -Account 1234 换小号
# 注意：本文件必须保存为「UTF-8 with BOM」，否则 Windows PowerShell 5.1 会把中文读成乱码。

param(
  [string]$Account = '1000000001',
  [int]$Port = 3001,
  [switch]$Stop,
  [switch]$NoWait
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$NapCatDir = Join-Path $Root 'napcat'
$NapCatBat = Join-Path $NapCatDir 'napcat.bat'

function Ok($m)   { Write-Host "[OK] $m"   -ForegroundColor Green }
function Warn($m) { Write-Host "[..] $m"   -ForegroundColor Yellow }
function Bad($m)  { Write-Host "[!!] $m"   -ForegroundColor Red }

function Get-NapCatProcs {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match 'napcat' }
}

if ($Stop) {
  $procs = Get-NapCatProcs
  if (-not $procs) { Ok 'NapCat 没在跑'; exit 0 }
  foreach ($p in $procs) { Warn "停止 NapCat PID $($p.ProcessId)"; Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
  if (Get-NapCatProcs) { Bad '还有残留进程，再执行一次 -Stop'; exit 1 }
  Ok 'NapCat 已停'
  exit 0
}

$running = Get-NapCatProcs
if ($running) {
  Ok "NapCat 已在运行 (PID $(($running.ProcessId) -join ', '))"
} else {
  if (-not (Test-Path -LiteralPath $NapCatBat)) { Bad "找不到 $NapCatBat"; exit 1 }
  Warn "启动 NapCat（快速登录 $Account）…"
  Start-Process -FilePath $NapCatBat -ArgumentList '-q', $Account -WorkingDirectory $NapCatDir -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $Root 'napcat-run.log') `
    -RedirectStandardError  (Join-Path $Root 'napcat-run.err.log')
}

if ($NoWait) { Ok '已发出启动，不等端口'; exit 0 }

if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
  Ok "OneBot WS 已在监听 127.0.0.1:$Port"
} else {
  Warn "等待登录完成（首次/换号要在 WebUI 扫码，最多 180 秒）…"
  $deadline = (Get-Date).AddSeconds(180); $ok = $false
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3
    Write-Host '.' -NoNewline
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { $ok = $true; break }
  }
  Write-Host ''
  if (-not $ok) {
    Bad "180 秒内 $Port 未监听 —— NapCat 没登录成功"
    $token = '910c14be34b8'
    $webui = Join-Path $NapCatDir 'napcat\config\webui.json'
    if (Test-Path -LiteralPath $webui) {
      try { $token = (Get-Content -LiteralPath $webui -Raw -Encoding UTF8 | ConvertFrom-Json).token } catch { }
    }
    Write-Host '  去 WebUI 扫码登录：' -ForegroundColor Yellow
    Write-Host "    http://127.0.0.1:6099/webui?token=$token"
    Write-Host "  日志：$Root\napcat-run.log"
    exit 1
  }
  Ok "登录成功，OneBot WS 已在监听 127.0.0.1:$Port"
}

$conn = Get-NetTCPConnection -LocalPort $Port -State Established -ErrorAction SilentlyContinue
if ($conn) {
  Ok "已有客户端连上（Established）：Aurabot 那边 /state 里应显示 onebot.state=connected"
} else {
  Warn '端口通了但还没有客户端连上 —— 打开 DSH 桌面端，Aurabot 总开关开着就会自己连'
}
