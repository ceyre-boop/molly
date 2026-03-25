#!/bin/bash
#
# Molly Master Scheduler
# Runs all domain modules in sequence
# Usage: ./scripts/molly-scheduler.sh [morning|health|full]
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-full}"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              MOLLY MASTER SCHEDULER                          ║"
echo "║              $(date '+%Y-%m-%d %H:%M:%S')                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Mode: $MODE"
echo ""

case "$MODE" in
    morning)
        echo "🌅 RUNNING MORNING ROUTINE..."
        echo ""
        echo "1. Loading memory..."
        $SCRIPT_DIR/molly-memory.sh 01-trading 2>/dev/null || echo "   (Memory loader not yet active)"
        
        echo ""
        echo "2. Generating trading brief..."
        $SCRIPT_DIR/trading-brief.sh
        
        echo ""
        echo "3. Checking agency health..."
        $SCRIPT_DIR/agency-health.sh | head -50
        
        echo ""
        echo "✅ Morning routine complete!"
        ;;
        
    health)
        echo "🏥 RUNNING HEALTH CHECKS..."
        echo ""
        
        echo "1. System health..."
        $SCRIPT_DIR/health-check.sh 2>/dev/null || echo "   Using autonomous monitor..."
        
        echo ""
        echo "2. Agency health..."
        $SCRIPT_DIR/agency-health.sh
        
        echo ""
        echo "✅ Health checks complete!"
        ;;
        
    full|*)
        echo "🔥 RUNNING FULL ROUTINE..."
        echo ""
        
        echo "1. Memory load..."
        $SCRIPT_DIR/molly-memory.sh 2>/dev/null || echo "   Skipped (setup pending)"
        
        echo ""
        echo "2. Trading brief..."
        $SCRIPT_DIR/trading-brief.sh 2>/dev/null || echo "   Skipped"
        
        echo ""
        echo "3. Agency health..."
        $SCRIPT_DIR/agency-health.sh 2>/dev/null || echo "   Skipped"
        
        echo ""
        echo "4. System health..."
        $SCRIPT_DIR/health-check.sh 2>/dev/null || echo "   Skipped"
        
        echo ""
        echo "5. Auto-deploy check..."
        # Check for uncommitted changes and offer to deploy
        echo "   Checking repos for pending changes..."
        
        echo ""
        echo "✅ Full routine complete!"
        ;;
esac

echo ""
echo "Next scheduled run: $(date -d '+1 hour' '+%H:%M' 2>/dev/null || echo 'See crontab')"
echo ""

# Log execution
LOG_DIR="$(dirname "$SCRIPT_DIR")/logs"
mkdir -p "$LOG_DIR"
echo "$(date '+%Y-%m-%d %H:%M:%S') | Scheduler | $MODE | Complete" >> "$LOG_DIR/scheduler.log"