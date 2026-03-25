#!/bin/bash
#
# Molly - Deploy TABOOST-Shop
# Usage: ./deploy-shop.sh ["commit message"]
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
GRAY='\033[0;37m'
NC='\033[0m'

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
REPO_PATH="$(cd "$ROOT_DIR/../TABOOST-Shop-temp" && pwd)"
LOG_PATH="$ROOT_DIR/logs/deployments.log"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo ""
echo -e "${MAGENTA}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║           TABOOST SHOP — DEPLOYMENT PIPELINE                 ║${NC}"
echo -e "${MAGENTA}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${WHITE}📁 Repository: TABOOST-Shop-temp${NC}"
echo -e "${GRAY}🛒 Target: https://ceyre-boop.github.io/TABOOST-Shop/${NC}"
echo ""

if [ ! -d "$REPO_PATH" ]; then
    echo -e "${RED}❌ ERROR: Could not find repository at $REPO_PATH${NC}"
    exit 1
fi

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

MESSAGE="${1:-Auto-deploy: Update shop data ($(date '+%Y-%m-%d'))}"
echo -e "${WHITE}📝 Commit message: $MESSAGE${NC}"
echo ""

echo -e "${GRAY}━ Staging changes...${NC}"
git add -A

echo -e "${GRAY}━ Committing...${NC}"
git commit -m "$MESSAGE" --quiet

echo -e "${GRAY}━ Pulling latest...${NC}"
git pull origin main --quiet

echo -e "${GRAY}━ Pushing to GitHub...${NC}"
git push origin main --quiet

mkdir -p "$(dirname "$LOG_PATH")"
echo "$TIMESTAMP | SHOP | SUCCESS | $MESSAGE" >> "$LOG_PATH"

echo ""
echo -e "${GREEN}✅ DEPLOYMENT SUCCESSFUL${NC}"
echo ""
echo -e "${GRAY}   Live in ~2 minutes at: https://ceyre-boop.github.io/TABOOST-Shop/${NC}"
echo ""

exit 0