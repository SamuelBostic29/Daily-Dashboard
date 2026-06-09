# Opens the Daily Dashboard once in the interactive session.
#
# The all-day polling task regenerates the data files windowless in the background and never
# opens a browser. Run this once (e.g. from a Stream Deck shortcut on your spare screen) and
# the page auto-reloads in place each time the briefing produces fresh data.
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$dashboard = Join-Path $repoRoot "dashboard\template\template.html"

if (-not (Test-Path $dashboard)) {
    Write-Error "Dashboard not found at: $dashboard"
    exit 1
}

Start-Process $dashboard
