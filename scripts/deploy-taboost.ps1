# Deploy TABOOST Platform
# Usage: .\deploy-taboost.ps1 [message]

$RepoPath = "C:\Users\Admin\clawd\TABOOST_Platfrom"
$LogPath = "C:\Users\Admin\clawd\molly\logs\deployments.log"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           TABOOST PLATFORM — DEPLOYMENT PIPELINE             ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Timestamp
$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Change to repo
try {
    Set-Location $RepoPath -ErrorAction Stop
    Write-Host "📁 Repository: TABOOST_Platfrom" -ForegroundColor White
    Write-Host "🌐 Target: https://live.taboost.me" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ ERROR: Could not find repository at $RepoPath" -ForegroundColor Red
    exit 1
}

# Check git status
Write-Host "━ Checking repository status..." -NoNewline -ForegroundColor DarkGray
$Status = git status --porcelain
Write-Host " Done" -ForegroundColor Green

if ($Status) {
    Write-Host ""
    Write-Host "📋 Changes detected:" -ForegroundColor Yellow
    $Status | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "✓ No changes to deploy" -ForegroundColor Green
    Write-Host ""
    exit 0
}

# Get commit message
$Message = $args[0]
if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = "Auto-deploy: Update data files ($(Get-Date -Format 'yyyy-MM-dd'))"
}

Write-Host "📝 Commit message: $Message" -ForegroundColor White
Write-Host ""

# Stage, commit, push
try {
    Write-Host "━ Staging changes..." -NoNewline -ForegroundColor DarkGray
    git add -A 2>$null
    Write-Host " Done" -ForegroundColor Green
    
    Write-Host "━ Committing..." -NoNewline -ForegroundColor DarkGray
    $Commit = git commit -m "$Message" 2>&1
    Write-Host " Done" -ForegroundColor Green
    
    Write-Host "━ Pushing to GitHub..." -NoNewline -ForegroundColor DarkGray
    git push origin main 2>&1 | Out-Null
    Write-Host " Done" -ForegroundColor Green
    
    # Log deployment
    "$Timestamp | TABOOST | SUCCESS | $Message" | Out-File -Append -FilePath $LogPath
    
    Write-Host ""
    Write-Host "✅ DEPLOYMENT SUCCESSFUL" -ForegroundColor Green
    Write-Host ""
    Write-Host "   Live in ~2 minutes at: https://live.taboost.me" -ForegroundColor Gray
    Write-Host "   Log: $LogPath" -ForegroundColor Gray
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ DEPLOYMENT FAILED" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
    Write-Host ""
    "$Timestamp | TABOOST | FAILED | $_" | Out-File -Append -FilePath $LogPath
    exit 1
}