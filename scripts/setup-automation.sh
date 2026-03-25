#!/bin/bash
#
# Molly - Automation Setup
# Configures cron jobs for autonomous monitoring
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           MOLLY AUTOMATION SETUP                             ║"
echo "║           Configure Autonomous Monitoring                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if cron is available
if ! command -v crontab &> /dev/null; then
    echo "⚠️  crontab not found. Installing cron..."
    
    # Detect OS and install
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "   macOS detected - using launchd instead of cron"
        USE_LAUNCHD=true
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y cron
        elif command -v yum &> /dev/null; then
            sudo yum install -y cronie
        fi
    fi
fi

echo ""
echo "📋 Automation Options:"
echo ""
echo "   [1] Basic Monitoring (check every 6 hours, notify only)"
echo "   [2] Auto-Fix Mode (check every 2 hours, fix common issues)"
echo "   [3] Full Autonomy (check every hour, fix + optimize + report)"
echo "   [4] Custom Schedule"
echo "   [5] Disable All Automation"
echo ""

read -p "Select option [1-5]: " choice

case $choice in
    1)
        SCHEDULE="0 */6 * * *"
        MODE="monitor"
        echo "✅ Basic monitoring every 6 hours"
        ;;
    2)
        SCHEDULE="0 */2 * * *"
        MODE="auto-fix"
        echo "✅ Auto-fix mode every 2 hours"
        ;;
    3)
        SCHEDULE="0 * * * *"
        MODE="full-autonomy"
        echo "✅ Full autonomy every hour"
        ;;
    4)
        echo ""
        echo "Enter cron schedule (e.g., '0 */4 * * *' for every 4 hours):"
        read SCHEDULE
        MODE="custom"
        ;;
    5)
        echo "Removing all Molly automation..."
        crontab -l 2>/dev/null | grep -v "molly" | crontab - 2>/dev/null || true
        echo "✅ All automation disabled"
        exit 0
        ;;
    *)
        echo "❌ Invalid option"
        exit 1
        ;;
esac

# Create cron entry
CRON_CMD="$SCHEDULE cd \"$ROOT_DIR/scripts\" && ./autonomous-monitor.sh >> \"$ROOT_DIR/logs/cron.log\" 2>&1"

# Add to crontab
(crontab -l 2>/dev/null | grep -v "molly") | crontab - 2>/dev/null || true
(crontab -l 2>/dev/null; echo "# Molly Autonomous Monitor - $MODE"; echo "$CRON_CMD") | crontab -

echo ""
echo "✅ Automation configured!"
echo ""
echo "📊 Details:"
echo "   Mode: $MODE"
echo "   Schedule: $SCHEDULE"
echo "   Log: $ROOT_DIR/logs/cron.log"
echo "   Report: $ROOT_DIR/logs/auto-fix-report.txt"
echo ""
echo "🧪 Test it now?"
read -p "Run autonomous check now [y/N]: " test_now

if [[ $test_now =~ ^[Yy]$ ]]; then
    echo ""
    "$ROOT_DIR/scripts/autonomous-monitor.sh"
fi

echo ""
echo "💡 To modify later, run: ./setup-automation.sh"
echo "💡 To view logs: tail -f $ROOT_DIR/logs/cron.log"
echo ""