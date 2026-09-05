# MEMORY

Durable facts about Colin and his work. `AGENTS.md`, `SOUL.md` and `USER.md` all
reference this file; it did not exist until 2026-09-05, so every reference was
dangling and nothing was ever written here.

## Where memory actually lives

Two stores, on purpose:

- **This file** — a handful of durable, human-editable facts. Read at session
  start. Keep it short; everything here costs prompt tokens on every turn.
- **The spine** (`~/molly/apps/spine`, SQLite) — the real store, reached through
  the `spine__*` tools. Semantic recall, so a question does not have to use the
  same words the fact was written in. Facts nothing recalls for 90 days are
  archived automatically. This is where anything specific belongs.

Prefer the spine. Add a line here only when it is something to be read on
*every* turn rather than looked up when relevant.

## Standing facts

- Colin's course and registration details, trading schedule and long-track
  goals are in `USER.md`, kept current there rather than duplicated here.
- The local model on this machine is free and has no quota. Reflection and
  recall run on it as often as they need to; there is no budget to ration.

## What I have learned about my own failures

The spine keeps a `lessons` table. After a session goes wrong, the local model
writes one line about what to do differently, and the applicable lines come back
before a similar request. Retrieval is what keeps a lesson alive — one that
never fires in 30 days is pruned.

The first one, recorded 2026-09-05, from this machine's own setup:

> Verify the service configuration is applied by checking the running process,
> not just the command exit code.

That is `SOUL.md`'s "I claim success from signals that aren't", caught in the
wild: `launchctl kickstart -k` printed success and restarted the process without
ever re-reading the plist.
