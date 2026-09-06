# Molly in OpenClaw

The messaging surface. OpenClaw is the harness, a free OpenRouter model is the
engine, and the files in `workspace/` are who Molly is.

`~/.openclaw/workspace/` is the live copy the agent reads. This directory is the
versioned one — edit here, then copy across and restart:

```bash
cp openclaw/workspace/*.md ~/.openclaw/workspace/
openclaw agents set-identity --agent main --from-identity
launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway
```

## The identity files

| File | What it holds |
|---|---|
| `IDENTITY.md` | Name, creature, vibe, emoji. Synced into agent config by `openclaw agents set-identity --from-identity`. |
| `SOUL.md` | Character. The Seven, goal orientation, named failure modes, voice, boundaries. |
| `USER.md` | Colin's directives and standing context — courses, UM-Flint dates, trading, the MCAT track. |

`SOUL.md` carries the part that matters for a second brain that improves itself:
Molly names her own failure modes in the first person — claiming success from
signals that aren't, hardcoding things that expire, over-explaining when
unsure — and the rule that a correction happening twice means the approach is
wrong, not the effort.

## Running state

| | |
|---|---|
| Service | `ai.openclaw.gateway` LaunchAgent, survives reboot |
| Bind | `127.0.0.1` only, never the LAN |
| Model | `ollama/qwen3:8b` on this machine — $0, no quota, 41k context |
| Engine | `com.molly.ollama` LaunchAgent, model pinned resident, 8k runtime context |
| Tools | `tools.profile: minimal` + the spine over MCP (`spine__*`, 5 read-only tools) |
| Credential | none needed for the local model; the OpenRouter key stays in the secret store as a manual fallback |
| Channel | Telegram, `dmPolicy: allowlist`, single numeric `allowFrom` |

### Why local

Anthropic's April 2026 policy excludes third-party harnesses — OpenClaw by name
— from Max-subscription coverage, and enforces it server-side. The OpenRouter
free pool was the alternative and was rejected as "not fast intuitive": roughly
one call in three came back overloaded. A model on this machine has no quota, no
402, no policy exposure, and measured *faster* than the free pool.

Measured here: **5.8s warm** for a Telegram-shaped turn, with the right identity
and real context. First turn of a session is ~20s while the prompt is ingested.

### Three silent failures this setup had to get past

None of them errored. Each one just quietly did the wrong thing.

- **Context truncation.** Ollama sizes its runtime context from VRAM and landed
  on 4096. The system prompt was 21,063 tokens, so the server truncated it and
  threw away the identity files. Molly answered "I am Qwen, and I work for
  Alibaba Group." Fixed with `OLLAMA_CONTEXT_LENGTH`.
- **The wrong tool profile.** `tools.profile` was `coding` — the full
  filesystem/runtime toolset, wrong for a secretary who explicitly does not
  write code, and most of that 21k prompt. Now `minimal`, with the spine's
  read-only tools added back through `tools.alsoAllow`.
- **A restart that was not one.** `launchctl kickstart -k` restarts the process
  but does NOT re-read the plist. Every "restarted and verified" claim was the
  old process answering with the old config. It takes `bootout` + `bootstrap`,
  and the check is `ps eww` on the running pid — never the command's exit code.

### Quota discipline

Moot for the local model, kept because the OpenRouter fallback still has a
50/day cap and because both jobs also cost RAM and CPU here:

- **Heartbeat, every 30 minutes** — 48 calls/day, an entire free quota. Now `720h`.
- **Memory dreaming, nightly** — disabled at
  `plugins.entries.memory-core.config.dreaming.enabled`. Disabling the cron
  alone is not enough; the plugin recreates it on every startup.

Colin's instruction was "I don't need it doing something all the time, just when
I call on it." Both changes serve that directly.

### The spine, on the phone

`mcp.servers.spine` runs `apps/spine/mcp/server.ts` over stdio from a git
worktree at `.worktrees/spine`, so its path does not break when the main tree
switches branches. Five tier-1 read tools reach Telegram; the two write tools
stay closed because `SPINE_MCP_ALLOW_WRITES` is unset, and the tier-3 guard runs
before tool lookup on every call regardless of who is asking.

The weekly skill-collection review is deliberately left running — it is the only
scheduled job that serves the self-improvement goal, and it costs one call a week.

## Verification

```bash
openclaw agent -m "Who are you, and what is on my plate this week?"
```

Returns Molly, in voice, citing real course times and the UM-Flint dates. If it
returns a generic assistant, the workspace files did not load.

## Known rough edges

- An 8B model picks the wrong tool sometimes. Asked for `spine_status` it
  reached for OpenClaw's own `status` and reported session stats as if they were
  the spine's. Natural phrasing ("who is in my identity graph?") works better
  than naming the tool.
- `KEEP_ALIVE=-1` pins EVERY model touched, not just the default. Loading a
  second one to benchmark it put 10.7GB resident on a box already deep in swap
  and cut generation from 34 to 12.8 tok/s. `OLLAMA_MAX_LOADED_MODELS=2` caps it
  at the chat model plus the embedder.
- Raising the context window is not free. 32k cost ~5.4GB of KV cache and made
  everything slower on this machine. 8k holds the ~6k system prompt with room
  and stays near 1.4GB. Check `sysctl vm.swapusage` before raising it.
- `openclaw gateway restart` does not restart an unmanaged process — it prints
  success and changes nothing. Use `launchctl kickstart -k` against the service.
- `openclaw onboard` resets `agents.defaults.model.primary` to `openrouter/auto`,
  which is paid. Re-run `bin/molly-local-model` after any onboard.
