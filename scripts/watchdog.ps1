# watchdog.ps1 —— 大肥鱼 QQ 看门狗（Aurabot 架构版，2026-10-30 重写）
#
# 架构：NapCat（传输层 :3001） ←WS— Aurabot 插件（跑在 DSH 桌面端里）
# 所以看门狗只管两件事，绝不再去拉起旧的 --profile qqbot 宿主（那会和 Aurabot 抢 3001，一句话回两遍）：
#   1) NapCat 进程 / :3001 监听  不在了 —— 真正隐藏窗口地拉起来；连续 10 分钟没监听就重启一次 NapCat（要重新扫码）
#   2) Aurabot 的 onebot 连接断了 —— 调面板 POST /aurabot/api/onebot/reconnect
# 面板端口每次启动 DSH 都会变，所以这里**自动发现**：先找 DSH/node 进程占用的监听端口，再逐个探 /aurabot/api/state。
# DSH 桌面端被关掉时她本来就不在线，看门狗只记日志、**不会**去弹 GUI。
#
# 日志：logs\watchdog-yyyy-MM-dd.log（超过 2MB 轮转）
# 单实例：watchdog.lock（里面是 PID）
# 隐藏运行：由 watchdog-hidden.vbs（wscript，SW_HIDE）拉起，不出现任何控制台窗口。
#
# 用法：
#   .\watchdog.ps1 -Status     只体检一次，打印结果就退出（不写 lock、不循环）
#   .\watchdog.ps1             常驻
# 注意：本文件必须保存为「UTF-8 with BOM」。

param(
  [int]$Port = 3001,
  [string]$Account = '1000000001',
  [int]$IntervalSec = 20,
  [switch]$Status
)

$ErrorActionPreference = 'Continue'

$Root      = Split-Path -Parent $MyInvocation.MyCommand.Path
$NapCatDir = Join-Path $Root 'napcat'
$NapCatBat = Join-Path $NapCatDir 'napcat.bat'
$LogDir    = Join-Path $Root 'logs'
$LogFile   = Join-Path $LogDir ('watchdog-{0}.log' -f (Get-Date -Format 'yyyy-MM-dd'))
$LockFile  = Join-Path $Root 'watchdog.lock'

if (-not (Test-Path -LiteralPath $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

function Log($msg, $level = 'INFO') {
  $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $level, $msg
  try {
    if ((Test-Path -LiteralPath $LogFile) -and ((Get-Item -LiteralPath $LogFile).Length -gt 2MB)) {
      Move-Item -LiteralPath $LogFile -Destination ($LogFile + '.prev') -Force -ErrorAction SilentlyContinue
    }
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
  } catch { }
  if ($Status) { Write-Host $line }
}

function Test-Port([int]$p) {
  [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)
}

function Test-Established([int]$p) {
  [bool](Get-NetTCPConnection -LocalPort $p -State Established -ErrorAction SilentlyContinue)
}

function Get-NapCatProc {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match 'napcat' }
}

function Get-DshProc {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq 'DeepSeek Harness.exe' -or ($_.CommandLine -and $_.CommandLine -match 'dsh-desktop-host') }
}

# 找 Aurabot 面板：候选 = DSH/node 进程占用的监听端口，逐个探 /aurabot/api/state
function Find-AurabotApi {
  $owners = @(Get-DshProc | ForEach-Object { $_.ProcessId })
  $owners += @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
                 Where-Object { $_.CommandLine -and $_.CommandLine -match 'dsh' } | ForEach-Object { $_.ProcessId })
  if (-not $owners) { return $null }
  $ports = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $owners -contains $_.OwningProcess } |
    Select-Object -ExpandProperty LocalPort -Unique
  foreach ($p in $ports) {
    $base = "http://127.0.0.1:$p/aurabot/api"
    try {
      $r = Invoke-RestMethod -Uri "$base/state" -TimeoutSec 2 -ErrorAction Stop
      if ($null -ne $r.onebot) { return $base }
    } catch { }
  }
  return $null
}

function Get-AurabotState($base) {
  try { return Invoke-RestMethod -Uri "$base/state" -TimeoutSec 3 -ErrorAction Stop } catch { return $null }
}

