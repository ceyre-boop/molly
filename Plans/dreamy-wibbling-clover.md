# The Molly Spine — Pivot from Glasses Prototype to the Layer Noa Can't Be

## Context

The halo-prototype (Phases 1–3.5: EDITH panels, vision Q&A, voice loop, hand gestures) turned out to duplicate what **Noa** — Brilliant Labs' native assistant — already ships in the box: scene description, conversational voice Q&A, maps, basic anonymous face memory, even on-device app generation (Vibe Mode). Not wasted work (the isolated `audio.ts`/`gestures.ts` module seams and the vision-call plumbing are validated patterns), but as a *product* it's redundant.

Molly's structural moat is everything Noa **cannot** access, by sandbox design, not by intelligence:

1. **The real identity graph** — actual names, roles, history ("Marco from TABOOST"), not anonymous embedding counts
2. **OAuth into Colin's actual life** — Gmail, Calendar, HealthKit, Sovereign alerts, dashboards — Noa is sandboxed to what the glasses see/hear
3. **Authority-tier governance** — free-action vs confirm-first over real accounts
4. **Continuity as one entity** across desktop, Telegram, homelab, and (later) glasses

Decision made: **shelve the prototype, start the Molly spine now** — the glasses-independent backbone that's useful on desktop today and makes the glasses just another client later. When the Halo arrives: live with stock Noa for a few days, let empirical gaps define what the glasses client needs, and test whether Vibe Mode can generate the bridge scaffolding itself.

## Constraints

- **Repo rules**: bun + TypeScript, no secrets in repo (env/keychain only), this repo never touches other repos' code, voice output via Pulse (localhost:31337) when local.
- **API spend**: currently ordered to $0. The spine is *designed* under that constraint — everything except the actual Claude reasoning call works with zero spend (memory, identity store, OAuth data pulls, CLI). A small dev cap (~$2/mo) gets raised by Colin when he's ready to test the reasoning loop; the plan does not assume spend.
- Halo-prototype stays deployed but frozen — no further feature work on that branch.

---

## Part 1 — Shelve the prototype (30 min)

On `halo-web-prototype` branch:
- `apps/halo-prototype/README.md`: add a status header — *"LEARNING EXERCISE — superseded. Noa ships these features natively. Kept for the validated patterns: audio.ts (STT/TTS seam), gestures.ts (local hand tracking), lib/anthropic.ts (vision call). See Plans/ + SPINE.md for what Molly actually is."*
- New `apps/halo-prototype/NOA_GAP_PROTOCOL.md`: the observation checklist for when the glasses arrive (use stock Noa for several days; log where it fails on: identity, cross-account tasks, continuity, authority; test Vibe Mode generating bridge scaffolding).
- Final commit. Branch stays; Render service stays (calls fail harmlessly at $0 limit).

## Part 2 — The spine: `apps/spine/`

New self-contained app following the halo-prototype/console pattern (Bun.serve, no framework).

```
apps/spine/
├── server.ts               # Bun.serve: /api/chat, /api/people, /api/connectors, console UI
├── lib/
│   ├── agent.ts            # Claude tool-loop (claude-haiku-4-5 default), the ONLY paid path
│   ├── memory.ts           # bun:sqlite — conversations, messages, facts
│   ├── people.ts           # identity graph — people, roles, relationships, notes, (later) face links
│   ├── tools.ts            # tool registry the agent can call (calendar_read, gmail_search, people_lookup, remember)
│   └── google.ts           # OAuth2 (read-only Gmail + Calendar scopes), token refresh
├── db/                     # SQLite file (gitignored)
├── public/                 # minimal chat console (talk to Molly in browser, reuse audio.ts pattern for voice later)
├── *.test.ts               # memory + people + tool-registry tests (no network)
└── SPINE.md                # architecture + the moat rationale above
```

### Phase A — skeleton (build first, works at $0 spend)
- `memory.ts`: SQLite schema — `conversations(id, started_at, surface)`, `messages(id, conv_id, role, content, ts)`, `facts(id, subject, fact, source, ts)`.
- `people.ts`: `people(id, name, role, org, notes, first_seen, last_seen)`, `person_events(person_id, event, ts)`. CRUD + search. This is the real-names graph Noa can't have — and the future landing place for Phase-7 face links.
- `tools.ts`: typed tool registry with JSON-schema defs; `people_lookup`, `remember` (writes facts), stubs for google tools.
- `server.ts`: routes + bearer auth (`SPINE_SHARED_SECRET`, same pattern as halo-prototype `checkAuth`).
- Tests for memory/people/tools — pure, no network, `bun test` green.

### Phase B — agent loop (needs API budget raised)
- `agent.ts`: messages loop with tool-use handling — send history + tool defs, execute requested tools locally, feed results back, return final text. Persist every turn via `memory.ts`. Model: `claude-haiku-4-5`, `max_tokens` small; every call logged with token counts to make spend visible.
- Console at `/`: text chat first (voice is a later add via the proven `audio.ts` seam).

### Phase C — Google OAuth (read-only)
- `google.ts`: standard OAuth2 code flow, scopes `gmail.readonly` + `calendar.readonly`; tokens stored in `db/` (gitignored) or keychain, never in repo. Colin performs the browser consent step himself.
- Wire `gmail_search`, `calendar_read` into the tool registry.
- Note: Google Cloud project + OAuth client creation is a Colin-in-browser step; the plan provides exact click-path instructions in SPINE.md.

## What is explicitly NOT in this build
- No Swift/iOS until glasses land and the Noa gaps are observed (Phase 4 of the old roadmap, on hold).
- No new glasses-facing features.
- No always-on background agent/automations yet — request-response first, automations layer later.
- No writes to Gmail/Calendar — read-only scopes only (authority-tier work comes after the read path is trusted).

## Verification

```bash
cd apps/spine && bun install
bun test                      # memory, people, tools — all green, zero network
bunx tsc --noEmit
SPINE_SHARED_SECRET=dev bun run server.ts
# curl /api/people CRUD round-trip
# curl /api/chat with API limit at $0 → clean "reasoning disabled (budget $0)" response, NOT a crash
# after Colin raises budget: /api/chat "who is Marco?" → agent calls people_lookup → grounded answer
```

`git diff main origin/main` stays empty; spine work goes on a new branch `molly-spine` off main, PR per repo rules.

## Critical files
`apps/spine/{server.ts, lib/agent.ts, lib/memory.ts, lib/people.ts, lib/tools.ts, lib/google.ts, SPINE.md}`, `apps/halo-prototype/{README.md, NOA_GAP_PROTOCOL.md}`
