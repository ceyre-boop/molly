#!/bin/bash
#
# Molly - Deploy TABOOST Platform
# Usage: ./deploy-taboost.sh ["commit message"]
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
REPO_PATH="$(cd "$ROOT_DIR/../TABOOST_Platfrom" && pwd)"
LOG_PATH="$ROOT_DIR/logs/deployments.log"

# Timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Header
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           TABOOST PLATFORM — DEPLOYMENT PIPELINE             ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${WHITE}📁 Repository: TABOOST_Platfrom${NC}"
echo -e "${GRAY}🌐 Target: https://live.taboost.me${NC}"
echo ""

# Check if repo exists
if [ ! -d "$REPO_PATH" ]; then
    echo -e "${RED}❌ ERROR: Could not find repository at $REPO_PATH${NC}"
    exit 1
fi

# Change to repo
cd "$REPO_PATH"

echo -e "${GRAY}━ Checking repository status...${NC}"
STATUS=$(git status --porcelain 2>/dev/null || echo "ERROR")

if [ "$STATUS" = "ERROR" ]; then
    echo -e "${RED}❌ Not a git repository${NC}"
    exit 1
fi

if [ -z "$STATUS" ]; then
    echo -e "${GREEN}✓ No changes to deploy${NC}"
    echo ""
    exit 0
fi

echo ""
echo -e "${YELLOW}📋 Changes detected:${NC}"
echo "$STATUS" | while read line; do
    echo -e "   ${GRAY}$line${NC}"
done
echo ""

# Get commit message
MESSAGE="${1:-Auto-deploy: Update data files ($(date '+%Y-%m-%d'))}"
echo -e "${WHITE}📝 Commit message: $MESSAGE${NC}"
echo ""

# Stage, commit, push
echo -e "${GRAY}━ Staging changes...${NC}"
git add -A

echo -e "${GRAY}━ Committing...${NC}"
git commit -m "$MESSAGE" --quiet

echo -e "${GRAY}━ Pushing to GitHub...${NC}"
git push origin main --quiet

# Log deployment
mkdir -p "$(dirname "$LOG_PATH")"
echo "$TIMESTAMP | TABOOST | SUCCESS | $MESSAGE" >> "$LOG_PATH"

echo ""
echo -e "${GREEN}✅ DEPLOYMENT SUCCESSFUL${NC}"
echo ""
echo -e "${GRAY}   Live in ~2 minutes at: https://live.taboost.me${NC}"
echo -e "${GRAY}   Log: $LOG_PATH${NC}"
echo ""

exit 0