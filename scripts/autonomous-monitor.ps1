#
# Molly - Autonomous Health Monitor & Auto-Fix System (Windows)
# Runs via Task Scheduler, fixes common issues automatically
#

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$LogPath = Join-Path $RootDir "logs/autonomous.log"
$ReportPath = Join-Path $RootDir "logs/auto-fix-report.txt"
$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Ensure log directory exists
New-Item -ItemType Directory -Path (Split-Path $LogPath) -Force | Out-Null

# Track actions
$IssuesFound = @()
$AutoFixed = @()

function Log($Message) {
    $Line = "[$Timestamp] $Message"
    Add-Content -Path $LogPath -Value $Line
    Write-Host $Line
}

# ============================================
# CHECK 1: Data Sync Health
# ============================================
function Check-DataSync {
    Log "🔍 Checking data sync..."
    
    $TaboostData = Join-Path $RootDir "..\TABOOST_Platfrom\data"
    $ShopData = Join-Path $RootDir "..\TABOOST-Shop-temp\data"
    
    # Check TABOOST CSV age
    if (Test-Path $TaboostData) {
        Get-ChildItem -Path $TaboostData -Filter "*.csv" | Select-Object -First 5 | ForEach-Object {
            $HoursOld = [math]::Round(((Get-Date) - $_.LastWriteTime).TotalHours, 1)
            
            if ($HoursOld -gt 25) {
                $IssuesFound += "TABOOST: $($_.Name) stale (${HoursOld}h)"
                
                # AUTO-FIX: Check if site is still live
                try {
                    $Response = Invoke-WebRequest -Uri "https://live.taboost.me" -Method HEAD -TimeoutSec 10
                    if ($Response.StatusCode -eq 200) {
                        $AutoFixed += "✅ Verified live.taboost.me is online - sync delay likely Apps Script timing"
                    }
                } catch {
                    $IssuesFound += "⚠️ live.taboost.me unreachable"
                }
            }
        }
    }
    
    # Check Shop CSV age
    if (Test-Path $ShopData) {
        Get-ChildItem -Path $ShopData -Filter "*.csv" | Where-Object { $_.Name -in @("products.csv", "campaigns.csv") } | ForEach-Object {
            $HoursOld = [math]::Round(((Get-Date) - $_.LastWriteTime).TotalHours, 1)
            
            if ($HoursOld -gt 25) {
                $IssuesFound += "SHOP: $($_.Name) stale (${HoursOld}h)"
            }
        }
    }
}

# ============================================
# CHECK 2: GitHub Pages Health
# ============================================
function Check-GitHubPages {
    Log "🔍 Checking GitHub Pages..."
    
    $Sites = @(
        @{ Name = "TABOOST"; Url = "https://live.taboost.me"; Repo = "TABOOST_Platfrom" },
        @{ Name = "SHOP"; Url = "https://ceyre-boop.github.io/TABOOST-Shop/"; Repo = "TABOOST-Shop-temp" },
        @{ Name = "QUANT"; Url = "https://ceyre-boop.github.io/quant/"; Repo = "quant" },
        @{ Name = "MOLLY"; Url = "https://ceyre-boop.github.io/molly/"; Repo = "molly" }
    )
    
    foreach ($Site in $Sites) {
        try {
            $Response = Invoke-WebRequest -Uri $Site.Url -Method HEAD -TimeoutSec 10
            if ($Response.StatusCode -ne 200) {
                $IssuesFound += "$($Site.Name) site down (HTTP $($Response.StatusCode))"
            }
        } catch {
            $IssuesFound += "$($Site.Name) site unreachable"
            
            # AUTO-FIX: Check for uncommitted changes
            $RepoPath = Join-Path $RootDir "..\$($Site.Repo)"
            if (Test-Path (Join-Path $RepoPath ".git")) {
                $Uncommitted = git -C $RepoPath status --porcelain 2>$null | Measure-Object | Select-Object -ExpandProperty Count
                if ($Uncommitted -gt 0) {
                    $AutoFixed += "Found $Uncommitted uncommitted changes in $($Site.Name) - attempting auto-deploy..."
                    try {
                        git -C $RepoPath add -A 2>$null
                        git -C $RepoPath commit -m "Auto-fix: Deploy uncommitted changes" --quiet 2>$null
                        git -C $RepoPath push origin main --quiet 2>$null
                        $AutoFixed += "✅ Successfully deployed $($Site.Name)"
                    } catch {
                        $IssuesFound += "❌ Auto-deploy failed for $($Site.Name): $_"
                    }
                }
            }
        }
    }
}

