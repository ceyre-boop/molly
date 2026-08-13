# The Molly Spine

The persistent backbone behind every surface Molly appears on — web console
today, Telegram next, Halo glasses when they land. This app is the pivot away
from rebuilding what Noa (Brilliant Labs' native assistant) already ships.

## The moat — why this exists

Noa owns the glasses' senses: scene description, voice Q&A, maps, anonymous
face memory, on-device app generation. Competing there is redundant.

The spine is everything Noa structurally **cannot** access:

1. **Identity graph** — real names, roles, history ("Marco from TABOOST"),
   not anonymous embedding counts. `lib/people.ts`.
2. **Memory** — durable facts and full conversation history, one entity across
   every surface. `lib/memory.ts`.
3. **Connectors** — OAuth into Colin's actual accounts (Gmail, Calendar,
   HealthKit, Sovereign). Phase C; `lib/google.ts` when built.
4. **Authority tiers** — free-action vs confirm-first governance. Later phase.

## Architecture

```
Any surface (web / Telegram / glasses)
        │  HTTP + optional bearer (SPINE_SHARED_SECRET)
        ▼
server.ts (Bun.serve)
  /api/chat    → lib/agent.ts  — Claude tool loop (the ONLY paid path)
  /api/people  → lib/people.ts — identity graph CRUD
  /api/facts   → lib/memory.ts — durable facts
  /api/health  → status for the spine rail UI
        ▼
bun:sqlite (db/spine.sqlite — gitignored, local)
```

**$0 mode is first-class**: without `ANTHROPIC_API_KEY` (or with the budget
capped at $0), everything works except reasoning — the dashboard, identity
graph, memory, and all tool executions are free and local. The chat returns an
honest "reasoning offline" message instead of erroring.

## Run

```bash
cd apps/spine
bun install
bun test                          # Phase A: memory/people/tools — no network
bunx tsc --noEmit
ANTHROPIC_API_KEY=sk-... bun run server.ts   # omit the key for $0 mode
```

## Deploy (Render)

Same service pattern as halo-prototype: Docker runtime, root directory
`apps/spine`, branch `molly-spine`. Env: `ANTHROPIC_API_KEY` (optional —
$0 mode without it), `SPINE_SHARED_SECRET` (optional API auth).

Note: Render free tier has an **ephemeral disk** — the SQLite file resets on
redeploy. Fine for now; a Render persistent disk ($1/mo) or move to a hosted
DB fixes it when the graph starts mattering.

## Phases

- **A (this build)** — memory, identity graph, tool registry, dashboard, tests
- **B** — agent loop live (raise API budget; code already shipped in `lib/agent.ts`)
- **C** — Google OAuth read-only (gmail_search, calendar_read)
- **Later** — authority tiers, Telegram surface, glasses client (after the
  NOA_GAP_PROTOCOL observation period)
