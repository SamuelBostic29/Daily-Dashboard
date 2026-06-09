$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$logsDir = Join-Path $repoRoot "logs"
$logFile = Join-Path $logsDir "startup.log"

if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir | Out-Null
}

if ((Get-Date).DayOfWeek -eq [DayOfWeek]::Monday -and (Test-Path $logFile)) {
    Remove-Item $logFile -Force
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

try {
    Add-Content -Path $logFile -Value "[$timestamp] Starting Daily Dashboard session..."

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
