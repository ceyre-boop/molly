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

### Persistence (the honest numbers)

Render free tier has an **ephemeral disk** — the SQLite file resets on every
redeploy. Corrected pricing (an earlier note here said "$1/mo" — wrong):
persistent disks **require a paid instance**, so the real cost is:

- Starter instance: **$7/mo** (also kills the cold-start spin-down)
- Disk: **$0.25/GB/mo** (1 GB is plenty) → **≈ $7.25/mo total**

Enable path (dashboard, one time): `molly` service → **Disks** → Add Disk →
mount path `/data` → then add env var `SPINE_DB_DIR=/data`. The code already
honors `SPINE_DB_DIR` — no code change needed.

Until then: anything added to the graph/memory survives restarts but **dies on
redeploy**. Don't trust it with real data yet.

### Verification

`verify.ts` proves the whole loop against a live deployment:

```bash
bun run verify.ts --url https://molly-gz19.onrender.com
```

If reasoning is offline it exits safely with zero spend. If live, it seeds a
probe person, asks the agent to look them up (people_lookup), store a fact
(remember), and recall it (recall) — then prints pass/fail and actual token
spend (~a few cents).

## Phases

- **A (this build)** — memory, identity graph, tool registry, dashboard, tests
- **B** — agent loop live (raise API budget; code already shipped in `lib/agent.ts`)
- **C** — Google OAuth read-only (gmail_search, calendar_read)
- **Later** — authority tiers, Telegram surface, glasses client (after the
  NOA_GAP_PROTOCOL observation period)
