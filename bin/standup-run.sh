#!/bin/zsh
# Morning standup orchestrator: dispatch at 7:00, report 25 minutes later.
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
LOG="$HOME/molly/logs/standup-$(date +%Y%m%d).log"
mkdir -p "$HOME/molly/logs"
{
  echo "=== standup $(date) ==="
  bun "$HOME/molly/bin/standup-dispatch.ts"
  echo "--- waiting 25m for agent runs ---"
  sleep 1500
  bun "$HOME/molly/bin/standup-report.ts"
} >> "$LOG" 2>&1
