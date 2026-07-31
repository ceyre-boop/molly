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

## The Obsidian brain

`~/Obsidian/Obsidian/00-BRAIN` is the source of truth for what Colin is working on.
The dashboard is served over http and cannot read outside its own folder, so the CLI bridges it:

```bash
bun molly.ts brain                 # read the vault → write state/brain.json, set the handoff
bun molly.ts brain --sync          # also put @auto-tagged tasks on the board
bun molly.ts brain --sync --all    # mirror every open NEXT.md task (45+ — buries the board)
```

- `state/brain.json` holds a distilled digest of `CONTEXT.md`. The dashboard reloads it every
  60s and prepends it to every local-model call, so your one-liners know what Alta and TABOOST
  actually are instead of guessing.
- The top `@auto` task in `NEXT.md` becomes the standing handoff.
- Sync is **additive and id-stable**: each card remembers the vault line it came from, so a task
  Colin has already moved to Done never reappears. Re-running is safe.
- Re-run `brain` after the vault changes — nothing watches it yet.

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

## How the face works

The rig is a readout of the local model, not a lookup table. On any event — a new
handoff, a status change, a card moved, or a ~4-minute idle beat — the dashboard asks
qwen2.5 for structured JSON:

```json
{ "say": "Colin, time for a break?", "mood": "bored", "action": "stomp" }
```

`mood` is one of `neutral smug furious bored delight suspect`; `action` is one of
`wave shrug dance rage stomp dangle none`. Both are validated against those
vocabularies before they touch the rig — a model's word is not a contract.

The model's choice **owns the face until the next event**. It does not expire on a
timer. The status→mood table (`idle→bored`, `working→smug`, …) is only the fallback
for when the brain is offline; if Ollama goes away mid-session the rig hands the face
back to the table rather than freezing in whatever it last felt.

Reactions are debounced to one per 20s so a burst of card moves doesn't spam the model.

Pokeable from the console, same shape as the original rig's `window.gremlin`:

```js
molly.react('the deploy just failed')   // ask the model how it feels, and perform it
molly.play('rage'); molly.setMood('suspect'); molly.say('hi', 3000)
molly.last                              // what the model last chose, and why
molly.brain                             // { status, vault }
molly.board                             // lane counts + agent status
```
