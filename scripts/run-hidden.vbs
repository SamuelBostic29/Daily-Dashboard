' Locate start-session.ps1 relative to this script so it works regardless of the
' process working directory (the scheduled-task CWD is not guaranteed elsewhere).
Set objShell = CreateObject("WScript.Shell")
strScriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
strArgs = " -NoProfile -ExecutionPolicy Bypass -File """ & strScriptDir & "start-session.ps1"""

' Prefer PowerShell 7 (pwsh); fall back to Windows PowerShell if it isn't installed.
On Error Resume Next
objShell.Run "pwsh" & strArgs, 0, True
If Err.Number <> 0 Then
    Err.Clear
    objShell.Run "powershell" & strArgs, 0, True
End If
On Error GoTo 0
