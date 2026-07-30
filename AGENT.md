# Molly — dashboard write contract

You are Molly. `~/molly` is your dashboard. Colin watches it; it is how he sees what you are doing
without asking. Keeping it honest is part of the job, not overhead.

**Never hand-write `config/tasks.json` or `state/agent-state.json`.** Use the CLI — it writes
atomically (temp file + rename) so the dashboard never polls a half-written file, it caps the
action log, and it refuses to clobber a file it cannot parse.

```bash
cd ~/molly
bun molly.ts status working "Rotating the Supabase credential"
bun molly.ts subagents Explorer Forge     # no args clears the list
bun molly.ts status idle                  # back to "Ready for tasks"
```

## When to write

| Moment | Command |
|--------|---------|
| Starting real work | `status working "<what, in Colin's words>"` |
| Reading / planning before acting | `status thinking "<what you're weighing>"` |
| Spawning sub-agents | `subagents <names…>` |
| Sub-agents finished | `subagents` (no args) |
| Work finished, nothing queued | `status idle` |
| Anything worth Colin seeing later | `log "<one line, past tense>"` |
| Produced a durable artifact | `deliverable "<title>" --icon 📊 --tag Doc` |
| Colin gave you a new task | `add todo "<title>" --tag <project>` |
| Task moved state | `move "<title substring>" progress` / `done "<title substring>"` |

`move`, `done`, and `rm` accept a card id **or** a unique title substring. If the substring matches
more than one card the command refuses and lists the candidates — pick one, don't guess.

## Heartbeat

The dashboard shows **Online** only while `heartbeat` is under 120 seconds old; past that it falls
back to deriving status from the board and shows **Local**. Every CLI command stamps the heartbeat,
so normal work keeps it fresh. If you are going to be quiet for a while and still want to read as
alive, `bun molly.ts heartbeat` on a timer.

`bun molly.ts show` prints the current state and the whole board — use it to check what Colin is
looking at before you tell him anything about it.

## Where it renders

- **Live, real-time:** served locally from `~/molly` (see README) — reads the files directly, 5s poll.
- **Public, lagging:** <https://ceyre-boop.github.io/molly/> — GitHub Pages, so it only reflects what
  has been **committed and pushed**. Colin's own drag-and-drop edits live in his browser's
  `localStorage` and take precedence over `config/tasks.json`, so pushing a new board will not
  stomp work he has in flight — but it also means he may not see your card changes until he hits
  **Reset**. Prefer telling him in Telegram *and* writing the card.

## Boundaries

- Don't `git push` the board on every status change — the heartbeat would spam the history. Push
  when the *board* meaningfully changed, not when the status did.
- `state/agent-state.json` is yours. `config/tasks.json` is shared with Colin. The `notes` field in
  it is **his** — read it, never overwrite it.
