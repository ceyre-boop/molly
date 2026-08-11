# Molly + Halo: Off-Laptop Reachability

## Context

Colin's Molly system (local `molly` CLI, console server, filesystem dispatch queue, `bin/respond.ts`) already works well and is the thing he's proudest of — it must not be disturbed. The gap: everything today requires his laptop to be open and running. He just ordered Brilliant Labs Halo AR glasses and wants to ask Molly a question through them and get an answer back *immediately*, not a PR link to merge later, even when his laptop is closed.

The design goal, stated explicitly by Colin: stay as close to **$0/month** as possible on top of his existing $100/mo Claude Max subscription. Most answers should keep costing nothing (same human/Claude-Max-in-the-loop flow as today). Only when the laptop is genuinely unreachable should a metered Anthropic API call kick in, and even then it's hard-capped at **$2/month**.

This plan builds a small always-on router (Vercel Edge Function, free tier) that Halo's phone/Pi bridge talks to instead of `localhost`. It uses a heartbeat to detect whether laptop-Molly is alive, routes questions to the existing free local queue when it is, and falls back to a tightly budget-capped direct Anthropic call when it isn't. GitHub (already the source of truth for dispatch issues) becomes the persistence layer reachable from outside the home network.

**Scope for this pass:** the `general` (Q&A) Halo protocol only. OCR/face/maps stay stubbed — they need camera hardware Colin doesn't have yet to test against, and are a natural follow-up once the glasses arrive.

## Architecture

```
Halo Glasses (Lua, BLE) → Python bridge (phone/Pi) → ONE stable HTTPS URL (never localhost)
                                                              ↓
                                          Vercel Edge Function (apps/halo-edge/)
                                          ├─ heartbeat fresh?  (Vercel Edge Config, ms-latency read)
                                          ├─ dispatch command? → file GitHub issue directly (unchanged behavior)
                                          └─ question:
                                               fresh  → append to state/halo-queue.json (GitHub, free)
                                               stale  → under $2/mo cap? → call Anthropic Haiku directly
                                                         over cap?       → append to queue, wait for laptop
                                                              ↓
                                          bin/halo-daemon.ts (new local daemon, opt-in via molly --halo-start)
                                          ├─ POST /api/heartbeat every 60s while running
                                          └─ polls state/halo-queue.json, mirrors new items into the
                                             EXISTING ~/.molly-dispatch-queue (repo: "halo-question")
                                                              ↓
                                          bin/respond.ts (extended) — same human/Claude-Max answer flow as
                                          today, plus writes the answer back to state/halo-queue.json
                                                              ↓
                                          Halo bridge polls GET /api/halo?id=... until answered
```

## State Layer

| Data | Store | Why |
|---|---|---|
| Heartbeat `{ts, host}` | **Vercel Edge Config** | Read on every request, needs ms latency — GitHub API is wrong for this hot path. |
| Budget ledger `state/halo-budget.json` | **File in `ceyre-boop/molly` (private repo)**, via GitHub Contents API | Written only on the rare fallback path; human-auditable; reuses the "GitHub as free persistent store" pattern already used for dispatch issues. |
| Halo question queue `state/halo-queue.json` | Same GitHub-file mechanism | Makes the existing queue concept reachable from outside the laptop's filesystem. |

No secrets are ever committed — only derived numbers/queue text land in the repo, per CLAUDE.md non-negotiable #2. The only credentials involved (`GITHUB_PAT`, `ANTHROPIC_API_KEY`, `VERCEL_API_TOKEN`, `HALO_SHARED_SECRET`) live exclusively in Vercel's dashboard env vars; the one secret that touches Colin's laptop is `HALO_SHARED_SECRET`, kept in the local `.env` (already gitignored).

## New Files