# 旧架构遗留：--profile qqbot 的 dsh-qq-onebot 宿主。它和 Aurabot 都连 :3001，
# 同时在场就会「一句话回两遍」，所以看门狗看到就停掉它。
function Get-QqbotHostProc {
  Get-CimInstance Win32_Process -Filter "Name='DeepSeek Harness.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match '--profile\s+qqbot' }
}

function Start-NapCat {
  if (-not (Test-Path -LiteralPath $NapCatBat)) { Log "找不到 $NapCatBat" 'ERROR'; return $false }
  $out = Join-Path $Root 'napcat-run.log'
  $err = Join-Path $Root 'napcat-run.err.log'
  try {
    # 用 cmd /c 起，并彻底脱离本进程（避免看门狗退出时把它带走）
    Start-Process -FilePath $env:ComSpec `
      -ArgumentList ('/c ""' + $NapCatBat + '" -q ' + $Account + '"') `
      -WorkingDirectory $NapCatDir -WindowStyle Hidden `
      -RedirectStandardOutput $out -RedirectStandardError $err
    Log "已拉起 NapCat（-q $Account，隐藏窗口；日志 napcat-run.log）"
    return $true
  } catch {
    Log "拉起 NapCat 失败：$($_.Exception.Message)" 'ERROR'
    return $false
  }
}

function Restart-NapCat {
  $procs = @(Get-NapCatProc)
  foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
  if ($procs.Count -gt 0) { Start-Sleep -Seconds 3 }
  Log 'NapCat 已重启——如果它需要扫码，请在 WebUI 里扫（http://127.0.0.1:6099/webui）' 'WARN'
  return (Start-NapCat)
}

# ---------------- 体检 ----------------
function Invoke-Check([bool]$Act) {
  $napcat = @(Get-NapCatProc)
  $dsh    = @(Get-DshProc)
  $portOk = Test-Port $Port
  $connOk = Test-Established $Port
  $api    = Find-AurabotApi
  $state  = if ($api) { Get-AurabotState $api } else { $null }
  $ob     = if ($state) { $state.onebot.state } else { $null }

  $r = [pscustomobject]@{
    NapCatProc = [bool]($napcat.Count -gt 0)
    DshProc    = [bool]($dsh.Count -gt 0)
    Port3001   = $portOk
    Established= $connOk
    Api        = $api
    Onebot     = $ob
    Enabled    = if ($state) { $state.config.enabled } else { $null }
  }
  return $r
}

# ---------------- -Status ----------------
if ($Status) {
  $r = Invoke-Check $false
  Log ("NapCat 进程={0}  DSH 桌面端={1}  :3001 监听={2}  已建立连接={3}" -f $r.NapCatProc, $r.DshProc, $r.Port3001, $r.Established)
  Log ("面板 API={0}  onebot={1}  总开关={2}" -f $r.Api, $r.Onebot, $r.Enabled)
  if (([int]$r.NapCatProc -gt 0) -and $r.Port3001 -and $r.Onebot -eq 'connected') { Log '体检结论：一切正常' 'OK' }
  else { Log '体检结论：有项不对，见上面几行' 'WARN' }
  exit 0
}

# ---------------- 单实例 ----------------
# 注意：lock 里的 PID 可能是「旧的、已死的」——死了就直接接管，否则会永久阻塞。
if (Test-Path -LiteralPath $LockFile) {
  $oldPid = 0
  try { $oldPid = [int]((Get-Content -LiteralPath $LockFile -Raw).Trim()) } catch { }
  if ($oldPid -gt 0 -and $oldPid -ne $PID) {
    $alive = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
    if ($alive) { exit 0 }   # 另一个实例在跑：静默退出（计划任务每 5 分钟会来敲一次，属正常）
    Log "发现过期 lock（PID $oldPid 已不在），接管" 'WARN'
  }
}
Set-Content -LiteralPath $LockFile -Value $PID -Encoding UTF8

Log "看门狗启动 (PID $PID)，间隔 ${IntervalSec}s，账号 $Account，端口 $Port"

$noPortStreak = 0
$noConnStreak = 0
$lastNapCatRestart = [datetime]::MinValue
$lastDshWarn = [datetime]::MinValue
$lastTtsWarn = [datetime]::MinValue
$tick = 0

try {
  while ($true) {
    try {
      $r = Invoke-Check $true

      # ---- 旧架构 qqbot 宿主：一律清掉，避免一句话回两遍 ----
      $legacy = @(Get-QqbotHostProc)
      if ($legacy.Count -gt 0) {
        Log "发现旧桥 --profile qqbot（PID $($legacy.ProcessId -join ',')）在跑，会和 Aurabot 抢 :$Port —— 停掉它" 'WARN'
        foreach ($p in $legacy) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
      }

      # ---- DSH 桌面端没开：她本来就不在线，不弹 GUI，只记一笔 ----
      if ([int]$r.DshProc -eq 0) {
        if (((Get-Date) - $lastDshWarn).TotalMinutes -ge 10) {
          Log 'DSH 桌面端没开（她不在线）——不自动启动，等你手动打开 DSH' 'WARN'
          $lastDshWarn = Get-Date
        }
      }

      # ---- NapCat ----
      if ([int]$r.NapCatProc -eq 0) {
        Log 'NapCat 进程不在了，拉起'
        Start-NapCat | Out-Null
        $noPortStreak = 0
      }
      elseif (-not $r.Port3001) {
        $noPortStreak++
        if ($noPortStreak -eq 3 -or $noPortStreak % 15 -eq 0) {
          Log ("NapCat 在但 :$Port 未监听（第 $noPortStreak 次 / 约 {0} 分钟）——可能在等扫码" -f [int]($noPortStreak * $IntervalSec / 60)) 'WARN'
        }
        if ($noPortStreak -ge 30 -and ((Get-Date) - $lastNapCatRestart).TotalMinutes -ge 30) {
          Log "连续 $([int]($noPortStreak * $IntervalSec / 60)) 分钟 :$Port 未监听，重启 NapCat" 'WARN'
          Restart-NapCat | Out-Null
          $lastNapCatRestart = Get-Date
          $noPortStreak = 0
        }
      }
      else {
        $noPortStreak = 0
      }

      # ---- Aurabot 的 onebot 连接 ----
      if (([int]$r.DshProc -gt 0) -and $r.Port3001 -and $r.Api -and $r.Onebot -ne 'connected') {
        $noConnStreak++
        if ($noConnStreak -eq 1 -or $noConnStreak % 15 -eq 0) {
          Log "onebot=$($r.Onebot)（未连上，第 $noConnStreak 次 / 约 $([int]($noConnStreak * $IntervalSec / 60)) 分钟）" 'WARN'
        }
        if ($noConnStreak -ge 4) {
          try {
            $resp = Invoke-RestMethod -Uri "$($r.Api)/onebot/reconnect" -Method Post -TimeoutSec 10 -ErrorAction Stop
            Log "已请求重连：$($resp | ConvertTo-Json -Compress -Depth 3)" 'WARN'
          } catch {
            Log "重连请求失败：$($_.Exception.Message)" 'ERROR'
          }
          $noConnStreak = 0
        }
      }
      else {
        $noConnStreak = 0
      }

      # ---- 音色服务（只提示，不自动起；没它她会自动退回 edge-tts）----
      if (-not (Test-Port 9880)) {
        if (((Get-Date) - $lastTtsWarn).TotalMinutes -ge 30) {
          Log 'GPT-SoVITS :9880 没在听（她会退回 edge-tts 音色）' 'WARN'
          $lastTtsWarn = Get-Date
        }
      } else { $lastTtsWarn = [datetime]::MinValue }

      # ---- 心跳：每 30 轮（约 10 分钟）记一条，方便确认它还活着 ----
      $tick++
      if ($tick % 30 -eq 0) {
        Log ("心跳：NapCat={0} :{1} 监听={2} onebot={3} 总开关={4}" -f $r.NapCatProc, $Port, $r.Port3001, $r.Onebot, $r.Enabled)
      }

    } catch {
      Log "循环异常（已忽略）：$($_.Exception.Message)" 'ERROR'
    }
    Start-Sleep -Seconds $IntervalSec
  }
}
finally {
  Remove-Item -LiteralPath $LockFile -Force -ErrorAction SilentlyContinue
  Log '看门狗退出'
}
