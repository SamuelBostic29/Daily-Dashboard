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
    Add-Content -Path $logFile -Value "[$timestamp] Starting Good Morning Claude session..."

    $claudePath = (Get-Command claude).Source
    Add-Content -Path $logFile -Value "[$timestamp] Found Claude CLI at: $claudePath"

    $prompt = "Run the morning briefing. Gather all data sources and generate the dashboard."

    Add-Content -Path $logFile -Value "[$timestamp] Launching Claude Code in project directory: $repoRoot"
    & $claudePath --project $repoRoot --dangerously-skip-permissions --prompt $prompt
    if ($LASTEXITCODE -ne 0) {
        Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Claude exited with code $LASTEXITCODE"
    }
    Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Session ended."
}
catch {
    $errorMessage = $_.Exception.Message
    Add-Content -Path $logFile -Value "[$timestamp] ERROR: $errorMessage"
    Write-Error "Good Morning Claude startup failed: $errorMessage"
    exit 1
}
