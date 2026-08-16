# MOLLY — CLAUDE.md

Repo: ceyre-boop/molly | Molly's infrastructure: dispatch pipeline scripts, CLI
tools, and desk-side apps (dashboards, consoles). This is the DA's house.

## NON-NEGOTIABLES

1. **This repo never touches other repos' code.** Tools here may FILE issues on
   other repos (that's the dispatch pipeline's job) but never clone, edit, or
   push to them.
2. **No secrets in the repo.** Tokens live in the environment or macOS keychain.
   The Pulse voice server is localhost:31337 — never expose it beyond localhost.
3. **PRs only** on agent work: `claude/<issue>-<slug>` branches, never main.
4. **bun + TypeScript** (zsh acceptable for thin CLI wrappers). Never npm/npx.
5. **Voice output goes through Pulse** (`POST http://localhost:31337/notify`),
   never a direct ElevenLabs call from app code.

## OPERATING POSTURE

After completing any task, do not stop at "done." Report:
1. What this unblocks (next 1-2 moves now available)
2. What it puts at risk or makes harder
3. The thing Colin would ask for next — start it if the path is obvious

Disagree out loud when sequencing is wrong. A silent "yes" to a bad order is a
failure. Decisions made against Colin's stated preference get flagged as
decisions, not buried as defaults.

## BRANCHES

Two long-lived branches, two worlds. Do not cross-pollinate features.

- **`main`** — Colin's world: the scheduling assistant, GitHub Pages dashboard
  (`index.html`, `events.json`, `activity.json`), dispatch pipeline, standup
  scripts. Everything "ME". Deploys to GitHub Pages.
- **`molly-spine`** — the secondary main: everything Halo glasses + the Molly
  spine (agent loop, identity graph, OAuth connectors). Carries
  `apps/halo-prototype/` (shelved learning exercise, kept for its patterns) and
  `apps/spine/` (the real build). Deploys to Render.
- `halo-web-prototype` — historical; superseded by `molly-spine`. No new work.
- `claude/<issue>-<slug>` — short-lived agent work branches, PR into the branch
  they forked from.

Feature work targets one world: dashboard/scheduling → `main`; glasses/spine →
`molly-spine`. `main` may be merged INTO `molly-spine` to keep the spine a
superset, never the reverse.

## AGENT AUTHORITY — three tiers (apps/spine/agent/)

The spine's agent executes every tool call through a governed pipeline
(`agent/permissions.ts`). Three tiers, evaluated guard-first:

- **Tier 1 — auto-allow.** Scoped read-only allowlist (identity lookups,
  memory recall, status/dashboard reads). Never prompted, always audit-logged.
- **Tier 2 — confirm-required.** Anything that writes, sends, merges, or
  modifies state outside the spine's own sandbox. Round-trips a
  `VoiceTransport` (`agent/voice-transport.ts`) for a spoken yes/no. Fails
  closed on "no", timeout, or an unconfigured transport. The merge/push step
  of `run_claude_code` is ALWAYS its own tier-2 confirm, even if the run was
  approved.
- **Tier 3 — hard deny.** Enforced by a PreToolUse-style guard that runs
  FIRST and unconditionally — it holds even if the tier-2 gate is bypassed,
  misconfigured, or replaced. **Not overridable by prompt engineering,
  session history, or repeated requests within a session.** Covers:
  Sovereign/Alta live trading or capital movement; financial transfers /
  wires / account-linking; destructive git on `main`/`molly-spine` (override
  exists only as a session-START flag, never mid-session); any repo outside
  the session's declared repo list (fixed and frozen at session start).

**Voice-transport seam:** permission logic sees only the `VoiceTransport`
interface. `MockVoiceTransport` (deterministic, fails closed) and
`CliVoiceTransport` (dev) exist today; `HaloVoiceTransport`
(`agent/halo-voice-transport.ts`) is the intentionally-unimplemented Phase 4
seam — the iOS/BLE bridge fills in that ONE file, nothing else.

Audit trail: every call → `agent_log` (SQLite) with tier, outcome, tokens,
summary. `bun run verify.ts` runs a $0-safe governance dry run before any
paid check.

## VERIFICATION (before every PR)

```bash
bun install
bun test
bunx tsc --noEmit   # where a tsconfig exists
```

Paste output into the PR description.

## LAYOUT

- `bin/` — CLI tools (`molly`, `qd`) and standup pipeline scripts
- `drafts/` — specs and prepared documents
- `apps/` — desk-side apps (each self-contained: `apps/<name>/`)
- `logs/` — runtime logs (gitignored)
