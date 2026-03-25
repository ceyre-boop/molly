# Bulk Import Helper for TABOOST
# Guides through the new creator import process

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║           TABOOST — BULK IMPORT HELPER                       ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# Check for CSV files in common locations
$SearchPaths = @(
    "$env:USERPROFILE\Downloads",
    "$env:USERPROFILE\Desktop",
    (Join-Path $RootDir "..\TABOOST_Platfrom\data" | Resolve-Path)
)

Write-Host "🔍 Scanning for CSV files..." -ForegroundColor White
Write-Host ""

$CSVFiles = @()
foreach ($Path in $SearchPaths) {
    if (Test-Path $Path) {
        $Files = Get-ChildItem -Path $Path -Filter "*.csv" -ErrorAction SilentlyContinue | 
                 Select-Object FullName, Name, LastWriteTime, @{N="SizeKB";E={[math]::Round($_.Length/1KB,1)}}
        $CSVFiles += $Files
    }
}

if ($CSVFiles.Count -eq 0) {
    Write-Host "❌ No CSV files found in common locations" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please export your Google Sheet as CSV and save it to Downloads" -ForegroundColor White
    Write-Host ""
    exit 0
}

Write-Host "📁 Found CSV files:" -ForegroundColor White
for ($i = 0; $i -lt $CSVFiles.Count; $i++) {
    $File = $CSVFiles[$i]
    Write-Host "   [$($i+1)] $($File.Name) ($($File.SizeKB) KB, $($File.LastWriteTime.ToString('MMM dd')))" -ForegroundColor Gray
    Write-Host "       Path: $($File.FullName)" -ForegroundColor DarkGray
}
Write-Host ""

# Let user pick or specify path
Write-Host "Options:" -ForegroundColor White
Write-Host "   [1-$($CSVFiles.Count)] Select file from list above" -ForegroundColor Gray
Write-Host "   [P] Enter custom path" -ForegroundColor Gray
Write-Host "   [O] Open bulk import tool in browser" -ForegroundColor Gray
Write-Host ""

$Choice = Read-Host "Enter choice"

if ($Choice -eq "O" -or $Choice -eq "o") {
    Write-Host ""
    Write-Host "🌐 Opening: https://live.taboost.me/bulk-import-new.html" -ForegroundColor Cyan
    Start-Process "https://live.taboost.me/bulk-import-new.html"
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor White
    Write-Host "   1. Click 'Choose CSV File'" -ForegroundColor Gray
    Write-Host "   2. Select your exported CSV" -ForegroundColor Gray
    Write-Host "   3. Review the NEW creators count" -ForegroundColor Gray
    Write-Host "   4. Click 'IMPORT NEW CREATORS'" -ForegroundColor Gray
    Write-Host ""
    exit 0
}

$SelectedFile = $null
if ($Choice -match "^\d+$" -and [int]$Choice -ge 1 -and [int]$Choice -le $CSVFiles.Count) {
    $SelectedFile = $CSVFiles[[int]$Choice - 1]
} elseif ($Choice -eq "P" -or $Choice -eq "p") {
    $CustomPath = Read-Host "Enter full path to CSV file"
    if (Test-Path $CustomPath) {
        $SelectedFile = Get-Item $CustomPath | Select-Object FullName, Name, @{N="SizeKB";E={[math]::Round($_.Length/1KB,1)}}
    } else {
        Write-Host "❌ File not found: $CustomPath" -ForegroundColor Red
        exit 1
    }
}

if ($SelectedFile) {
    Write-Host ""
    Write-Host "✅ Selected: $($SelectedFile.Name)" -ForegroundColor Green
    Write-Host ""
    
    # Quick CSV validation
    try {
        $Content = Get-Content $SelectedFile.FullName -TotalCount 5
        $CreatorCount = (Get-Content $SelectedFile.FullName).Count - 1
        
        Write-Host "📊 CSV Preview:" -ForegroundColor White
        $Content | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }
        Write-Host ""
        Write-Host "   Estimated creators: ~$CreatorCount" -ForegroundColor Gray
        Write-Host ""
    } catch {
        Write-Host "⚠️  Could not read file" -ForegroundColor Yellow
    }
    
    Write-Host "Next steps:" -ForegroundColor White
    Write-Host "   1. Go to: https://live.taboost.me/bulk-import-new.html" -ForegroundColor Cyan
    Write-Host "   2. Upload: $($SelectedFile.FullName)" -ForegroundColor Gray
    Write-Host "   3. Review and import new creators" -ForegroundColor Gray
    Write-Host ""
}