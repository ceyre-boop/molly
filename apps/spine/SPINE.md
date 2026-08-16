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

- **A (done)** — memory, identity graph, tool registry, dashboard, tests
- **B (done)** — agent loop live + three-tier authority (agent/), audit trail
- **C (current lane — resequenced 2026-08-16)** — the Donna layer, in order:
  1. **Calendar read-only connector** (NOT Gmail first — calendar is small,
     structured, highest-signal for anticipation; Gmail is 50x volume, 5x
     ambiguity, deferred)
  2. **Morning brief** — cron → read calendar + spine memory → write the brief
     into the spine; no sending, no acting. Doubles as the soak's daily
     forcing function: a wrong brief surfaces memory gaps fast.
  3. **Signed confirm links** — kill the mock confirm BEFORE any second
     surface: pending action written to the spine, Colin taps a signed URL,
     action executes. A `LinkConfirmTransport` behind the same VoiceTransport
     seam — voice layers on top later.
  4. **Mine the audit log** — promotion candidates (Tier 2 actions approved
     unchanged repeatedly → real Tier 1 candidates) and a friction map. The
     only honest input to loosening governance safely.
  5. Then Telegram.
- **D (parked, spec'd)** — local perception: command-gated object tracking
- **Later** — authority tiers, Telegram surface, and the glasses lane below
  (after the NOA_GAP_PROTOCOL observation period)

### Claude Code proving ground — declared-repo policy

The `run_claude_code` soak runs against **ceyre-boop/molly** (and at most
ceyre-boop/outreach-builder). NOT quant/Sovereign: the standing dispatch-lane
rule ("never wire production repos — TABOOST_Platfrom, quant, email-automation
— into an automation lane without explicit new approval") applies to this
pathway too, and quant carries the ICT/sovereign isolation constraint. If
Colin explicitly overrides this with fresh approval, that's a session-start
declaration — never an in-flight widening.

### Glasses lane (clarified by the Halo spec sheet, 2026-08-15)

The Halo is a thin client — Alif B1 (Cortex-M55) runs wake-word-class inference
only; Noa's actual brain is Brilliant's cloud; connectivity is BLE-only through
the phone. Consequences:

1. **iOS bridge app is non-optional** (old Phase 4): the only path for the
   spine's reasoning to reach the glasses is a phone app relaying BLE
   alongside Noa. Two-way: mic/camera out to the spine, responses back to
   display/speaker.
2. **Claude Code by voice = supervision, not authoring.** No keyboard, small
   display — the protocol is "run the migration" / "what failed" / "merge it"
   with confirm-before-merge gates from the authority-tier framework. Scope as
   its own protocol; it does not fall out of the hardware for free.
3. **Noa/Molly routing needs an explicit rule** — generic question → Noa;
   needs Colin's data/accounts/code → Molly. Designed, not ad hoc.

### Phase D spec — command-gated tracking (parked until glasses/camera exist)

Engine: [supervision](https://github.com/roboflow/supervision) + a local
detection model, running as a **Python sidecar** (sanctioned exception to the
TypeScript rule — no TS equivalent exists) feeding the spine's API. Local
inference, $0 per frame.

Interaction contract (Colin's spec, 2026-08-13):
- **Start**: "track this object" / "track these objects" — a spine tool call
  (`track_start`) spawns the sidecar with the target class(es) or a
  click-selected region. Session runs continuously from that moment.
- **Run**: sidecar tracks the target(s) across frames (supervision ByteTrack),
  posting events to the spine (`/api/track/events`): entered/left frame,
  zone crossings, last-seen timestamps. Where a tracked person matches the
  identity graph, events carry the real name — the moat feature Noa can't do.
- **Stop**: "stop" / "stop tracking" — `track_stop` tool kills the sidecar.
  No always-on capture; nothing runs outside an explicit session.

Acceptance criteria:
1. Voice/chat "track the dog" starts a session within ~2s; "stop" ends it.
2. Zero API spend during tracking (local model only; agent calls only at
   start/stop and for event summaries on request).
3. Track events persist to SQLite so "what did you see while tracking?" is
   answerable after the session.
4. Person tracks join against `people.ts` records when a face/identity link
   exists (Phase 7 face-link dependency).

Blocked on: a real camera target (glasses via iOS bridge, or a desk cam) and
the NOA_GAP_PROTOCOL observation period confirming the need.
