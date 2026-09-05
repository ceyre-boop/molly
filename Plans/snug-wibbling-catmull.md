# Molly runs on her own metal

## Before anything else — a live credential is public

`scripts/jarvis_monitor.py:16` hardcodes a **Telegram bot token as an `os.getenv` default**, so
it is a literal in the source. It is committed (`84ac32c`), it is on `origin/main`, and this repo
is public — `ceyre-boop.github.io/molly` is served from it. The token is burned.

It is a *different* bot from the OpenClaw one, but the same chat id. Rotation is yours to do
(BotFather → `/revoke`); deleting the line does not unpublish it from history. Flagging, not
acting — this is outside what I do without your nod.

Related: that whole file is dead code. All 8 `scripts/jarvis_*.py` scripts hardcode
`/workspaces/quant`, `/workspaces/molly` — Codespaces paths that do not exist on this machine —
and nothing in `launchd/`, `bin/`, or `package.json` invokes any of them. This plan deletes them.
That is the exact failure mode `SOUL.md` names in the first person: *"I hardcode things that expire."*

---

## Context

The open question was "is there any way to use OpenClaw on my Claude Max sub?" No — Anthropic
named OpenClaw specifically in April 2026 and enforces it server-side. That left a trilemma:
free / on my phone / actually good, pick two. The free OpenRouter pool got rejected as "not fast
intuitive." Sonnet 5 via OpenRouter would be ~$8/mo, but the balance is −$0.16.

The manifest points at the fourth answer: **run the model on this machine.** That collapses the
trilemma — free forever, no quota, no 402, no policy exposure, and measurably *faster* than the
free pool that got rejected.

Measured here, this session:

| Fact | Value |
|---|---|
| Hardware | Apple M4 Pro, 16 cores, 24 GB unified |
| Ollama | v0.22.0, already a LaunchAgent (`com.molly.ollama`, PID 978, up since Aug 10) |
| Throughput, qwen2.5:7b, warm | **40.5 tok/s** |
| Cold model load | **16.6 s** ← this is the entire "not intuitive" complaint |
| `OLLAMA_KEEP_ALIVE` | **not set** (defaults to 5 min) ← the one-line fix |
| Free RAM headroom | ~6 GB (25% system-wide) |
| `bun:sqlite` + Homebrew SQLite 3.53 + `loadExtension` | verified working → `sqlite-vec` is viable **in TypeScript** |

Two findings changed the shape of this plan versus the obvious one:

1. **OpenClaw supports Ollama natively** — `models.providers.<id>.api: "ollama"`. Its own docs
   (`docs/providers/ollama.md:23`) say verbatim not to use the OpenAI-compatible `/v1` URL: *it
   breaks tool calling and models emit raw tool-call JSON as plain text.* Native `/api/chat` only.
2. **OpenClaw is an MCP client** — `mcp.servers.<name>`, with `stdio` transport. That means the
   spine MCP server already built and already tested at `apps/spine/mcp/` plugs straight into
   Telegram-Molly. No new integration. That was the missing half of "she's a blank model on my
   phone," and it is a config entry, not a project.

The goal, in the words used: *"my second brain to live autonomously… doing more than what I
asked… goal oriented… knows its own downfalls and works to be better… running by the name molly
in open claw."*

## What this plan is not

The manifest lists ~60 components. Most do not belong on this machine, and saying so is the
point — I am not pip-installing a research survey.

| Dropped | Why |
|---|---|
| Letta, mem0, cognee, graphiti | Python; **default to OpenAI and silently bill**; ~90% duplicate the spine's existing `people`/`facts` store |
| HippoRAG, RAPTOR, EM-LLM | Need vLLM/GPU or attention-layer surgery. EM-LLM is KV-cache-level integration. Wrong scale for one person's notes |
| SEAL, neurogenesis, KTransformers/PowerInfer | Require GPU fine-tuning. 24 GB unified cannot train a useful model |
| pyribs, EvoTorch, QDax, openevolve | Population evolution optimizes against a fitness function. There isn't one here |
| Voyager | Reusable logic entangled with Minecraft/Mineflayer |
| 500xCompressor | CC-BY-4.0, models not public, pattern-only |

