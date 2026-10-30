<#
.SYNOPSIS
  一键安装 DSH「大肥鱼完整的一生」插件套装。

.DESCRIPTION
  给全新机器用的幂等安装脚本：备份配置 → 逐个安装插件 → 校验 bundles → 打印下一步。
  装完必须完全退出 DSH 再启动，插件才会加载。

.PARAMETER Profile
  DSH profile 名，默认 desktop（桌面 App 使用）。

.PARAMETER IncludeOptional
  额外安装可选插件（dsh-im / modlens / skills-manager / cost-meter）。

.PARAMETER SkipBackup
  跳过备份（不推荐）。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install-dafeiyu.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install-dafeiyu.ps1 -IncludeOptional
#>
param(
    [string]$Profile = 'desktop',
    [switch]$IncludeOptional,
    [switch]$SkipBackup
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-Ok  ($msg) { Write-Host "  [OK]   $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Err ($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red }

# pnpm 的进度信息走 stderr；PowerShell 5.1 在 ErrorActionPreference=Stop 下
# 会把原生命令的 stderr 当成终止错误。调用 dsh 时必须临时降为 Continue。
function Invoke-Dsh {
    param([string[]]$DshArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $script:LastDshOutput = (& $script:dsh @DshArgs 2>&1 | Out-String)
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
}

# ---------------------------------------------------------------- 1. 定位 CLI
Write-Step '1/6 定位 DSH CLI'

$candidates = @()
if ($env:DSH_CLI) { $candidates += $env:DSH_CLI }
$candidates += (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd')
$candidates += (Join-Path $env:ProgramFiles 'DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd')

$dsh = $null
foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { $dsh = $c; break }
}
if (-not $dsh) {
    Write-Err '找不到 dsh.cmd。请确认已安装 DeepSeek Harness，或用 $env:DSH_CLI 指定路径。'
    exit 1
}
Write-Ok "CLI: $dsh"

$script:dsh = $dsh

try {
    $null = Invoke-Dsh @('--version')
    $ver = $script:LastDshOutput.Trim()
    Write-Ok "版本: $ver"
} catch {
    Write-Err "CLI 无法执行：$($_.Exception.Message)"
    exit 1
}

if ($ver -notmatch '^0\.2\.') {
    Write-Warn "本脚本按 DSH 0.2.x 验证过；当前是 $ver，插件兼容性可能变化，请自行核对。"
}

# --------------------------------------------------------------- 2. 定位 profile
Write-Step "2/6 检查 profile '$Profile'"

$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$profDir = Join-Path (Join-Path $dshHome 'profiles') $Profile
$pkgPath = Join-Path $profDir 'package.json'

if (-not (Test-Path $profDir)) {
    Write-Warn "profile 目录不存在：$profDir"
    Write-Warn '请先启动一次 DSH 让它自动初始化，或执行：& $dsh --profile '"$Profile"' --dump-config'
    exit 1
}
Write-Ok "profile: $profDir"

# ------------------------------------------------------------- 3. 备份配置
Write-Step '3/6 备份配置'

if ($SkipBackup) {
    Write-Warn '已跳过备份（-SkipBackup）'
} else {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backed = 0
    foreach ($f in @('package.json', 'pnpm-lock.yaml', 'cordis.patch.yml', 'pnpm-workspace.yaml')) {
        $src = Join-Path $profDir $f
        if (Test-Path $src) {
            Copy-Item $src "$src.bak-$stamp" -Force
            $backed++
        }
    }
    Write-Ok "已备份 $backed 个文件（后缀 .bak-$stamp）"
}

# -------------------------------------------------------------- 4. 安装插件
Write-Step '4/6 安装插件'

$core = @(
    'dsh-pet'
    'dsh-persona-dafeiyu'
    'dsh-proactive'
    'dsh-meme'
    '@aiwayds/dsh-web-search-anysearch'
    'dsh-mnemon'
    'billion-context'
    'dsh-undo-savepoint'
    'dsh-better-sidebar'
    'cc-safety-net'
)
$optional = @(
    '@xmanrui/dsh-im'
    '@liustack/modlens'
    '@michengai/dsh-skills-manager'
    'dsh-cost-meter'
)

$targets = @()
$targets += $core
if ($IncludeOptional) { $targets += $optional }

$failed = @()
foreach ($pkg in $targets) {
    Write-Host "  -> 安装 $pkg ..."
    # 单个插件失败不影响后面的：逐个 add，出错只记录
    $code = Invoke-Dsh @('plugin', '--profile', $Profile, 'add', $pkg)
    if ($code -ne 0) {
        $failed += $pkg
        Write-Err "$pkg 安装失败"
        $tail = ($script:LastDshOutput -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 12)
        foreach ($line in $tail) { Write-Host "     $line" -ForegroundColor DarkGray }
    } else {
        Write-Ok "$pkg"
    }
}

# ------------------------------------------------------------- 5. 校验 bundles
Write-Step '5/6 校验 dsh.profile.bundles'

try {
    $manifest = Get-Content $pkgPath -Raw | ConvertFrom-Json
    $bundles  = @($manifest.dsh.profile.bundles)
} catch {
    Write-Err "package.json 解析失败：$($_.Exception.Message)"
    Write-Warn '若文件已损坏，用第 3 步的 .bak 备份覆盖回去。'
    exit 1
}

$missing = @()
foreach ($pkg in $targets) {
    $leaf = ($pkg -split '/')[-1]
    $hit = $bundles | Where-Object { $_ -eq $pkg -or $_ -eq $leaf }
    if ($hit) {
        Write-Ok "$pkg"
    } else {
        $missing += $pkg
        Write-Err "$pkg 不在 bundles 里"
    }
}

if ($bundles.Count -lt 10) {
    Write-Warn "bundles 只有 $($bundles.Count) 条，可能有插件未注册。"
}

# ------------------------------------------------------------ 6. 下一步指引
Write-Step '6/6 完成'

if ($failed.Count -gt 0 -or $missing.Count -gt 0) {
    Write-Warn '以下插件需要人工处理：'
    ($failed + $missing) | Sort-Object -Unique | ForEach-Object { Write-Warn "  - $_" }
    Write-Host ''
    Write-Host '常见原因：' -ForegroundColor Yellow
    Write-Host '  * 版本被 pnpm 供应链策略拦住 -> 在 pnpm-workspace.yaml 的 minimumReleaseAgeExclude 里加 "包名@版本"'
    Write-Host '  * engines.dsh 不覆盖当前 DSH 版本 -> 换插件版本，别硬装'
    Write-Host ''
}

Write-Host '下一步（必须做）：' -ForegroundColor Cyan
Write-Host '  1. 完全退出 DeepSeek Harness（托盘右键退出，任务管理器确认无残留进程）'
Write-Host '  2. 重新打开'
Write-Host '  3. 设置 -> 插件，确认每个插件状态为「已启用」'
Write-Host '  4. 按 README.md 第 7 节的验收清单逐条验证'
Write-Host ''
Write-Host '回退方式：用第 3 步生成的 *.bak-<时间戳> 覆盖回去，或用已安装的 dsh-undo-savepoint 恢复快照。' -ForegroundColor DarkGray

if ($failed.Count -gt 0 -or $missing.Count -gt 0) { exit 2 }
exit 0
