# Restore Molly's Dashboard + Overnight Dispatch Pipeline

## Context

Three things were running: a static GitHub Pages dashboard (schedule + quicklinks), a local "Molly Console" (the "circle") for dispatching overnight/immediate AI tasks, and early AR-glasses (Halo/"Edith") work. All three are currently down. Root-cause audit (read-only, confirmed via git history/reflog and live `gh api` calls):

1. **Dashboard down**: `index.html` + `events.json` + the GitHub Pages Actions workflow (`pages.yml`) are all intact and correct on `main`. But the repo is currently **private**, and GitHub Pages isn't even enabled yet (`gh api repos/ceyre-boop/molly/pages` → 404). Pages doesn't serve private repos on GitHub Free. On top of that, today (2026-08-11) four same-day, broken deploy-config attempts (Render, Vercel, Glitch) were layered onto `main` chasing "get something live," none of which can work since they reference `apps/halo-edge`, which doesn't exist on `main`.
2. **Dispatch pipeline half-wired**: the real working code — the Molly Console app (`apps/console/`), a daemon-aware `bin/molly` (`--start`/`--stop`/`--status`), `bin/monitor-dispatch.ts`, and related handler scripts — was built on branch `claude/issue-2-20260811-0008` and **pushed but never merged into `main`**. `main` only has a stripped-down `bin/molly` with no daemon support. This is exactly why `~/Library/LaunchAgents/com.molly.dispatch-monitor.plist` is failing (exit code 1, "Unknown flag --start") and why `logs/console-server.log` shows ENOENT errors for `apps/console`. The 7 AM standup dispatcher (`standup-dispatch.ts`/`standup-report.ts`, driven by the separate, already-working `com.molly.morning-standup` LaunchAgent) does work today, but its only "notification" is a Pulse voice call — nothing writes to the dashboard, which is the gap for "show up as a section on my dashboard."
3. **AR glasses (Halo)**: real design docs exist (`Plans/build-it-all-right-peaceful-kahan.md`, `apps/halo-edge/*`, `halo/HALO_ARCHITECTURE.md`) but only on the unmerged branch. Explicitly deferred — recommendations only this round, no implementation.

User decisions already made (do not re-ask):
- Make the `ceyre-boop/molly` repo **public** again to restore free GitHub Pages (schedule data in the public `events.json` is already scrubbed of specifics — confirmed by reading it).
- For `events.private.json` / `desk-private.html` (tracked in git, contain real personal detail — health/study schedule, trading notes): **stop tracking going forward** (`git rm --cached` + `.gitignore`), no git-history rewrite, no force-push.

---

## Priority 1 — Restore the static GitHub Pages dashboard

**1.1 — Remove today's broken deploy debris from `main`:**
```bash
git rm render.yaml vercel.json .glitchignore bin/server.ts
```
Rewrite `package.json` to a minimal static-site manifest (no `start`/`dev` pointing at the now-deleted `bin/server.ts`):
```json
{ "name": "molly", "private": true, "type": "module", "engines": { "bun": ">=1.0.0" } }
```
Commit: `chore: remove Render/Vercel/Glitch deploy debris, restore static-only package.json`

**1.2 — Stop tracking private files:**
```bash
git rm --cached events.private.json desk-private.html
```
Append to `.gitignore`:
```
events.private.json
desk-private.html
```
Commit: `chore: stop tracking private desk files, add to .gitignore`

**1.3 — Push `main`.**

**1.4 — POINT OF NO EASY RETURN (confirm with user immediately before running):**
```bash
gh repo edit ceyre-boop/molly --visibility public
```
Repo history (including old commits with private data) becomes publicly visible/cloneable/cacheable at this point — irreversible in practice even though GitHub technically allows flipping back.

**1.5 — Enable GitHub Pages (Actions source), one-time bootstrap:**
```bash
gh api -X POST repos/ceyre-boop/molly/pages -f build_type=workflow
```
If that errors, fall back to the manual path: repo Settings → Pages → Build and deployment → Source → "GitHub Actions" (pages.yml is auto-detected). Verify with `gh api repos/ceyre-boop/molly/pages` → expect `build_type: workflow` and an `html_url` (`https://ceyre-boop.github.io/molly/`).

**1.6 — Trigger and verify deploy:**
```bash
gh workflow run "Deploy to GitHub Pages" --repo ceyre-boop/molly
gh run list --repo ceyre-boop/molly --workflow="Deploy to GitHub Pages" --limit 3
curl -sI https://ceyre-boop.github.io/molly/
```
Confirm HTTP 200 and page body contains "Molly's Desk".

**Verification checklist:**
- [ ] `git ls-files` shows no `render.yaml`/`vercel.json`/`.glitchignore`/`bin/server.ts`/`events.private.json`/`desk-private.html`
- [ ] `gh repo view ceyre-boop/molly --json visibility` → `PUBLIC`
- [ ] `gh api repos/ceyre-boop/molly/pages` → 200, `build_type: workflow`
- [ ] `gh run list` shows a successful Pages deploy run
- [ ] `curl -sI https://ceyre-boop.github.io/molly/` → 200, page renders

---

## Priority 2 — Restore the overnight dispatch pipeline, visible on the dashboard

