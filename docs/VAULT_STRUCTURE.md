# 🧠 Molly Memory System - Obsidian Vault

## Structure

```
vault/
├── .obsidian/
│   └── app.json (Molly integration config)
├── 00-meta/
│   ├── molly-status.md (Current system state)
│   ├── daily-logs-index.md
│   └── usage-metrics.md
├── 01-trading/
│   ├── _state.md (Current positions, open setups)
│   ├── _context.md (Persistent: strategies, risk rules)
│   ├── _goals.md (Monthly/quarterly targets)
│   └── log/
│       └── 2026-03-25.md (Daily trading log)
├── 02-agency/
│   ├── _state.md (Current projects, active creators)
│   ├── _context.md (TABOOST systems, workflows)
│   ├── _metrics.md (826 creators, key numbers)
│   └── log/
│       └── 2026-03-25.md
├── 03-dev/
│   ├── _state.md (Active repos, branches, PRs)
│   ├── _context.md (Tech stack, deployment flows)
│   ├── _security.md (Tokens, keys rotation log)
│   └── log/
│       └── 2026-03-25.md
├── 04-school/
│   ├── _state.md (Current courses, deadlines)
│   ├── _context.md (Premed timeline, MCAT plan)
│   ├── _shadowing.md (Hours log, contacts)
│   └── log/
│       └── 2026-03-25.md
└── 99-archive/
    └── (Old logs auto-moved after 90 days)
```

## File Format Standards

### _state.md Template
```markdown
---
domain: trading
last-updated: 2026-03-25T11:45:00Z
molly-version: 2.0
---

# Current State

## Open Positions
- NAS100: LONG @ 20450 (Layer 3 confirmed, stop 20380)
- Risk: 0.5R exposed

## Active Setups
- [ ] NAS100 sweep of 20400 liquidity (monitoring)
- [ ] SPY VIX expansion play (waiting for trigger)

## Today's Brief
Generated: 2026-03-25 09:25 EST
- Macro: FOMC minutes today, expect volatility 14:00-15:00
- Bias: Cautiously bullish above 20400
- Game theory: MM likely to sweep lows before any real move

## Action Items
- [ ] Move stop to breakeven if 20500 hit
- [ ] Scale 50% at 20550 (2R)
```

### _context.md Template
```markdown
---
domain: trading
type: persistent-memory
---

# Trading Context (Always Loaded)

## Strategy Rules
1. 3-layer confirmation required for entry
2. Never risk >1% per trade
3. No trades during FOMC (14:00-15:00)
4. Journal every trade with screenshot

## Current Systems
- Layer 1: AI bias engine (transformer model on price action)
- Layer 2: Quant risk model (EV calc + position sizing)
- Layer 3: Game theory engine (liquidity sweep detection)

## Broker Setup
- Platform: TradeLocker
- Account: Demo ( Paper trading )
- API: Connected, auto-sync enabled

## Historical Performance
- March 2026: +4.2R, 58% win rate
- Max drawdown: -2.1R
- Sharpe: 1.4
```

### Daily Log Template
```markdown
---
date: 2026-03-25
domain: trading
---

# 2026-03-25 - Trading Log

## Pre-Market (09:00)
- [Brief from Molly]
- Overnight gaps: NAS +45, SPY +0.8%
- Key levels: 20400 (support), 20550 (resistance)

## Session Notes

### 09:30 - Market Open
Price action: Opening drive, sold off into 20400
Molly signal: Layer 1 bullish, Layer 2 waiting
Decision: No entry, watching for sweep

### 10:15 - Setup Trigger
NAS100 swept 20400, immediate reclaim
Layer 3: Forced move probability 78%, Kyle λ 0.04
Entry: LONG 20450
Stop: 20380 (below sweep low)
Target: 20550 (2R)

### 11:30 - Position Update
Price: 20485 (+35 points)
Layer 2: EV now 1.8R, stop moved to breakeven
Molly suggestion: Hold full, momentum building

## Post-Session Review
Trades: 1 (WIN)
P&L: +1.0R
Lessons: Sweep + reclaim pattern worked perfectly
Molly notes: [Auto-generated from firebase data]
```

## Molly Integration Protocol

### Session Start
1. Read `_state.md` from all 4 domains
2. Read `_context.md` from active domain
3. Check today's log if exists
4. Load recent 7 days of logs for pattern recognition

### During Session
- Write to today's log in real-time
- Update `_state.md` after significant actions
- Never overwrite `_context.md` without confirmation

### Session End
1. Summarize key actions → today's log
2. Update metrics in `_state.md`
3. Flag items for tomorrow's brief
4. Archive logs >90 days old

### Token Optimization
- Load only relevant domain context
- Summarize old logs before loading (compress 30 days → 1 paragraph)
- Use local Ollama for log summarization
- Keep active context window <4000 tokens

## Vector Store Integration (Phase 5)

When ready, each markdown file gets:
- H1 headers → separate embeddings
- Code blocks → syntax-aware embeddings
- Tables → structured embeddings
- Bullet lists → semantic chunking

Query: "What was my NAS100 reasoning last week?"
→ Semantic search across all trading logs
→ Return relevant paragraphs with dates
→ Generate summary using local model