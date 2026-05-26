Set objShell = CreateObject("WScript.Shell")
strRepoRoot = objShell.CurrentDirectory
strScript = strRepoRoot & "\scripts\start-session.ps1"
objShell.Run "pwsh -NoProfile -ExecutionPolicy Bypass -File """ & strScript & """", 0, True
