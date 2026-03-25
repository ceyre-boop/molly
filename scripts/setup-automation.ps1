#
# Molly - Windows Automation Setup (Task Scheduler)
# Configures Windows Task Scheduler for autonomous monitoring
#

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           MOLLY AUTOMATION SETUP (Windows)                   ║" -ForegroundColor Cyan
Write-Host "║           Configure Autonomous Monitoring                    ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if running as admin
$IsAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $IsAdmin) {
    Write-Host "⚠️  Note: Some features may require admin rights" -ForegroundColor Yellow
    Write-Host "   Right-click PowerShell and 'Run as Administrator' if needed" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "📋 Automation Options:" -ForegroundColor White
Write-Host ""
Write-Host "   [1] Basic Monitoring (check every 6 hours, notify only)" -ForegroundColor Gray
Write-Host "   [2] Auto-Fix Mode (check every 2 hours, fix common issues)" -ForegroundColor Gray
Write-Host "   [3] Full Autonomy (check every hour, fix + optimize + report)" -ForegroundColor Gray
Write-Host "   [4] Custom Schedule" -ForegroundColor Gray
Write-Host "   [5] Disable All Automation" -ForegroundColor Gray
Write-Host ""

$Choice = Read-Host "Select option [1-5]"

switch ($Choice) {
    "1" {
        $Interval = 6
        $Mode = "monitor"
        Write-Host "✅ Basic monitoring every 6 hours" -ForegroundColor Green
    }
    "2" {
        $Interval = 2
        $Mode = "auto-fix"
        Write-Host "✅ Auto-fix mode every 2 hours" -ForegroundColor Green
    }
    "3" {
        $Interval = 1
        $Mode = "full-autonomy"
        Write-Host "✅ Full autonomy every hour" -ForegroundColor Green
    }
    "4" {
        $Interval = Read-Host "Enter interval in hours"
        $Mode = "custom"
    }
    "5" {
        Write-Host "Removing all Molly automation..." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName "Molly Autonomous Monitor" -Confirm:$false -ErrorAction SilentlyContinue
        Write-Host "✅ All automation disabled" -ForegroundColor Green
        exit 0
    }
    default {
        Write-Host "❌ Invalid option" -ForegroundColor Red
        exit 1
    }
}

# Create scheduled task
$TaskName = "Molly Autonomous Monitor"
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$RootDir\scripts\autonomous-monitor.ps1`""
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours $Interval) -RepetitionDuration (New-TimeSpan -Days 3650)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# Remove existing task if exists
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Register new task
try {
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Molly Autonomous Health Monitor - $Mode mode" -ErrorAction Stop
    Write-Host ""
    Write-Host "✅ Automation configured!" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "❌ Failed to create scheduled task. Run as Administrator?" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "📊 Details:" -ForegroundColor White
Write-Host "   Mode: $Mode" -ForegroundColor Gray
Write-Host "   Interval: Every $Interval hours" -ForegroundColor Gray
Write-Host "   Task: $TaskName" -ForegroundColor Gray
Write-Host "   Log: $RootDir\logs\cron.log" -ForegroundColor Gray
Write-Host ""

# Test run
$TestNow = Read-Host "Run autonomous check now [y/N]"
if ($TestNow -match "^[Yy]$") {
    Write-Host ""
    & "$RootDir\scripts\autonomous-monitor.ps1"
}

Write-Host ""
Write-Host "💡 To modify: Open Task Scheduler → Task Scheduler Library → $TaskName" -ForegroundColor Gray
Write-Host "💡 To view logs: Get-Content '$RootDir\logs\cron.log' -Tail 20" -ForegroundColor Gray
Write-Host ""