What survives is what runs on an M4 Pro and serves the goal: **a local model, tools on the phone,
a memory that grows and forgets on purpose, and a loop that critiques itself.** Four of the
manifest's ideas, none of its dependencies.

**Language:** Stages 0–3 are TypeScript and config only — no Python, no `pip`, no venv, honoring
the CLAUDE.md rule. Possible because Ollama serves embeddings over HTTP and `bun:sqlite` loads
`sqlite-vec` (both verified). Python appears only in optional Stage 4, flagged as a decision.

---

## Stage 0 — Local brain behind OpenClaw *(kills the bill and the latency)*

**Files:** `launchd/com.molly.ollama.plist`, `~/.openclaw/openclaw.json`, `bin/molly-local-model` (new)

1. Add `OLLAMA_KEEP_ALIVE = -1` to the plist's existing `EnvironmentVariables` block (which
   already sets `OLLAMA_ORIGINS` and `OLLAMA_HOST`), reinstall, then
   `launchctl kickstart -k gui/$(id -u)/com.molly.ollama`. Kills the 16.6 s cold load — the model
   stays resident. Costs ~5 GB of RAM permanently. That is the trade, and it is the right one.
2. `ollama pull qwen3:8b` (~5.2 GB) as the default — fits the current ~6 GB headroom, should hold
   ≥40 tok/s. `qwen3:14b` (~9 GB) optional as a "think harder" tier; it will page under a loaded
   desktop and that should be said plainly rather than discovered.
3. Register the provider — **native API, no `/v1`**:

```json5
models: { providers: { ollama: {
  baseUrl: "http://127.0.0.1:11434",   // NOT /v1 — breaks tool calling
  api: "ollama",
  apiKey: "ollama-local",              // sentinel; any value works on loopback
  timeoutSeconds: 240,
  models: [{ id: "qwen3:8b", name: "Qwen3 8B (local)",
             cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
             contextWindow: 32768, maxTokens: 4096 }],
}}}
agents: { defaults: { model: { primary: "ollama/qwen3:8b" } } }
```

   A `models.providers.<id>.models[]` entry is mandatory — an `agents.defaults.models` alias alone
   does not register a runtime model. `agents.defaults.timeoutSeconds: 300` is already set and is
   the hard ceiling; provider timeouts cannot extend it.
4. `bin/molly-local-model` — a bun TS script mirroring `bin/openclaw-free-model`: read
   `/api/tags`, refuse to pin a model that is not actually pulled, patch `openclaw.json` in place.
   Guards the known hazard that `openclaw onboard` silently resets the model to paid
   `openrouter/auto`. Keep the OpenRouter provider configured as a manual fallback; just stop
   defaulting to it.

**Reuse, don't rebuild:** `kanban.html:631-690` already has a working Ollama client with model
auto-detection, a preference list, `format:'json'` structured output, and vault-context
injection. Lift that pattern. `scripts/molly-router.sh` is its crude ancestor — retire it.

**Verify:** `openclaw models list`; then a real Telegram round-trip, timed, twice. Pass = reply
under 5 s both times with zero OpenRouter calls in the gateway log.

---

## Stage 0.5 — Give her the spine on Telegram *(one config entry, biggest single win)*

**File:** `~/.openclaw/openclaw.json` → `mcp.servers.molly-spine`

```bash
openclaw mcp add molly-spine --command bun \
  --arg run --arg /Users/taboost/molly/apps/spine/mcp/server.ts
openclaw mcp doctor molly-spine --probe
```

