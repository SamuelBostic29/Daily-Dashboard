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

    $prompt = "Run the morning briefing. Spin up 3 agents in parallel to collect data as described in CLAUDE.md, then generate the dashboard."

    Add-Content -Path $logFile -Value "[$timestamp] Launching Claude Code in project directory: $repoRoot"
    Push-Location $repoRoot
    & $claudePath --dangerously-skip-permissions --model sonnet $prompt
    Pop-Location
    if ($LASTEXITCODE -ne 0) {
        Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Claude exited with code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
    Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Session ended."
}
catch {
    $errorMessage = $_.Exception.Message
    Add-Content -Path $logFile -Value "[$timestamp] ERROR: $errorMessage"
    Write-Error "Daily Dashboard startup failed: $errorMessage"
    exit 1
}