**2.1 — Bring over only the needed pieces from `claude/issue-2-20260811-0008`** (checkout-based cherry-pick, not `git merge` — avoids the branch's conflicting deletion of `pages.yml`/`vercel.json`/etc. ever touching `main`'s history):
```bash
git checkout claude/issue-2-20260811-0008 -- \
  apps/console \
  bin/molly \
  bin/monitor-dispatch.ts \
  bin/respond.ts \
  bin/dispatch-handler.ts \
  bin/check-dispatch.ts \
  DISPATCH.md \
  WORKFLOW.md \
  launchd/com.molly.dispatch-monitor.plist
```
Explicitly excluded: `apps/halo-edge/`, `halo/`, `bin/halo-*.ts`, `state/halo-*.json`, `PHASE_1_COMPLETE.md` (all Halo/AR, deferred).

Hand-edit the checked-out `bin/molly`: remove the `--halo-start`/`--halo-stop`/`--budget`/`--halo-status` case blocks and their `start_halo`/`stop_halo` functions (they call scripts we're not bringing over), and trim the Halo lines from `--help` and `show_status`. Keep `--start`/`--stop`/`--status` (these only touch `monitor-dispatch.ts`/`check-dispatch.ts`, which are included) and the existing `-n`/`-r` dispatch logic (confirmed byte-identical superset on the branch).

Hand-merge `package.json` (don't blind-overwrite — reconcile with Step 1.1's version):
```json
{
  "name": "molly",
  "private": true,
  "type": "module",
  "engines": { "bun": ">=1.0.0" },
  "scripts": { "console": "bun run apps/console/server.ts", "test": "bun test" }
}
```

Verify nothing Halo-related or pages.yml-related was reintroduced (`git diff HEAD -- .github/workflows/pages.yml` empty, `ls apps/halo-edge` errors), then commit and push:
`feat: restore dispatch pipeline (console app, daemon-aware molly CLI, monitor/handler scripts) from claude/issue-2-20260811-0008; halo-edge intentionally excluded`

**2.2 — New: overnight activity visible on the dashboard.**

New file `activity.json` at repo root (flat, sibling of `events.json`), newest-first, capped at last 20 entries:
```json
[{ "ts": "2026-08-11T07:25:00-04:00", "kind": "pr", "title": "...", "repo": "outreach-builder", "url": "https://github.com/..." }]
```
Extend `bin/standup-report.ts` (it already computes the list of open Claude PRs): map each into `{ts, kind:"pr", title, repo, url}`, dedup by `url` against the existing file, prepend, trim to 20, write, then commit+push (wrapped so "nothing to commit" doesn't fail the script):
```bash
git add activity.json && git commit -m "chore: update overnight activity feed" -q || true
git push origin main -q || true
```
This push is what makes overnight activity show up on the public Pages site.

Add a matching "Overnight" section to `index.html`, following its existing `.rows`/`.row`/`.card`/`.chip` idiom (same pattern as the `needs`/`deadlines` sections) and the same graceful-degrade `fetch()` pattern already used for `events.json` (missing file → empty section, not a broken page). Insert the section right after "Needs you". This is the one direct edit to `index.html` in this whole plan.

**2.3 — Reload the LaunchAgent** (plist content is already correct/unchanged, just needs the daemon-aware `bin/molly` on disk):
```bash
launchctl unload ~/Library/LaunchAgents/com.molly.dispatch-monitor.plist
launchctl load ~/Library/LaunchAgents/com.molly.dispatch-monitor.plist
launchctl list | grep com.molly.dispatch-monitor
./bin/molly --status
```
Confirm no more "Unknown flag --start" in `logs/launchd-monitor.log`.

**2.4 — End-to-end verification:**
```bash
./bin/molly "test task — verify dispatch pipeline restored" -r molly
```
(Use `-r molly` for the test to avoid noise on `outreach-builder`; confirms the two-repo dispatch constraint from CLAUDE.md still holds.)
- [ ] Issue appears via `gh issue list --repo ceyre-boop/molly --label claude --limit 3`
- [ ] `./bin/molly --status` shows it queued/picked up
- [ ] Pulse notification fires (check `logs/monitor-dispatch.log` or listen)
- [ ] `bun bin/standup-report.ts` (manual run for testing) updates, commits, pushes `activity.json`
- [ ] `curl -s https://ceyre-boop.github.io/molly/activity.json` reflects it post-redeploy
- [ ] Dashboard visually shows the new "Overnight" section populated

---

## Priority 3 — AR glasses (Halo/"Edith") — recommendations only, not implemented this round

- The design doc (`Plans/build-it-all-right-peaceful-kahan.md`) and branch code (`apps/halo-edge/`) already exist and are architecturally sound (per-app-scoped `vercel.json`, not a root-level one — this is actually the right pattern, unlike today's broken root `vercel.json`).
- Recommend: once Priority 1/2 are stable, merge `apps/halo-edge/` the same checkout-based way, but deploy it as its **own** scoped Vercel project (`vercel --cwd apps/halo-edge`), not bundled with the static Pages dashboard — keeps the $0.50–$2/mo Claude API cost isolated and the two deploy targets (static Pages for dashboard, serverless Vercel function for Halo) from fighting each other the way today's debris did.
- Recommend building Protocol 1 (paper/doc → answer) first — simplest, no local biometric storage, most immediately useful — before Protocol 2 (face memory, needs local-only embedding storage + BIPA-aware design already noted) or Protocol 3 (maps, needs continuous GPS + routing API cost).
- Authority tiers (Tier 1 auto-render / Tier 2 confirm / Tier 3 external query) should reuse the same `MOLLY_AUTHORITY.md` pattern already referenced, not a new scheme.
- No action taken this round beyond this note.

## Critical files
`/Users/taboost/molly/index.html`, `package.json`, `bin/molly`, `bin/standup-report.ts`, `.gitignore`, `.github/workflows/pages.yml`, `launchd/com.molly.dispatch-monitor.plist`