This hands Telegram-Molly the five tier-1 tools that already exist and are already tested —
`people_lookup`, `recall`, `calendar_read`, `morning_brief`, `spine_status`. The two tier-2 write
tools stay closed: `writesEnabled()` requires `SPINE_MCP_ALLOW_WRITES=1`, and it will not be set.
`preToolUseGuard` runs before tool lookup on every call regardless of caller
(`apps/spine/mcp/registry.ts:163`), so the tier-3 denials hold across this wire exactly as they
hold for Claude Code — `mcp/verify.ts` already proves that.

Nothing is built here. The work was done last session; this is the plug.

**Also fix while in the workspace:** `AGENTS.md`, `SOUL.md`, and `USER.md` all reference a
`MEMORY.md` durable-facts file that does not exist in `~/.openclaw/workspace/`. Dangling
reference — either create it or drop the references. Create it; Stage 3 writes to it.

**Verify:** ask the bot "who is in my identity graph" from the phone and get real rows back, not
an apology.

---

## Stage 1 — Memory that actually retrieves *(TypeScript, no Python)*

**Files:** `apps/spine/lib/embeddings.ts` (new), `apps/spine/lib/vectors.ts` (new),
`apps/spine/lib/memory.ts` + `mcp/registry.ts` (extend)

Today `recall` is `LIKE '%term%'` (`lib/memory.ts:79`) and `people_lookup` is the same
(`lib/people.ts:47`). There is **no embedding, vector, or semantic retrieval anywhere in the
repo** — confirmed by grep across the whole `molly-spine` branch. That is the real gap, and after
Stage 0.5 it is the gap that limits what she can answer on the phone.

- `embeddings.ts` — one function, `embed(text): Promise<Float32Array>`, POSTing Ollama's
  `/api/embed` with `nomic-embed-text` (~274 MB, local, free; 768-dim). No SDK. Note the current
  models on disk are chat models — `/api/embed` errors against them, so the pull is required.
- `vectors.ts` — load `sqlite-vec` into the **existing** `db` handle (`lib/memory.ts:9`), one
  connection, no second database. `vec0` virtual table keyed to `facts.id`.
- Backfill on first run; embed on write inside `addFact`.
- `recall` becomes hybrid: vector top-k **unioned with** the existing LIKE result, so exact
  matches never regress.

**Verify:** extend `apps/spine/spine.test.ts` — store "Colin's calculus final is in December",
query "when is the math exam", assert a hit. That returns nothing today. And
`bun run apps/spine/mcp/verify.ts` must still pass all 13 governance checks unchanged.

---

## Stage 2 — Surprise-gated writes *(the manifest's #1 write-from-scratch item)*

**File:** `apps/spine/lib/surprise.ts` (new)

Storing everything is how a memory becomes useless. Before `addFact` writes, embed the candidate
and compare against the nearest existing memory:

- cosine ≥ 0.93 → **drop** (already known)
- 0.80–0.93 → **merge** into the existing fact, bump its timestamp
- < 0.80 → **store** as new

The manifest's surprise cascade minus its unbuildable half: no per-token Bayesian surprise (that
needs logprobs and EM-LLM's attention hooks), just embedding distance, free once Stage 1 exists.
Pair with a decay pass — facts not retrieved in 90 days get archived, never deleted.

**Verify:** unit tests on all three branches with fixed vectors. Deterministic, no model call.

---

## Stage 3 — The self-correction loop *(Reflexion, MIT, pattern only)*

**Files:** `apps/spine/lib/lessons.ts` (new), `~/.openclaw/workspace/MEMORY.md`

`SOUL.md` already names her failure modes in the first person. This makes them operational
instead of decorative.

- New `lessons(id, trigger, lesson, hits, ts)` table on the same SQLite handle.
- After a session, the **local** model writes one line: what went wrong, what to do differently.
  Free, so it can run every session rather than being rationed.
- Before a session, retrieve top-k lessons by vector similarity to the incoming request and
  prepend them to the system prompt.
- `hits` increments on retrieval; lessons that never fire get pruned. Self-improving *and*
  self-pruning — the "knows its own downfalls" and "self-efficient" halves of the goal.

**Verify:** seed a lesson, send a matching request, assert it appears in the composed prompt.
Deterministic, no model call needed.

