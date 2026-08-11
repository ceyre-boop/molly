# Molly Workflow — Conversational Task Management

Two-tier system: **questions** (answered by you via Claude Max) and **dispatch tasks** (automated execution).

## The Flow

### 1. You speak into Molly Console (http://localhost:31340/)

Hold **Space** and speak:
- _"What is the current price of Nvidia?"_ → Question (waits for your response)
- _"dispatch: build the dashboard"_ → Task (filed + queued for execution)

### 2. Questions Go to You (Your Claude Max Subscription)

```
🎤 "What is the current price of Nvidia?"
    ↓
📋 Queued in ~/.molly-dispatch-queue/
    ↓
✅ You respond via: bun bin/respond.ts
    ↓
💬 Answer sent via Pulse (voice)
```

### 3. Dispatch Tasks Run Immediately

```
🎤 "dispatch: build dashboard"
    ↓
📂 GitHub issue filed
    ↓
📋 Task queued
    ↓
🔔 Pulse notification sent
    ↓
✅ You execute via this Claude session
```

## Commands

### Check Questions Waiting for You
```bash
bun bin/respond.ts
```

### Respond to a Question
```bash
bun bin/respond.ts <task-id> "your response"

# Example:
bun bin/respond.ts 1786428966509-abc123 "Nvidia is trading at $140 per share"
```

### Monitor All Queued Tasks (dispatch + questions)
```bash
bun check-dispatch.ts
```

### Check Molly Status
```bash
molly --status
```

## Why This Way

- **No API costs** — your Claude Max subscription handles all responses
- **You stay in control** — you see and respond to every question
- **Dispatch separate** — tasks file as GitHub issues while you answer questions
- **Everything queued** — nothing is lost, everything is traceable

## Example Session

**In browser (localhost:31340/):**
```
You: "dispatch: build the stock dashboard"
Molly: "Queued for execution." ← Pulse notification

You: "what stocks are trending right now?"
Molly: "I'm thinking..." ← Queued for your response
```

**In terminal:**
```bash
$ bun bin/respond.ts
💬 Pending Questions — 1 to respond to:

  [2:16 AM] what stocks are trending right now?
         ID: 1786428980832-abc

To respond: bun bin/respond.ts <id> "your answer"

$ bun bin/respond.ts 1786428980832-abc "Tech stocks are trending—especially Nvidia, AMD, and semiconductor indices are all up 15% this quarter"

✓ Response sent via Pulse
✓ Task marked complete
```

**Molly hears:** _"Tech stocks are trending—especially Nvidia, AMD, and semiconductor indices are all up 15% this quarter"_

## Dispatch Tasks

For comparison, dispatch tasks are **automatic**:

```bash
$ molly "dispatch: add dark mode to the dashboard"
→ GitHub issue filed immediately
→ Task queued for Claude to execute
→ Pulse notifies you
→ You run it from this Claude session when ready
```

## Queue Management

### View all queued items
```bash
bun check-dispatch.ts
```

### Mark a dispatch task complete
```bash
bun check-dispatch.ts --execute <task-id>
```

### Clear old questions
```bash
rm -rf ~/.molly-dispatch-queue/*
```

## Under the Hood

| Layer | Component | Role |
|-------|-----------|------|
| **UI** | `http://localhost:31340/` | Web orb + voice input |
| **Server** | `apps/console/server.ts` | Routes to queue (dispatch or question) |
| **Queue** | `~/.molly-dispatch-queue/` | JSON task store |
| **Monitor** | `bin/monitor-dispatch.ts` | Watches dispatch tasks, sends Pulse |
| **Responder** | `bin/respond.ts` | You respond to questions |
| **Voice** | Pulse (localhost:31337) | Text-to-speech output |

## Tips

- **Quick check:** `molly --status` shows queue at a glance
- **Batch responses:** Check pending questions every 5 minutes with `bun bin/respond.ts`
- **Copy-paste:** Question IDs are shown — just copy/paste into respond command
- **Always available:** Monitor runs in background via launchd — everything persists
