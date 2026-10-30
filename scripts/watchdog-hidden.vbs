' watchdog-hidden.vbs
' 用 wscript.exe（GUI 子系统，无控制台）启动 watchdog.ps1。
' WScript.Shell.Run 的第 2 参数 0 = SW_HIDE，进程创建时窗口状态即为隐藏，
' 因此不会出现 powershell.exe -WindowStyle Hidden 那种 conhost 闪窗。
' 计划任务 DshQqWatchdog 的动作已改为：
'   wscript.exe "D:\aaa_dsh_data_storage\napcat-bridge\watchdog-hidden.vbs"

Dim shell, ps1
Set shell = CreateObject("WScript.Shell")

ps1 = "D:\aaa_dsh_data_storage\napcat-bridge\watchdog.ps1"

shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & ps1 & """", 0, False
