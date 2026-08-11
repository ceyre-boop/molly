# Morning Standup Routine — Spec (DRAFT)

Prepared by Molly, 2026-08-10. Implementation requires "Molly, engineering mode"
(the runner script is code that acts on Colin's repos/issues, even though it lives
in `~/molly`). This spec is the complete build plan.

## Outcome

At 7:00 AM every weekday, coded task specs waiting in the vault become GitHub
issues tagged for the Claude Action. By ~7:20 AM, Colin gets one notification:
"N PRs ready for review." His role: 1-click review over coffee. No terminal.

## Why local, not a cloud /schedule routine

The task source is `NEXT.md` in the local Obsidian vault
(`/Users/taboost/Obsidian/Obsidian/00-BRAIN/NEXT.md`). A cloud routine can't read
it. So the dispatcher runs locally as a LaunchAgent (consistent with the ~60
already running), and the heavy lifting — code, tests, PR — happens in GitHub's
cloud runner via the Action. Local footprint stays tiny: parse markdown, call
`gh issue create`, done.

## Pipeline

```
07:00  com.molly.morning-standup.plist fires
  │
  ├─ 1. Parse NEXT.md for task blocks marked `#dispatch` (opt-in marker —
  │     nothing is dispatched unless Colin tagged it; this is the prompt-
  │     injection firewall: vault text never reaches a shell, only an issue body)
  │
  ├─ 2. For each: `gh issue create --repo ceyre-boop/TABOOST_Platfrom
  │     --title "<task title>" --body "<spec>\n\n@claude" --label claude`
  │     Then rewrite the block in NEXT.md: `#dispatch` → `#dispatched(#<issue>)`
  │     (idempotent — re-runs never double-file)
  │
  ├─ 3. GitHub Action takes over per claude-github-workflow.yml:
  │     branch → implement → validate scripts → PR with test proof
  │
  └─ 4. ~07:20 second LaunchAgent pass (or `gh pr list` poll): count open
        claude/* PRs → notify via Pulse voice (localhost:31337/notify) +
        Telegram gateway: "3 PRs ready for review."
```

## Components to build (engineering mode)

| # | Artifact | Location | Notes |
|---|----------|----------|-------|
| 1 | `standup-dispatch.ts` | `~/molly/bin/` | bun + TypeScript per house rules; parses NEXT.md, files issues via `gh`; dry-run flag |
| 2 | `standup-report.ts` | `~/molly/bin/` | polls `gh pr list --label claude`, fires Pulse + Telegram notification |
| 3 | `com.molly.morning-standup.plist` | `~/Library/LaunchAgents/` | Mon–Fri 07:00, runs #1 then #2 with 15-min delay |
| 4 | `claude.yml` | TABOOST_Platfrom repo | from `claude-github-workflow.yml` draft (adjacent file) |
| 5 | Branch protection on main | GitHub settings | REQUIRED before first run — push-to-main is prod deploy |

## Guardrails (non-negotiable)

- **Opt-in only**: `#dispatch` tag required. The routine never infers what to build.
- **No local code execution from notes**: vault text becomes an issue body, never a
  shell command. No `--dangerously-skip-permissions` anywhere in this design.
- **Cap**: max 3 dispatches per morning. More than that queues to the next day —
  review bandwidth is the bottleneck, not generation.
- **PII tripwire**: any spec mentioning Firebase rules/auth files as a draft PR
  flagged `[RULES REVIEW REQUIRED]` (enforced in the workflow prompt).
- **Kill switch**: `launchctl unload ~/Library/LaunchAgents/com.molly.morning-standup.plist`
  or an empty NEXT.md — either fully stops the pipeline.

## Open questions for Colin

1. Weekdays only, or 7 days? (Spec assumes Mon–Fri.)
2. Notification channel priority: Pulse voice, Telegram, or both? (Spec assumes both.)
3. Extend to other repos (quant is presumably off-limits per sovereign isolation) —
   TABOOST_Platfrom only for now?
