#!/bin/bash
#
# Molly - System Health Check
# Checks: TABOOST, TABOOST-Shop, Data Sync, GitHub Pages
#

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
WHITE='\033[1;37m'
NC='\033[0m'

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_PATH="$ROOT_DIR/logs/health-checks.log"
REPORT_PATH="$ROOT_DIR/logs/latest-health-report.txt"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

ISSUES=()

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                   SYSTEM HEALTH CHECK                        ║${NC}"
echo -e "${CYAN}║                       $TIMESTAMP                    ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Initialize report
REPORT=$(cat <<EOF
Health Check Report - $TIMESTAMP
==================================================

EOF
)

# ============================================
# 1. TABOOST Data Check
# ============================================
echo -e "${WHITE}📊 TABOOST Data Files:${NC}"
REPORT+="📊 TABOOST Data Files:\n"

DATA_PATH="$ROOT_DIR/../TABOOST_Platfrom/data"
if [ -d "$DATA_PATH" ]; then
    echo -e "   ${GRAY}Checking $DATA_PATH...${NC}"
    
    # Find CSV files and check age
    find "$DATA_PATH" -name "*.csv" -type f | head -5 | while read file; do
        HOURS_OLD=$(( ($(date +%s) - $(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file")) / 3600 ))
        FILENAME=$(basename "$file")
        
        if [ $HOURS_OLD -lt 25 ]; then
            echo -e "   ${GREEN}✅${NC} $FILENAME - ${HOURS_OLD}h old"
            REPORT+="   ✅ $FILENAME - ${HOURS_OLD}h old\n"
        else
            echo -e "   ${YELLOW}⚠️${NC} $FILENAME - ${HOURS_OLD}h old"
            REPORT+="   ⚠️ $FILENAME - ${HOURS_OLD}h old\n"
            ISSUES+=("TABOOST: $FILENAME is stale (${HOURS_OLD}h old)")
        fi
    done
else
    echo -e "   ${RED}❌${NC} Data path not found"
    REPORT+="   ❌ Data path not found\n"
    ISSUES+=("TABOOST: Data check failed")
fi

echo ""
REPORT+="\n"

# ============================================
# 2. TABOOST-Shop Data Check
# ============================================
echo -e "${WHITE}🛒 TABOOST-Shop Data Files:${NC}"
REPORT+="🛒 TABOOST-Shop Data Files:\n"

DATA_PATH="$ROOT_DIR/../TABOOST-Shop-temp/data"
if [ -d "$DATA_PATH" ]; then
    echo -e "   ${GRAY}Checking $DATA_PATH...${NC}"
    
    find "$DATA_PATH" -name "*.csv" -type f | head -5 | while read file; do
        HOURS_OLD=$(( ($(date +%s) - $(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file")) / 3600 ))
        FILENAME=$(basename "$file")
        
        if [ $HOURS_OLD -lt 25 ]; then
            echo -e "   ${GREEN}✅${NC} $FILENAME - ${HOURS_OLD}h old"
            REPORT+="   ✅ $FILENAME - ${HOURS_OLD}h old\n"
        else
            echo -e "   ${YELLOW}⚠️${NC} $FILENAME - ${HOURS_OLD}h old"
            REPORT+="   ⚠️ $FILENAME - ${HOURS_OLD}h old\n"
            ISSUES+=("SHOP: $FILENAME is stale (${HOURS_OLD}h old)")
        fi
    done
else
    echo -e "   ${RED}❌${NC} Data path not found"
    REPORT+="   ❌ Data path not found\n"
    ISSUES+=("SHOP: Data check failed")
fi

echo ""
REPORT+="\n"

# ============================================
# 3. GitHub Pages Health Check
# ============================================
echo -e "${WHITE}🌐 GitHub Pages Status:${NC}"
REPORT+="🌐 GitHub Pages Status:\n"

SITES=(
    "TABOOST:https://live.taboost.me"
    "Shop:https://ceyre-boop.github.io/TABOOST-Shop/"
    "Quant:https://ceyre-boop.github.io/quant/"
    "Molly:https://ceyre-boop.github.io/molly/"
)

for site in "${SITES[@]}"; do
    NAME="${site%%:*}"
    URL="${site#*:}"
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "   ${GREEN}✅${NC} $NAME: HTTP $HTTP_CODE"
        REPORT+="   ✅ $NAME: HTTP $HTTP_CODE\n"
    else
        echo -e "   ${RED}❌${NC} $NAME: HTTP $HTTP_CODE"
        REPORT+="   ❌ $NAME: HTTP $HTTP_CODE\n"
        ISSUES+=("$NAME: Site unreachable (HTTP $HTTP_CODE)")
    fi
done

echo ""
REPORT+="\n"

# ============================================
# Summary
# ============================================
echo -e "${GRAY}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
REPORT+="--------------------------------------------------\n"

if [ ${#ISSUES[@]} -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ ALL SYSTEMS OPERATIONAL${NC}"
    echo -e "${GRAY}   No issues detected${NC}"
    echo ""
    REPORT+="\n✅ ALL SYSTEMS OPERATIONAL\n   No issues detected"
    EXIT_CODE=0
else
    echo ""
    echo -e "${YELLOW}⚠️  ISSUES DETECTED (${#ISSUES[@]})${NC}"
    for issue in "${ISSUES[@]}"; do
        echo -e "   ${YELLOW}•${NC} $issue"
    done
    echo ""
    REPORT+="\n⚠️  ISSUES DETECTED (${#ISSUES[@]})\n"
    for issue in "${ISSUES[@]}"; do
        REPORT+="   • $issue\n"
    done
    EXIT_CODE=1
fi

# Save report
mkdir -p "$(dirname "$REPORT_PATH")"
echo -e "$REPORT" > "$REPORT_PATH"

# Log check
mkdir -p "$(dirname "$LOG_PATH")"
if [ $EXIT_CODE -eq 0 ]; then
    echo "$TIMESTAMP | Health Check | OK" >> "$LOG_PATH"
else
    echo "$TIMESTAMP | Health Check | ISSUES: ${#ISSUES[@]}" >> "$LOG_PATH"
fi

echo -e "${GRAY}📄 Report saved to: $REPORT_PATH${NC}"
echo ""

exit $EXIT_CODE