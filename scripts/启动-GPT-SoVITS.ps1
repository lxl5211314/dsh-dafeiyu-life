# 启动 / 停止 本机 GPT-SoVITS 语音服务（大肥鱼自己的音色）
#   .\启动-GPT-SoVITS.ps1              # 起服务（在跑就什么都不做）
#   .\启动-GPT-SoVITS.ps1 -Stop        # 停掉
#   .\启动-GPT-SoVITS.ps1 -NoWait      # 起了就走，不等就绪
# 说明：Aurabot 的本地接口 tts.mjs 会优先调这个服务（http://127.0.0.1:9880/tts），
#       服务没起来它会自动退回 edge-tts，所以这个脚本起不起来都不至于把她弄哑。
param(
    [switch]$Stop,
    [int]$Port = 9880,
    [switch]$NoWait,
    [int]$TimeoutSec = 180
)

$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot 'GPT-SoVITS'
$py = Join-Path $PSScriptRoot '.venv-tts\Scripts\python.exe'
$log = Join-Path $root 'gsv-api.log'
$errLog = Join-Path $root 'gsv-api.log.err'

function Test-Port([int]$p) {
    return [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)
}

if ($Stop) {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) { Write-Host "[OK] 端口 $Port 没人在听，本来就是停的"; return }
    foreach ($c in $conns) {
        $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        if ($proc) { Write-Host "[..] 停掉 pid $($proc.Id)"; Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    }
    Start-Sleep -Seconds 2
    if (Test-Port $Port) { Write-Host "[!!] 端口 $Port 还在，手动检查" } else { Write-Host "[OK] 已停止" }
    return
}

if (Test-Port $Port) {
    Write-Host "[OK] GPT-SoVITS 已经在跑（端口 $Port）"
    return
}

if (-not (Test-Path $py)) { Write-Host "[!!] 找不到 python: $py"; exit 2 }
if (-not (Test-Path (Join-Path $root 'api_v2.py'))) { Write-Host "[!!] 找不到 $root\api_v2.py"; exit 2 }

$env:PYTHONIOENCODING = 'utf-8'
# 必须用 cmd /c start 彻底脱钩：直接用 Start-Process 起的子进程会挂在这条命令的作业对象上，
# 调用方（比如一个后台作业）一结束，python 就跟着死 —— 之前就踩过「端口明明在听，一测却 ECONNREFUSED」。
$inner = "/c start `"gsv`" /min `"$py`" api_v2.py -a 127.0.0.1 -p $Port -c GPT_SoVITS/configs/tts_infer.yaml > `"$log`" 2> `"$errLog`""
Start-Process -FilePath 'cmd.exe' -ArgumentList $inner -WorkingDirectory $root -WindowStyle Hidden
Write-Host "[..] 拉起 GPT-SoVITS，日志 $log"

if ($NoWait) { Write-Host "[OK] 不等了就绪（模型加载大概要 30～60 秒）"; return }

$sw = [Diagnostics.Stopwatch]::StartNew()
while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
    if (Test-Port $Port) {
        Write-Host ("[OK] 就绪，用了 {0:N0} 秒：http://127.0.0.1:{1}/tts" -f $sw.Elapsed.TotalSeconds, $Port)
        return
    }
    if ($p.HasExited) {
        Write-Host "[!!] 进程退了，看日志尾部："
        if (Test-Path $errLog) { Get-Content $errLog -Encoding UTF8 -Tail 12 }
        exit 3
    }
    Start-Sleep -Seconds 2
}
Write-Host "[!!] 等超时了，模型可能还在加载，过会儿看 $log"