---

## Stage 4 — *(optional, needs an explicit yes)* Python sidecar for DSPy/GEPA

Prompt optimization (DSPy `MIPROv2`, GEPA) has no TypeScript equivalent. It means a `uv`-managed
venv under `apps/spine/optimizer/`, colliding with CLAUDE.md's "TypeScript always, never Python
unless explicitly approved."

**Recommendation: don't, yet.** DSPy optimizes against a metric on a labelled trainset. Neither
exists. Build 0–3, let `lessons` accumulate real examples for a month, revisit when there is
something to optimize *against*. The rule is bendable — there are already eight `.py` files here
— but bending it now buys nothing, and those eight are exactly the cautionary tale.

---

## Sequencing

**Agreed scope: stages 0 → 3 in one continuous build**, plus deleting the eight dead
`scripts/jarvis_*.py` files. Landed as staged PRs so each stage is independently verifiable and
revertible; Stage 4 stays unbuilt.

| Stage | Independently done? | Unblocks |
|---|---|---|
| 0 | Yes — Molly answers on Telegram, free, fast | Everything; retires the recurring-cost decision entirely |
| 0.5 | Yes — she has real context on the phone | Makes Stage 1 worth doing |
| 1 | Yes — `recall` stops missing obvious matches | Stages 2 and 3 both need embeddings |
| 2 | Yes — memory stops bloating | Long-horizon autonomy without a curation chore |
| 3 | Yes — she critiques herself | Makes "self-improving" testable rather than asserted |

Stages 0 and 0.5 together resolve the open question and cost nothing recurring. 1–3 are what make
her a second brain rather than a chat window.

## Branch

Spine work → **`molly-spine`**, per the CLAUDE.md branch rule. Stage 0 touches `launchd/` and
`bin/`, which live on `main`; `main` merges *into* `molly-spine`, never the reverse, so Stage 0
lands on `main` and is merged forward. Work branches `claude/<n>-<slug>`, PR into the branch they
forked from, `bun install && bun test && bunx tsc --noEmit` output pasted into every description.

## Risks I am not hiding

1. **RAM.** 25% free now. `KEEP_ALIVE=-1` pins ~5 GB permanently. Under a heavy desktop this
   trades responsiveness for pressure. Mitigation: 8b default, 14b opt-in, and the setting is one
   line to revert to `30m`.
2. **Quality drop is real.** qwen3:8b is not Sonnet 5. For scheduling, recall, triage and
   one-liners it is fine; for hard reasoning it is not. That is why the `apps/spine/mcp/` route
   stays on the Max subscription in Claude Code. Two brains, two jobs: the local one is always-on
   and free, the Max one is for when it matters.
3. **`sqlite-vec` needs the Homebrew SQLite path** (`/opt/homebrew/opt/sqlite/`). Verified here,
   but it makes the spine's Render deploy non-portable. Retrieval must degrade to the existing
   LIKE path when the extension fails to load — never crash.
4. **`mcp/registry.ts:22` imports `zod`** without declaring it; it resolves transitively through
   `@modelcontextprotocol/sdk`. Pin it while touching that file.
5. **Governance must not regress.** `agent/permissions.test.ts` and `mcp/registry.test.ts` (~50
   cases) encode the three-tier authority model. Nothing here touches tiers, and Stage 0.5 widens
   the caller set — so `mcp/verify.ts` staying green is the gate, not a formality.
6. **`openclaw onboard` resets the model to paid.** Known, bitten before. `bin/molly-local-model`
   exists to make recovery one command.

## Full verification

```bash
cd ~/molly
bun install
bun test                            # incl. new vector / surprise / lessons cases
bunx tsc --noEmit
bun run apps/spine/mcp/verify.ts    # 13 governance checks, $0
openclaw models list                # local provider registered
openclaw mcp doctor molly-spine --probe
curl -s localhost:11434/api/tags    # local brain alive
# then from the phone: ask "what's on my calendar this week" and time the reply
```
