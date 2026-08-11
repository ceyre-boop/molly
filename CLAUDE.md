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
