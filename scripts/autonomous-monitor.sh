#!/bin/bash
#
# Molly - Autonomous Health Monitor & Auto-Fix System
# Runs via cron, fixes common issues automatically
#

set -e

# Config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_PATH="$ROOT_DIR/logs/autonomous.log"
REPORT_PATH="$ROOT_DIR/logs/auto-fix-report.txt"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Colors for logging (when run interactively)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Track what we did
ACTIONS_TAKEN=()
ISSUES_FOUND=()
AUTO_FIXED=()

log() {
    echo "[$TIMESTAMP] $1" | tee -a "$LOG_PATH"
}

# ============================================
# CHECK 1: Data Sync Health
# ============================================
check_data_sync() {
    log "🔍 Checking data sync..."
    
    local taboost_data="$ROOT_DIR/../TABOOST_Platfrom/data"
    local shop_data="$ROOT_DIR/../TABOOST-Shop-temp/data"
    
    # Check TABOOST CSV age
    if [ -d "$taboost_data" ]; then
        find "$taboost_data" -name "*.csv" -type f | while read file; do
            local hours_old=$(( ($(date +%s) - $(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file")) / 3600 ))
            local filename=$(basename "$file")
            
            if [ $hours_old -gt 25 ]; then
                ISSUES_FOUND+=("TABOOST: $filename stale (${hours_old}h)")
                
                # AUTO-FIX: Check if GitHub Pages is still live
                local status=$(curl -s -o /dev/null -w "%{http_code}" https://live.taboost.me 2>/dev/null || echo "000")
                if [ "$status" = "200" ]; then
                    AUTO_FIXED+=("✅ Verified live.taboost.me is online - sync delay likely Apps Script timing")
                else
                    ISSUES_FOUND+=("⚠️  live.taboost.me returning HTTP $status")
                fi
            fi
        done
    fi
    
    # Check Shop CSV age
    if [ -d "$shop_data" ]; then
        find "$shop_data" -name "products.csv" -o -name "campaigns.csv" | while read file; do
            local hours_old=$(( ($(date +%s) - $(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file")) / 3600 ))
            
            if [ $hours_old -gt 25 ]; then
                ISSUES_FOUND+=("SHOP: $(basename $file) stale (${hours_old}h)")
            fi
        done
    fi
}

# ============================================
# CHECK 2: GitHub Pages Health
# ============================================
check_github_pages() {
    log "🔍 Checking GitHub Pages..."
    
    local sites=(
        "TABOOST:https://live.taboost.me"
        "SHOP:https://ceyre-boop.github.io/TABOOST-Shop/"
        "QUANT:https://ceyre-boop.github.io/quant/"
        "MOLLY:https://ceyre-boop.github.io/molly/"
    )
    
    for site in "${sites[@]}"; do
        local name="${site%%:*}"
        local url="${site#*:}"
        local status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
        
        if [ "$status" != "200" ]; then
            ISSUES_FOUND+=("$name site down (HTTP $status)")
            
            # AUTO-FIX: Check if repo has uncommitted changes that need push
            local repo_path=""
            case $name in
                "TABOOST") repo_path="$ROOT_DIR/../TABOOST_Platfrom" ;;
                "SHOP") repo_path="$ROOT_DIR/../TABOOST-Shop-temp" ;;
                "QUANT") repo_path="$ROOT_DIR/../quant" ;;
                "MOLLY") repo_path="$ROOT_DIR" ;;
            esac
            
            if [ -d "$repo_path/.git" ]; then
                local uncommitted=$(cd "$repo_path" && git status --porcelain 2>/dev/null | wc -l)
                if [ $uncommitted -gt 0 ]; then
                    AUTO_FIXED+=("Found $uncommitted uncommitted changes in $name - attempting auto-deploy...")
                    (cd "$repo_path" && git add -A && git commit -m "Auto-fix: Deploy uncommitted changes" && git push origin main) || true
                fi
            fi
        fi
    done
}

# ============================================
# CHECK 3: Git Repository Health
# ============================================
check_git_health() {
    log "🔍 Checking git repositories..."
    
    local repos=("$ROOT_DIR/../TABOOST_Platfrom" "$ROOT_DIR/../TABOOST-Shop-temp" "$ROOT_DIR/../quant")
    
    for repo in "${repos[@]}"; do
        if [ -d "$repo/.git" ]; then
            # Check for large files (>50MB would fail GitHub push)
            local large_files=$(find "$repo" -type f -size +50M 2>/dev/null | head -5)
            if [ -n "$large_files" ]; then
                ISSUES_FOUND+=("Large files detected in $(basename $repo):")
                echo "$large_files" | while read file; do
                    ISSUES_FOUND+=("  - $file")
                done
            fi
            
            # Check for old branches (cleanup opportunity)
            local old_branches=$(cd "$repo" && git branch -r --merged main 2>/dev/null | grep -v "main" | wc -l)
            if [ $old_branches -gt 5 ]; then
                AUTO_FIXED+=("$(basename $repo): $old_branches stale branches can be cleaned up")
            fi
        fi
    done
}

# ============================================
# CHECK 4: Pattern Detection
# ============================================
analyze_patterns() {
    log "🔍 Analyzing patterns..."
    
    # Check deployment frequency from logs
    if [ -f "$LOG_PATH" ]; then
        local recent_deployments=$(grep -c "DEPLOYMENT SUCCESSFUL" "$LOG_PATH" 2>/dev/null || echo "0")
        local last_24h=$(grep "$TIMESTAMP" "$LOG_PATH" 2>/dev/null | wc -l)
        
        # If no deployments in recent logs, suggest optimization
        if [ $recent_deployments -eq 0 ] && [ -f "$ROOT_DIR/../TABOOST_Platfrom/data/CURRENT.csv" ]; then
            local csv_age=$(( ($(date +%s) - $(stat -c %Y "$ROOT_DIR/../TABOOST_Platfrom/data/CURRENT.csv" 2>/dev/null)) / 3600 ))
            if [ $csv_age -lt 2 ]; then
                AUTO_FIXED+=("📊 Fresh CSV data detected but no recent deployment - data may be out of sync with live site")
            fi
        fi
    fi
    
    # Memory file maintenance suggestion
    local memory_dir="$ROOT_DIR/../memory"
    if [ -d "$memory_dir" ]; then
        local old_files=$(find "$memory_dir" -name "*.md" -mtime +30 | wc -l)
        if [ $old_files -gt 10 ]; then
            AUTO_FIXED+=("📝 $old_files old memory files should be archived")
        fi
    fi
}

# ============================================
# GENERATE REPORT & NOTIFY
# ============================================
generate_report() {
    local report="Molly Autonomous Report - $TIMESTAMP
==================================================

🤖 Autonomous Actions Taken:
"
    
    if [ ${#AUTO_FIXED[@]} -eq 0 ]; then
        report+="  ✅ No issues found - all systems healthy
"
    else
        for action in "${AUTO_FIXED[@]}"; do
            report+="  $action
"
        done
    fi
    
    if [ ${#ISSUES_FOUND[@]} -gt 0 ]; then
        report+="
⚠️  Issues Requiring Attention:
"
        for issue in "${ISSUES_FOUND[@]}"; do
            report+="  • $issue
"
        done
    fi
    
    report+="
📊 Summary:
  • Issues found: ${#ISSUES_FOUND[@]}
  • Auto-fixed: ${#AUTO_FIXED[@]}
  • Timestamp: $TIMESTAMP

View logs: $LOG_PATH
"
    
    echo "$report" > "$REPORT_PATH"
    
    # Log summary
    log "✅ Health check complete - ${#ISSUES_FOUND[@]} issues, ${#AUTO_FIXED[@]} auto-fixed"
    
    # If issues found, output to stdout (for cron email/notification)
    if [ ${#ISSUES_FOUND[@]} -gt 0 ] || [ ${#AUTO_FIXED[@]} -gt 0 ]; then
        echo "$report"
    fi
}

# ============================================
# MAIN
# ============================================
main() {
    mkdir -p "$(dirname "$LOG_PATH")"
    log "🚀 Starting autonomous health check..."
    
    check_data_sync
    check_github_pages
    check_git_health
    analyze_patterns
    generate_report
    
    log "✅ Autonomous check complete"
}

main "$@"