**Vercel app — `apps/halo-edge/`** (self-contained per CLAUDE.md's `apps/<name>/` convention, bun/TS, zero deps):
- `package.json`, `vercel.json`
- `api/halo.ts` — main router, `POST`/`GET /api/halo`
- `api/heartbeat.ts` — `POST`, called only by `bin/halo-daemon.ts`
- `api/health.ts` — `GET`, status for `molly --halo-status`
- `lib/types.ts` — `HaloQueueTask` (extends `DispatchTask` from `apps/console/lib/dispatch-queue.ts` with `status`, `deviceId`, `answer?`), `BudgetState`, `HeartbeatState`
- `lib/github-store.ts` — read/write JSON files in the repo via GitHub Contents API (`fetch`, sha-based optimistic concurrency, retry-on-409 ×3)
- `lib/heartbeat.ts` — read/write against Edge Config
- `lib/budget.ts` — `getBudgetState()`, `tryReserve()`, `recordSpend()`, monthly reset by month key
- `lib/anthropic-fallback.ts` — direct `fetch` to `api.anthropic.com`, Claude Haiku, `max_tokens` ~400
- `lib/auth.ts` — shared-secret header check on every route

**Repo-root state** (seeded empty): `state/halo-budget.json` `{month, spentCents: 0, capCents: 200, calls: []}`, `state/halo-queue.json` `[]`

**Local CLI:**
- `bin/halo-daemon.ts` — heartbeat sender + queue poller, mirrors into `~/.molly-dispatch-queue` using the existing `enqueueTask()` from `apps/console/lib/dispatch-queue.ts`, Pulse-notifies on arrival (same pattern as `bin/monitor-dispatch.ts`)
- `bin/halo-budget.ts` — pretty-prints `state/halo-budget.json` via the already-authenticated local `gh` CLI
- `bin/halo-status.ts` — hits `GET /api/health`, shows heartbeat freshness + budget + pending count
- `.env.example` — documents `HALO_SHARED_SECRET=`

## Existing File Changes

- **`bin/molly`** — add `--halo-start` / `--halo-stop` (separate from `--start`/`--stop` so heartbeats only run when Halo is actually in use), `--budget`, `--halo-status`; `--status` gains one line for Halo daemon state.
- **`bin/respond.ts`** — after archiving a `repo: "halo-question"` task, also flip that entry to `answered` in `state/halo-queue.json` via `gh api` (no new local credential needed — reuses the already-authenticated `gh` CLI).
- **`apps/console/server.ts`** — no changes. Vercel is the only path to Halo, even on the same LAN, to keep one code path.
- **`halo/README.md`, `halo/HALO_ARCHITECTURE.md`** — update to point at the Vercel URL instead of `localhost:31340`; document heartbeat/budget/queue routing. `halo/protocols.ts` types are imported directly (reused, not duplicated); `halo/molly-halo-handler.ts` is left as-is (a documented future same-LAN option, not wired in this pass).

## `/api/halo` Contract

Every route requires `Authorization: Bearer <HALO_SHARED_SECRET>`; always responds `200` with a `routing` field rather than HTTP error codes, so the glasses never have to parse an error page.

```
POST /api/halo
Body: { protocol: "general", payload: { query }, deviceId? }
Resp: { ...HaloResponse, routing: "api-answered"|"local-queued"|"budget-exhausted-queued", id?, pollUrl? }

GET /api/halo?id=<id>
Resp: { id, status: "pending"|"answered", answer?, queuedAt, answeredAt? }

POST /api/heartbeat  →  { ok: true, ts }
GET  /api/health     →  { ok: true, heartbeat: {fresh, ageMs}, budget: {spentCents, capCents, remainingCents, month} }
```

Inside `POST /api/halo`: reuse `classify()`/`extractIssueTitle()` from `apps/console/lib/routing.ts` on the query text. Dispatch-style text ("dispatch/build/file...") files a GitHub issue directly via REST (same template as `server.ts`'s `fileIssue()`, re-implemented with `fetch` since Edge Runtime has no `gh`/child-process access) — heartbeat-independent, exactly like today. Otherwise: heartbeat fresh → queue in GitHub; stale + under $2/mo cap → call Anthropic Haiku, record spend, answer inline; stale + over cap → queue and wait.

## Budget & Heartbeat Mechanics

- **Cap:** $2.00/month (`capCents: 200`), via `HALO_MONTHLY_BUDGET_CENTS` env var. Model = Haiku, `max_tokens` ~400 (fits the 256×256 display anyway). Cost computed from the response's usage block against a pricing table verified at implementation time (via the `claude-api` skill, not memory).
- **Recommended:** create a separate, spend-limited Anthropic API key in the Anthropic Console just for this feature, as a belt-and-suspenders layer on top of the app-level cap.
- **Heartbeat:** `bin/halo-daemon.ts` sends every 60s; staleness threshold 150s (`HALO_STALE_THRESHOLD_MS`). Payload `{ts, host}` written to Edge Config by the Vercel function (the daemon never talks to Edge Config directly — only `HALO_SHARED_SECRET` needs to exist locally).

## Manual Setup (Colin does these two things; I'll hand over exact copy-paste steps)

1. Create a Vercel project pointed at `apps/halo-edge` (via the Vercel GitHub App / dashboard, auto-deploy on push — no new local CLI tool), add env vars: `GITHUB_PAT`, `ANTHROPIC_API_KEY`, `HALO_SHARED_SECRET`, `HALO_MONTHLY_BUDGET_CENTS=200`, `HALO_STALE_THRESHOLD_MS=150000`, Edge Config connection string.
2. Create a fine-grained GitHub PAT scoped only to `ceyre-boop/molly` (contents + issues write).

## Verification (no physical Halo hardware needed)

**Phase 1, mock mode (`HALO_MOCK=1`):**
```bash
cd apps/halo-edge && bun run --hot api/halo.ts
curl -s -H "Authorization: Bearer test-secret" -H "Content-Type: application/json" \
  -X POST http://localhost:3000/api/halo \
  -d '{"protocol":"general","payload":{"query":"what time is it"}}'
```

**Against real deploy — heartbeat fresh:**
```bash
curl -H "Authorization: Bearer $HALO_SHARED_SECRET" -X POST https://<deploy>/api/heartbeat
curl -H "Authorization: Bearer $HALO_SHARED_SECRET" https://<deploy>/api/health   # fresh: true
curl ... -X POST https://<deploy>/api/halo -d '{"protocol":"general","payload":{"query":"test"}}'
# expect routing: "local-queued"; confirm entry in state/halo-queue.json (gh api) and,
# with bin/halo-daemon.ts running, in ~/.molly-dispatch-queue as repo: "halo-question"
```

**Heartbeat stale:** stop `bin/halo-daemon.ts`, wait >150s, repeat → expect `routing: "api-answered"` with a real Anthropic answer, `state/halo-budget.json` `spentCents` incremented.

**Budget exhaustion:** temporarily set `HALO_MONTHLY_BUDGET_CENTS=0`, redeploy, repeat stale-heartbeat case → expect `routing: "budget-exhausted-queued"`.

**Round trip:** question queued while daemon running → `bun bin/respond.ts <id> "test answer"` → Pulse fires locally AND `state/halo-queue.json` entry flips to `answered` → `GET /api/halo?id=<id>` returns the answer.

**Auth guard:** missing/wrong `Authorization` header → clean rejection, no 500/stack trace.

**Regression:** existing local flow (console text submit → `gh issue create` → `~/.molly-dispatch-queue`) runs unchanged. Full-repo `bun install`, `bun test`, `bunx tsc --noEmit` per CLAUDE.md's PR checklist.

### Critical files
- `apps/halo-edge/api/halo.ts`, `apps/halo-edge/lib/github-store.ts`, `apps/halo-edge/lib/budget.ts`
- `apps/console/lib/dispatch-queue.ts`, `apps/console/lib/routing.ts` (reused, not duplicated)
- `bin/halo-daemon.ts`, `bin/respond.ts` (extended), `bin/molly` (new flags)
- `halo/protocols.ts` (types reused)
