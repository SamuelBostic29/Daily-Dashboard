param(
    [ValidateSet("register", "unregister", "update")]
    [string]$Action = "register"
)

# Surface registration failures instead of silently continuing to the success message.
$ErrorActionPreference = 'Stop'

$taskName = "DailyDashboard"
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
    # startTime is the new key; fall back to legacy "time" for pre-migration configs.
    [string]$startTime = if ($config.startTime) { $config.startTime } else { $config.time }
    [string[]]$timeParts = $startTime -split ":"
    [int]$hour = $timeParts[0]
    [int]$minute = $timeParts[1]

    # Launch windowless: conhost --headless suppresses the console-host window, and
    # -WindowStyle Hidden covers the brief pre-render flash. Same pattern used for the
    # user's Stream Deck launches. powershell.exe is always present, no PATH resolution needed.
    $taskAction = New-ScheduledTaskAction `
        -Execute "conhost.exe" `
        -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`"" `
        -WorkingDirectory $repoRoot

    [System.DayOfWeek[]]$days = $config.daysOfWeek | ForEach-Object { [System.DayOfWeek]$_ }
    [string]$at = "{0:D2}:{1:D2}" -f $hour, $minute

    $trigger = New-ScheduledTaskTrigger `
        -Weekly -WeeksInterval 1 `
        -DaysOfWeek $days `
        -At $at

    # When an interval is configured, poll all day: fire at startTime, then repeat every
    # intervalMinutes until endTime. Weekly triggers don't take repetition params directly,
    # so borrow a repetition block from a throwaway -Once trigger. No interval => single daily run.
    [int]$intervalMinutes = if ($config.intervalMinutes) { [int]$config.intervalMinutes } else { 0 }
    if ($intervalMinutes -gt 0) {
        if (-not $config.endTime) {
            Write-Error "schedule.json: endTime is required when intervalMinutes is set."
            exit 1
        }
        [string[]]$endParts = $config.endTime -split ":"
        $duration = (New-TimeSpan -Hours ([int]$endParts[0]) -Minutes ([int]$endParts[1])) -
                    (New-TimeSpan -Hours $hour -Minutes $minute)
        if ($duration -le [TimeSpan]::Zero) {
            Write-Error "schedule.json: endTime ($($config.endTime)) must be after startTime ($startTime)."
            exit 1
        }

        $trigger.Repetition = (New-ScheduledTaskTrigger -Once -At $at `
            -RepetitionInterval (New-TimeSpan -Minutes $intervalMinutes) `
            -RepetitionDuration $duration).Repetition
    }

    [string]$scheduleSummary = if ($intervalMinutes -gt 0) {
        "every $intervalMinutes min from $startTime to $($config.endTime)"
    } else {
        "at $startTime"
    }

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Hours 1)

    # Run only when the user is logged on — no admin rights needed to register. The
    # conhost --headless action keeps each run windowless within the user's session.
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
        StartTime   = $startTime
        Schedule    = $scheduleSummary
    }
}

function Register-DailyDashboardTask {
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
        -Description "Daily Dashboard - Briefing session $($components.Schedule) on $($components.Config.daysOfWeek -join ', ')" | Out-Null

    Write-Host "Registered '$taskName' - runs $($components.Schedule) on $($components.Config.daysOfWeek -join ', ')"
    Write-Host "Missed runs will execute at next logon (StartWhenAvailable enabled)."
}

function Unregister-DailyDashboardTask {
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($null -eq $existing) {
        Write-Host "Task '$taskName' does not exist."
        return
    }

    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Unregistered '$taskName'."
}

function Update-DailyDashboardTask {
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

    Write-Host "Updated '$taskName' - runs $($components.Schedule) on $($components.Config.daysOfWeek -join ', ')"
}

switch ($Action) {
    "register"   { Register-DailyDashboardTask }
    "unregister" { Unregister-DailyDashboardTask }
    "update"     { Update-DailyDashboardTask }
}