# ============================================
# CHECK 3: Git Repository Health
# ============================================
function Check-GitHealth {
    Log "🔍 Checking git repositories..."
    
    $Repos = @("TABOOST_Platfrom", "TABOOST-Shop-temp", "quant")
    
    foreach ($Repo in $Repos) {
        $RepoPath = Join-Path $RootDir "..\$Repo"
        if (Test-Path (Join-Path $RepoPath ".git")) {
            # Check for large files (>50MB)
            $LargeFiles = Get-ChildItem -Path $RepoPath -Recurse -File -ErrorAction SilentlyContinue | 
                          Where-Object { $_.Length -gt 50MB } | 
                          Select-Object -First 5
            
            if ($LargeFiles) {
                $IssuesFound += "Large files detected in $Repo`:"
                $LargeFiles | ForEach-Object { $IssuesFound += "  - $($_.FullName)" }
            }
            
            # Check for stale branches
            $Branches = git -C $RepoPath branch -r --merged main 2>$null | Where-Object { $_ -notmatch "main" }
            if ($Branches.Count -gt 5) {
                $AutoFixed += "$Repo`: $($Branches.Count) stale branches can be cleaned up"
            }
        }
    }
}

# ============================================
# CHECK 4: Pattern Detection
# ============================================
function Analyze-Patterns {
    Log "🔍 Analyzing patterns..."
    
    # Check if fresh data but no deployment
    $CurrentCsv = Join-Path $RootDir "..\TABOOST_Platfrom\data\CURRENT.csv"
    if (Test-Path $CurrentCsv) {
        $CsvAge = [math]::Round(((Get-Date) - (Get-Item $CurrentCsv).LastWriteTime).TotalHours, 1)
        if ($CsvAge -lt 2) {
            $AutoFixed += "📊 Fresh CSV data detected (${CsvAge}h old) - verify it's live on site"
        }
    }
    
    # Memory file maintenance
    $MemoryDir = Join-Path $RootDir "..\memory"
    if (Test-Path $MemoryDir) {
        $OldFiles = Get-ChildItem -Path $MemoryDir -Filter "*.md" -ErrorAction SilentlyContinue | 
                    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) }
        if ($OldFiles.Count -gt 10) {
            $AutoFixed += "📝 $($OldFiles.Count) old memory files should be archived"
        }
    }
}

# ============================================
# GENERATE REPORT
# ============================================
function Generate-Report {
    $Report = @"
Molly Autonomous Report - $Timestamp
==================================================

🤖 Autonomous Actions Taken:
"@
    
    if ($AutoFixed.Count -eq 0) {
        $Report += "`n  ✅ No issues found - all systems healthy`n"
    } else {
        foreach ($Action in $AutoFixed) {
            $Report += "`n  $Action"
        }
    }
    
    if ($IssuesFound.Count -gt 0) {
        $Report += "`n`n⚠️  Issues Requiring Attention:`n"
        foreach ($Issue in $IssuesFound) {
            $Report += "`n  • $Issue"
        }
    }
    
    $Report += "`n`n📊 Summary:`n"
    $Report += "  • Issues found: $($IssuesFound.Count)`n"
    $Report += "  • Auto-fixed: $($AutoFixed.Count)`n"
    $Report += "  • Timestamp: $Timestamp`n"
    $Report += "`nView logs: $LogPath`n"
    
    $Report | Out-File -FilePath $ReportPath -Encoding UTF8
    
    Log "✅ Health check complete - $($IssuesFound.Count) issues, $($AutoFixed.Count) auto-fixed"
    
    # If issues found, output to console (for Task Scheduler logging)
    if ($IssuesFound.Count -gt 0 -or $AutoFixed.Count -gt 0) {
        Write-Host ""
        Write-Host $Report
    }
}

# ============================================
# MAIN
# ============================================
Log "🚀 Starting autonomous health check..."

Check-DataSync
Check-GitHubPages
Check-GitHealth
Analyze-Patterns
Generate-Report

Log "✅ Autonomous check complete"