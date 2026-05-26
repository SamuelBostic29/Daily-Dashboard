param(
    [ValidateSet("register", "unregister", "update")]
    [string]$Action = "register"
)

$taskName = "GoodMorningClaude"
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$configPath = Join-Path $repoRoot "config\schedule.json"
$hiddenScript = Join-Path $repoRoot "scripts\run-hidden.vbs"

function Get-ScheduleConfig {
    if (-not (Test-Path $configPath)) {
        Write-Error "Config file not found at: $configPath"
        exit 1
    }
    return Get-Content -Raw $configPath | ConvertFrom-Json
}

function Get-TaskDescription {
    param([PSCustomObject]$Config)
    if ($null -ne $Config.intervalMinutes -and $null -ne $Config.endTime) {
        return "every $($Config.intervalMinutes)min from $($Config.startTime) to $($Config.endTime) on $($Config.daysOfWeek -join ', ')"
    }
    return "runs at $($Config.startTime) on $($Config.daysOfWeek -join ', ')"
}

function Get-TaskComponents {
    $config = Get-ScheduleConfig
    [string[]]$startParts = $config.startTime -split ":"
    [int]$hour = $startParts[0]
    [int]$minute = $startParts[1]

    $taskAction = New-ScheduledTaskAction `
        -Execute "wscript.exe" `
        -Argument "`"$hiddenScript`"" `
        -WorkingDirectory $repoRoot

    [System.DayOfWeek[]]$days = $config.daysOfWeek | ForEach-Object { [System.DayOfWeek]$_ }

    $trigger = New-ScheduledTaskTrigger `
        -Weekly -WeeksInterval 1 `
        -DaysOfWeek $days `
        -At ("{0:D2}:{1:D2}" -f $hour, $minute)

    if ($null -ne $config.intervalMinutes -and $null -ne $config.endTime) {
        [string[]]$endParts = $config.endTime -split ":"
        [int]$endHour = $endParts[0]
        [int]$endMinute = $endParts[1]
        [TimeSpan]$duration = New-TimeSpan -Hours ($endHour - $hour) -Minutes ($endMinute - $minute)
        [TimeSpan]$interval = New-TimeSpan -Minutes ([int]$config.intervalMinutes)

        $repetition = (New-ScheduledTaskTrigger -Once -At "00:00" `
            -RepetitionInterval $interval `
            -RepetitionDuration $duration).Repetition
        $trigger.Repetition = $repetition
    }

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -MultipleInstances IgnoreNew `
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
        -Description (Get-TaskDescription $components.Config) | Out-Null

    Write-Host "Registered '$taskName' - $(Get-TaskDescription $components.Config)"
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

    Write-Host "Updated '$taskName' - $(Get-TaskDescription $components.Config)"
}

switch ($Action) {
    "register"   { Register-GoodMorningTask }
    "unregister" { Unregister-GoodMorningTask }
    "update"     { Update-GoodMorningTask }
}
