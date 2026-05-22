param(
    [ValidateSet("register", "unregister", "update")]
    [string]$Action = "register"
)

$taskName = "GoodMorningClaude"
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$configPath = Join-Path $repoRoot "config\schedule.json"
$startScript = Join-Path $repoRoot "scripts\start-session.ps1"

function Get-ScheduleConfig {
    if (-not (Test-Path $configPath)) {
        Write-Error "Config file not found at: $configPath"
        exit 1
    }
    return Get-Content -Raw $configPath | ConvertFrom-Json
}

function Get-TaskComponents {
    $config = Get-ScheduleConfig
    [string[]]$timeParts = $config.time -split ":"
    [int]$hour = $timeParts[0]
    [int]$minute = $timeParts[1]

    $pwshPath = (Get-Command pwsh -ErrorAction SilentlyContinue)
    if ($null -eq $pwshPath) {
        $pwshPath = (Get-Command powershell -ErrorAction SilentlyContinue)
    }
    if ($null -eq $pwshPath) {
        Write-Error "Neither 'pwsh' nor 'powershell' found on PATH. Install PowerShell and try again."
        exit 1
    }
    $pwshPath = $pwshPath.Source

    $taskAction = New-ScheduledTaskAction `
        -Execute $pwshPath `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`"" `
        -WorkingDirectory $repoRoot

    [System.DayOfWeek[]]$days = $config.daysOfWeek | ForEach-Object { [System.DayOfWeek]$_ }

    $trigger = New-ScheduledTaskTrigger `
        -Weekly -WeeksInterval 1 `
        -DaysOfWeek $days `
        -At ("{0:D2}:{1:D2}" -f $hour, $minute)

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Hours 1)

    $principal = New-ScheduledTaskPrincipal `
        -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
        -LogonType Interactive `
        -RunLevel Limited

    return @{
        Action      = $taskAction
        Trigger     = $trigger
        Settings    = $settings
        Principal   = $principal
        Config      = $config
    }
}

function Register-GoodMorningTask {
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($null -ne $existing) {
        Write-Host "Task '$taskName' already exists. Use '-Action update' to modify or '-Action unregister' to remove."
        return
    }

    $components = Get-TaskComponents

    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $components.Action `
        -Trigger $components.Trigger `
        -Settings $components.Settings `
        -Principal $components.Principal `
        -Description "Good Morning Claude - Briefing session at $($components.Config.time) on $($components.Config.daysOfWeek -join ', ')" | Out-Null

    Write-Host "Registered '$taskName' - runs at $($components.Config.time) on $($components.Config.daysOfWeek -join ', ')"
    Write-Host "Missed runs will execute at next logon (StartWhenAvailable enabled)."
}

function Unregister-GoodMorningTask {
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($null -eq $existing) {
        Write-Host "Task '$taskName' does not exist."
        return
    }

    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Unregistered '$taskName'."
}

function Update-GoodMorningTask {
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($null -eq $existing) {
        Write-Host "Task '$taskName' does not exist. Use '-Action register' first."
        return
    }

    $components = Get-TaskComponents

    Set-ScheduledTask `
        -TaskName $taskName `
        -Action $components.Action `
        -Trigger $components.Trigger `
        -Settings $components.Settings `
        -Principal $components.Principal | Out-Null

    Write-Host "Updated '$taskName' - runs at $($components.Config.time) on $($components.Config.daysOfWeek -join ', ')"
}

switch ($Action) {
    "register"   { Register-GoodMorningTask }
    "unregister" { Unregister-GoodMorningTask }
    "update"     { Update-GoodMorningTask }
}
