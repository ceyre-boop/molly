#!/bin/bash
#
# Molly Agency Module - TABOOST Health Monitor
# Usage: ./scripts/agency-health.sh
#

VAULT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../vault" && pwd)"
AGENCY_DIR="$VAULT_DIR/02-agency"
REPORT_PATH="$VAULT_DIR/00-meta/agency-health-report.md"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           TABOOST AGENCY HEALTH CHECK                        ║${NC}"
echo -e "${BLUE}║              $TIMESTAMP                    ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

ISSUES=()
WARNINGS=()
SUCCESSES=()

# ============================================
# 1. DATA SYNC HEALTH
# ============================================
echo "📊 DATA SYNC STATUS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TABOOST_DATA="$VAULT_DIR/../TABOOST_Platfrom/data"
SHOP_DATA="$VAULT_DIR/../TABOOST-Shop-temp/data"

# Check TABOOST CSVs
if [ -d "$TABOOST_DATA" ]; then
    echo "TABOOST Platform:"
    find "$TABOOST_DATA" -name "*.csv" -type f | head -5 | while read file; do
        HOURS_OLD=$(( ($(date +%s) - $(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file")) / 3600 ))
        FILENAME=$(basename "$file")
        
        if [ $HOURS_OLD -lt 25 ]; then
            echo -e "   ${GREEN}✅${NC} $FILENAME (${HOURS_OLD}h old)"
            SUCCESSES+=("TABOOST: $FILENAME up to date")
        elif [ $HOURS_OLD -lt 48 ]; then
            echo -e "   ${YELLOW}⚠️${NC} $FILENAME (${HOURS_OLD}h old) - Stale"
            WARNINGS+=("TABOOST: $FILENAME stale (${HOURS_OLD}h)")
        else
            echo -e "   ${RED}❌${NC} $FILENAME (${HOURS_OLD}h old) - CRITICAL"
            ISSUES+=("TABOOST: $FILENAME critically stale (${HOURS_OLD}h)")
        fi
    done
else
    echo -e "   ${RED}❌${NC} Data directory not found"
    ISSUES+=("TABOOST: Data directory missing")
fi

echo ""
echo "TABOOST Shop:"
if [ -d "$SHOP_DATA" ]; then
    find "$SHOP_DATA" -name "*.csv" -type f | head -3 | while read file; do
        HOURS_OLD=$(( ($(date +%s) - $(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file")) / 3600 ))
        FILENAME=$(basename "$file")
        
        if [ $HOURS_OLD -lt 25 ]; then
            echo -e "   ${GREEN}✅${NC} $FILENAME (${HOURS_OLD}h old)"
        else
            echo -e "   ${YELLOW}⚠️${NC} $FILENAME (${HOURS_OLD}h old)"
            WARNINGS+=("SHOP: $FILENAME stale (${HOURS_OLD}h)")
        fi
    done
else
    echo -e "   ${RED}❌${NC} Data directory not found"
fi
echo ""

# ============================================
# 2. SITE HEALTH
# ============================================
echo "🌐 SITE AVAILABILITY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SITES=(
    "TABOOST Platform:https://live.taboost.me"
    "TABOOST Shop:https://ceyre-boop.github.io/TABOOST-Shop/"
)

for site in "${SITES[@]}"; do
    NAME="${site%%:*}"
    URL="${site#*:}"
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "   ${GREEN}✅${NC} $NAME: HTTP $HTTP_CODE"
        SUCCESSES+=("$NAME: Online")
    else
        echo -e "   ${RED}❌${NC} $NAME: HTTP $HTTP_CODE"
        ISSUES+=("$NAME: Down (HTTP $HTTP_CODE)")
    fi
done
echo ""

# ============================================
# 3. CREATOR METRICS
# ============================================
echo "👥 CREATOR METRICS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Load from state file
if [ -f "$AGENCY_DIR/_state.md" ]; then
    TOTAL_CREATORS=$(grep "Total Creators" "$AGENCY_DIR/_state.md" | grep -o '[0-9]\+' | head -1)
    NEW_THIS_WEEK=$(grep "New This Week" "$AGENCY_DIR/_state.md" | grep -o '+[0-9]\+' | head -1)
    
    echo "   Total Creators: ${TOTAL_CREATORS:-826}"
    echo "   New This Week: ${NEW_THIS_WEEK:-+0}"
    echo ""
    
    # Check if new creators need import
    if [[ "${NEW_THIS_WEEK:-+0}" == "+"* ]] && [ "${NEW_THIS_WEEK:-+0}" != "+0" ]; then
        PENDING=${NEW_THIS_WEEK#+}
        echo -e "   ${YELLOW}⚠️  $PENDING new creators pending import${NC}"
        echo "      → Use: https://live.taboost.me/bulk-import-new.html"
        WARNINGS+=("$PENDING new creators need import")
    fi
else
    echo "   Using defaults: 826 total creators"
fi
echo ""

# ============================================
# 4. ACTION ITEMS
# ============================================
echo "📋 PRIORITY ACTIONS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ${#ISSUES[@]} -gt 0 ]; then
    echo -e "${RED}🔴 CRITICAL (${#ISSUES[@]}):${NC}"
    for issue in "${ISSUES[@]}"; do
        echo "   • $issue"
    done
    echo ""
fi

if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  WARNINGS (${#WARNINGS[@]}):${NC}"
    for warning in "${WARNINGS[@]}"; do
        echo "   • $warning"
    done
    echo ""
fi

if [ ${#ISSUES[@]} -eq 0 ] && [ ${#WARNINGS[@]} -eq 0 ]; then
    echo -e "${GREEN}✅ All systems healthy!${NC}"
    echo ""
fi

# Standard actions
echo "📝 RECOMMENDED ACTIONS:"
echo "   ☐ Check Google Apps Script executions"
echo "   ☐ Review creator performance (top 10%)"
echo "   ☐ Verify Firebase auth working"
echo "   ☐ Update product catalog if needed"
echo ""

# ============================================
# SAVE REPORT
# ============================================
cat > "$REPORT_PATH" << EOF
---
date: $(date '+%Y-%m-%d %H:%M:%S')
type: agency-health-report
---

# TABOOST Health Report - $(date '+%Y-%m-%d')

## Summary
- Issues: ${#ISSUES[@]}
- Warnings: ${#WARNINGS[@]}
- Successes: ${#SUCCESSES[@]}

## Issues
$(for i in "${ISSUES[@]}"; do echo "- $i"; done)

## Warnings
$(for w in "${WARNINGS[@]}"; do echo "- $w"; done)

## Actions Required
$(if [ ${#ISSUES[@]} -eq 0 ] && [ ${#WARNINGS[@]} -eq 0 ]; then 
    echo "None - all systems healthy"
else
    echo "1. Check Google Apps Script executions"
    echo "2. Review data sync status"
    echo "3. Verify site health"
fi)

---
Generated by Molly Agency Module
EOF

echo "📄 Report saved: $REPORT_PATH"
echo ""

# Update state file with current status
if [ -f "$AGENCY_DIR/_state.md" ]; then
    # Update last-updated timestamp
    sed -i '' "s/last-updated:.*/last-updated: $(date '+%Y-%m-%dT%H:%M:%SZ')/" "$AGENCY_DIR/_state.md" 2>/dev/null || \
    sed -i "s/last-updated:.*/last-updated: $(date '+%Y-%m-%dT%H:%M:%SZ')/" "$AGENCY_DIR/_state.md"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Health check complete."
echo ""