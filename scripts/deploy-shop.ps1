# Deploy TABOOST-Shop
# Usage: .\deploy-shop.ps1 [message]

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$RepoPath = Join-Path $RootDir "..\TABOOST-Shop-temp" | Resolve-Path
$LogPath = Join-Path $RootDir "logs\deployments.log"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║           TABOOST SHOP — DEPLOYMENT PIPELINE                 ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

try {
    Set-Location $RepoPath -ErrorAction Stop
    Write-Host "📁 Repository: TABOOST-Shop-temp" -ForegroundColor White
    Write-Host "🛒 Target: https://ceyre-boop.github.io/TABOOST-Shop/" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ ERROR: Could not find repository at $RepoPath" -ForegroundColor Red
    exit 1
}

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

$Message = $args[0]
if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = "Auto-deploy: Update shop data ($(Get-Date -Format 'yyyy-MM-dd'))"
}

Write-Host "📝 Commit message: $Message" -ForegroundColor White
Write-Host ""

try {
    Write-Host "━ Staging changes..." -NoNewline -ForegroundColor DarkGray
    git add -A 2>$null
    Write-Host " Done" -ForegroundColor Green
    
    Write-Host "━ Committing..." -NoNewline -ForegroundColor DarkGray
    git commit -m "$Message" 2>&1 | Out-Null
    Write-Host " Done" -ForegroundColor Green
    
    Write-Host "━ Pulling latest..." -NoNewline -ForegroundColor DarkGray
    git pull origin main 2>&1 | Out-Null
    Write-Host " Done" -ForegroundColor Green
    
    Write-Host "━ Pushing to GitHub..." -NoNewline -ForegroundColor DarkGray
    git push origin main 2>&1 | Out-Null
    Write-Host " Done" -ForegroundColor Green
    
    "$Timestamp | SHOP | SUCCESS | $Message" | Out-File -Append -FilePath $LogPath
    
    Write-Host ""
    Write-Host "✅ DEPLOYMENT SUCCESSFUL" -ForegroundColor Green
    Write-Host ""
    Write-Host "   Live in ~2 minutes at: https://ceyre-boop.github.io/TABOOST-Shop/" -ForegroundColor Gray
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ DEPLOYMENT FAILED" -ForegroundColor Red
    Write-Host "   Error: $_" -ForegroundColor Red
    Write-Host ""
    "$Timestamp | SHOP | FAILED | $_" | Out-File -Append -FilePath $LogPath
    exit 1
}