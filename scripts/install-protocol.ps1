# One-time setup for the dashboard's browser-to-local-process bridges, registered under HKCU
# (per-user, no admin rights). Both launch windowless via conhost --headless, the same pattern as
# the scheduled briefing task:
#   gmc-review://  (#25) -> launch-review.ps1, passing the gmc-review:// URL as %1
#   gmc-refresh:// (#17) -> start-session.ps1 -Trigger manual, the same headless briefing the
#                           scheduler runs; it carries no per-call data, so no %1 is forwarded
#
# The registrations embed this repo's absolute paths - rerun after moving the repo.
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Register-Protocol([string]$Scheme, [string]$FriendlyName, [string]$Command) {
    $key = "HKCU:\Software\Classes\$Scheme"
    New-Item -Path "$key\shell\open\command" -Force | Out-Null
    Set-ItemProperty -Path $key -Name '(Default)' -Value "URL:$FriendlyName"
    Set-ItemProperty -Path $key -Name 'URL Protocol' -Value ''
    Set-ItemProperty -Path "$key\shell\open\command" -Name '(Default)' -Value $Command
}

$reviewLauncher = Join-Path $repoRoot "scripts\launch-review.ps1"
Register-Protocol 'gmc-review' 'GMC Review Protocol' `
    "conhost.exe --headless powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$reviewLauncher`" `"%1`""

$startSession = Join-Path $repoRoot "scripts\start-session.ps1"
Register-Protocol 'gmc-refresh' 'GMC Refresh Protocol' `
    "conhost.exe --headless powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startSession`" -Trigger manual"

Write-Host "Registered gmc-review:// -> $reviewLauncher"
Write-Host "Registered gmc-refresh:// -> $startSession -Trigger manual"
Write-Host "The browser will ask once to allow opening each link; allow them for the dashboard."
