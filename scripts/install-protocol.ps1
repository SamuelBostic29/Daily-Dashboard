# One-time setup for the dashboard's one-click PR review (#25): registers the gmc-review://
# URL scheme under HKCU (per-user, no admin rights) pointing at launch-review.ps1. The handler
# launches windowless via conhost --headless, the same pattern as the scheduled briefing task.
#
# The registration embeds this repo's absolute path - rerun after moving the repo.
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$launcher = Join-Path $repoRoot "scripts\launch-review.ps1"
$key = "HKCU:\Software\Classes\gmc-review"

New-Item -Path "$key\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path $key -Name '(Default)' -Value 'URL:GMC Review Protocol'
Set-ItemProperty -Path $key -Name 'URL Protocol' -Value ''
Set-ItemProperty -Path "$key\shell\open\command" -Name '(Default)' -Value `
    "conhost.exe --headless powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`" `"%1`""

Write-Host "Registered gmc-review:// -> $launcher"
Write-Host "The browser will ask once to allow opening gmc-review links; allow it for the dashboard."
