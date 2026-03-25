# Health Check Script for Colin's Projects
# Checks: TABOOST, TABOOST-Shop, Data Sync, GitHub Pages

$LogPath = "C:\Users\Admin\clawd\molly\logs\health-checks.log"
$ReportPath = "C:\Users\Admin\clawd\molly\logs\latest-health-report.txt"
$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                   SYSTEM HEALTH CHECK                        ║" -ForegroundColor Cyan
Write-Host "║                       $Timestamp                    ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$Issues = @()
$Report = @("Health Check Report - $Timestamp", "=" * 50, "")

# ============================================
# 1. TABOOST Data Check
# ============================================
Write-Host "📊 TABOOST Data Files:" -ForegroundColor White
$Report += "📊 TABOOST Data Files:"

try {
    $DataPath = "C:\Users\Admin\clawd\TABOOST_Platfrom\data"
    $Files = Get-ChildItem $DataPath\*.csv -ErrorAction Stop | 
             Select-Object Name, LastWriteTime, @{N="HoursOld";E={[math]::Round(((Get-Date)-$_.LastWriteTime).TotalHours,1)}}
    
    foreach ($File in $Files | Sort-Object HoursOld | Select-Object -First 5) {
        $Status = if ($File.HoursOld -lt 25) { "✅" } else { "⚠️ " }
        $Color = if ($File.HoursOld -lt 25) { "Green" } else { "Yellow" }
        Write-Host "   $Status $($File.Name) - $($File.HoursOld)h old" -ForegroundColor $Color
        $Report += "   $Status $($File.Name) - $($File.HoursOld)h old"
        
        if ($File.HoursOld -gt 25) {
            $Issues += "TABOOST: $($File.Name) is stale ($($File.HoursOld)h old)"
        }
    }
} catch {
    Write-Host "   ❌ Error checking TABOOST data" -ForegroundColor Red
    $Issues += "TABOOST: Data check failed - $_"
}
Write-Host ""
$Report += ""

# ============================================
# 2. TABOOST-Shop Data Check
# ============================================
Write-Host "🛒 TABOOST-Shop Data Files:" -ForegroundColor White
$Report += "🛒 TABOOST-Shop Data Files:"

try {
    $DataPath = "C:\Users\Admin\clawd\TABOOST-Shop-temp\data"
    $Files = Get-ChildItem $DataPath\*.csv -ErrorAction Stop | 
             Select-Object Name, LastWriteTime, @{N="HoursOld";E={[math]::Round(((Get-Date)-$_.LastWriteTime).TotalHours,1)}}
    
    foreach ($File in $Files | Sort-Object HoursOld | Select-Object -First 5) {
        $Status = if ($File.HoursOld -lt 25) { "✅" } else { "⚠️ " }
        $Color = if ($File.HoursOld -lt 25) { "Green" } else { "Yellow" }
        Write-Host "   $Status $($File.Name) - $($File.HoursOld)h old" -ForegroundColor $Color
        $Report += "   $Status $($File.Name) - $($File.HoursOld)h old"
        
        if ($File.HoursOld -gt 25) {
            $Issues += "SHOP: $($File.Name) is stale ($($File.HoursOld)h old)"
        }
    }
} catch {
    Write-Host "   ❌ Error checking Shop data" -ForegroundColor Red
    $Issues += "SHOP: Data check failed - $_"
}
Write-Host ""
$Report += ""

# ============================================
# 3. GitHub Pages Health Check
# ============================================
Write-Host "🌐 GitHub Pages Status:" -ForegroundColor White
$Report += "🌐 GitHub Pages Status:"

$Sites = @(
    @{ Name = "TABOOST"; Url = "https://live.taboost.me" },
    @{ Name = "Shop"; Url = "https://ceyre-boop.github.io/TABOOST-Shop/" },
    @{ Name = "Quant"; Url = "https://ceyre-boop.github.io/quant/" }
)

foreach ($Site in $Sites) {
    try {
        $Response = Invoke-WebRequest -Uri $Site.Url -Method HEAD -TimeoutSec 10 -ErrorAction Stop
        $Status = $Response.StatusCode
        $Icon = if ($Status -eq 200) { "✅" } else { "⚠️ " }
        $Color = if ($Status -eq 200) { "Green" } else { "Yellow" }
        Write-Host "   $Icon $($Site.Name): HTTP $Status" -ForegroundColor $Color
        $Report += "   $Icon $($Site.Name): HTTP $Status"
    } catch {
        Write-Host "   ❌ $($Site.Name): OFFLINE - $_" -ForegroundColor Red
        $Report += "   ❌ $($Site.Name): OFFLINE"
        $Issues += "$($Site.Name): Site unreachable"
    }
}
Write-Host ""
$Report += ""

# ============================================
# Summary
# ============================================
Write-Host "━" * 64 -ForegroundColor DarkGray
$Report += "-" * 50

if ($Issues.Count -eq 0) {
    Write-Host ""
    Write-Host "✅ ALL SYSTEMS OPERATIONAL" -ForegroundColor Green
    Write-Host "   No issues detected" -ForegroundColor Gray
    Write-Host ""
    $Report += "", "✅ ALL SYSTEMS OPERATIONAL", "   No issues detected"
    $ExitCode = 0
} else {
    Write-Host ""
    Write-Host "⚠️  ISSUES DETECTED ($($Issues.Count))" -ForegroundColor Yellow
    foreach ($Issue in $Issues) {
        Write-Host "   • $Issue" -ForegroundColor Yellow
    }
    Write-Host ""
    $Report += "", "⚠️  ISSUES DETECTED ($($Issues.Count))"
    foreach ($Issue in $Issues) {
        $Report += "   • $Issue"
    }
    $ExitCode = 1
}

# Save report
$Report | Out-File -FilePath $ReportPath -Encoding UTF8
"$Timestamp | Health Check | $(if($Issues.Count -eq 0){'OK'}else{'ISSUES: ' + $Issues.Count})" | Out-File -Append -FilePath $LogPath

Write-Host "📄 Report saved to: $ReportPath" -ForegroundColor Gray
Write-Host ""

exit $ExitCode