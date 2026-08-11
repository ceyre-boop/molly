# Molly Dispatch — Voice-Driven Immediate Task Execution

The dispatch system turns voice commands on the Molly Console into immediate agent execution.

## Quick Start

### 1. Check daemon status
```bash
molly --status
```

### 2. Start/stop the dispatch monitor
```bash
molly --start          # Start the daemon
molly --stop           # Stop the daemon
molly --status         # Show status + pending queue
```

### 3. From any terminal, dispatch a task
```bash
molly "build the feature"           # Files issue + queues for execution
molly "fix the bug" "details here"  # With notes
echo "specs" | molly "title" -      # Body from stdin
```

### 4. From the Molly Console (http://localhost:31340/)
- **Hold Space** or **tap the orb** to record
- Say: _"dispatch: [your task]"_
- The system will:
  1. Transcribe your voice
  2. File a GitHub issue
  3. Queue it for immediate execution
  4. Send you a Pulse notification

## What Happens Next

When you dispatch a task:

| Step | What | Where |
|------|------|-------|
| 1 | Voice command recorded | Molly Console (localhost:31340) |
| 2 | Transcript sent to server | Console server (port 31340) |
| 3 | GitHub issue filed | GitHub (ceyre-boop/outreach-builder) |
| 4 | Task queued for execution | ~/.molly-dispatch-queue/ (JSON files) |
| 5 | Dispatch monitor detects it | monitor-dispatch.ts (running daemon) |
| 6 | Pulse notification sent | Pulse (localhost:31337) → voice alert |
| 7 | You hear about it | Immediate audio notification |

## Command Reference

| Command | Effect |
|---------|--------|
| `molly --status` | Show daemon status and pending queue |
| `molly --start` | Start the dispatch monitor daemon |
| `molly --stop` | Stop the dispatch monitor daemon |
| `molly --help` | Show usage |
| `molly "title"` | Dispatch a task (console or CLI) |
| `molly "title" "notes"` | Dispatch with details |
| `molly -n "title"` | Queue for 7 AM standup instead |
| `molly -r molly "title"` | Target the molly repo instead of outreach-builder |

## Queue Management

### View pending tasks
```bash
bun bin/check-dispatch.ts
```

### Mark a task as complete
```bash
bun check-dispatch.ts --execute <task-id>
```

### Clear old tasks
```bash
rm -rf ~/.molly-dispatch-queue/*
```

## Auto-Start

The dispatch monitor is installed as a macOS LaunchAgent and auto-starts on login:

```
~/Library/LaunchAgents/com.molly.dispatch-monitor.plist
```

To manually load/unload:
```bash
launchctl load ~/Library/LaunchAgents/com.molly.dispatch-monitor.plist
launchctl unload ~/Library/LaunchAgents/com.molly.dispatch-monitor.plist
```

## Architecture

- **Console**: `apps/console/server.ts` → enqueues dispatch tasks
- **Queue**: `~/.molly-dispatch-queue/` → JSON file store
- **Monitor**: `bin/monitor-dispatch.ts` → watches queue, sends Pulse notifications
- **CLI**: `bin/molly` → task dispatcher + daemon control
- **Launcher**: `~/Library/LaunchAgents/com.molly.dispatch-monitor.plist` → auto-start agent

## Troubleshooting

### Monitor not running
```bash
molly --start
```

### Tasks not showing in queue
```bash
# Check console server is running
lsof -i :31340

# Check Pulse server is running
lsof -i :31337

# Monitor logs
tail -20 ~/molly/logs/monitor-dispatch.log
```

### Broken launchd agent
```bash
# Reload it
launchctl unload ~/Library/LaunchAgents/com.molly.dispatch-monitor.plist
launchctl load ~/Library/LaunchAgents/com.molly.dispatch-monitor.plist

# Check status
launchctl list | grep molly
```
