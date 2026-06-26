# $Trigger distinguishes the scheduler's run ("scheduled", the default so register-task.ps1 needs
# no change) from the dashboard's manual Refresh button, which invokes this via gmc-refresh:// with
# -Trigger manual. It's recorded in status.js so the dashboard can label the active run.
param(
    [ValidateSet("scheduled", "manual")]
    [string]$Trigger = "scheduled"
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$logsDir = Join-Path $repoRoot "logs"
$logFile = Join-Path $logsDir "startup.log"
$statusFile = Join-Path $repoRoot "dashboard\data\status.js"
$sessionSince = Get-Date -Format "o"

# The dashboard polls status.js to show a "Refreshing…" pill and disable the Refresh button while a
# run is in flight (#17). Written running:true as this script's first real act and flipped to false
# in finally, so even a crash mid-briefing resets the indicator. PowerShell overwrites the file
# directly (it isn't bound by the harness's Read-first guard), so there's no delete-then-write gap a
# poll could fall into. Best-effort: the indicator is cosmetic, so a status-write failure must never
# abort the briefing itself.
function Write-Status([bool]$Running) {
    try {
        [string]$running = if ($Running) { 'true' } else { 'false' }
        Set-Content -Path $statusFile -Encoding UTF8 -Value `
            "window.BRIEFING_STATUS = { running: $running, since: `"$sessionSince`", trigger: `"$Trigger`" };"
    } catch {
        Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Status write ($Running) skipped: $($_.Exception.Message)"
    }
}

if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir | Out-Null
}

if ((Get-Date).DayOfWeek -eq [DayOfWeek]::Monday -and (Test-Path $logFile)) {
    Remove-Item $logFile -Force
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

try {
    Write-Status $true
    Add-Content -Path $logFile -Value "[$timestamp] Starting Daily Dashboard session ($Trigger)..."

    $claudePath = (Get-Command claude).Source
    Add-Content -Path $logFile -Value "[$timestamp] Found Claude CLI at: $claudePath"

    $prompt = "Run the morning briefing. Spin up 3 agents in parallel to collect data as described in CLAUDE.md, then write the dashboard data files."

    # Marks this as a dashboard-populating run so the gh-account-guard hook lets the briefing's
    # gh data calls use the Paradigm work account. Outside this flag, every gh action in the repo
    # stays on the personal account. Inherited by the claude process and its sub-agents.
    $env:DAILY_DASHBOARD_BRIEFING = '1'

    # Headless (-p): non-interactive run with no TUI, required for windowless polling.
    # stdout carries the run summary, captured to the log since there's no console to watch.
    Add-Content -Path $logFile -Value "[$timestamp] Launching headless Claude (claude -p) in project directory: $repoRoot"
    Push-Location $repoRoot
    $output = & $claudePath -p $prompt --dangerously-skip-permissions --model sonnet 2>&1
    Pop-Location
    if ($LASTEXITCODE -ne 0) {
        Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Claude exited with code $LASTEXITCODE"
        Add-Content -Path $logFile -Value $output
        exit $LASTEXITCODE
    }
    Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Briefing output:"
    Add-Content -Path $logFile -Value $output
    Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Session ended."
}
catch {
    $errorMessage = $_.Exception.Message
    Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] ERROR: $errorMessage"
    Write-Error "Daily Dashboard startup failed: $errorMessage"
    exit 1
}
finally {
    # Always clear the indicator, even on the exit 1 above — a crashed run must not leave the
    # dashboard stuck showing "Refreshing…" with the button disabled forever.
    Write-Status $false
}
