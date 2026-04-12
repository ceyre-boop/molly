#!/bin/bash
#
# Molly Memory Reader
# Loads context from Obsidian vault at session start
# Usage: source ./scripts/molly-memory.sh [domain]
#

VAULT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../vault" && pwd)"

colors() {
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    BLUE='\033[0;34m'
    YELLOW='\033[1;33m'
    NC='\033[0m'
}

load_state() {
    local domain=$1
    local state_file="$VAULT_DIR/$domain/_state.md"
    
    if [ -f "$state_file" ]; then
        echo "---"
        echo "# Loading $domain state..."
        echo ""
        # Extract content after frontmatter
        sed '1,/^---$/d' "$state_file" | head -50
        echo ""
    fi
}

load_context() {
    local domain=$1
    local context_file="$VAULT_DIR/$domain/_context.md"
    
    if [ -f "$context_file" ]; then
        echo "---"
        echo "# Loading $domain context..."
        echo ""
        sed '1,/^---$/d' "$context_file" | head -100
        echo ""
    fi
}

load_recent_logs() {
    local domain=$1
    local log_dir="$VAULT_DIR/$domain/log"
    
    if [ -d "$log_dir" ]; then
        echo "---"
        echo "# Recent activity ($domain)..."
        echo ""
        # Get last 3 log files
        ls -t "$log_dir"/*.md 2>/dev/null | head -3 | while read log; do
            echo "## $(basename $log .md)"
            head -30 "$log"
            echo ""
        done
    fi
}

# Main execution
DOMAIN="${1:-all}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              MOLLY MEMORY LOADER v2.0                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

if [ "$DOMAIN" = "all" ]; then
    DOMAINS=("01-trading" "02-agency" "03-dev" "04-school")
else
    DOMAINS=($DOMAIN)
fi

for d in "${DOMAINS[@]}"; do
    load_state "$d"
    load_context "$d"
    load_recent_logs "$d"
done

echo "✅ Memory loaded. Ready for session."
echo ""

# Export for use in session
export MOLLY_VAULT_DIR="$VAULT_DIR"
export MOLLY_DOMAIN="$DOMAIN"