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
| Model | `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free` — $0, 1M context |
| Credential | OpenClaw secret store, write-only, host-scoped to `openrouter.ai` |
| Channel | Telegram, `dmPolicy: allowlist`, single numeric `allowFrom` |

### Quota discipline

The free tier is **50 requests/day**. Two background jobs were spending it
before a single message was sent:

- **Heartbeat, every 30 minutes** — 48 calls/day, the entire quota. Now `720h`.
- **Memory dreaming, nightly** — disabled at
  `plugins.entries.memory-core.config.dreaming.enabled`. Disabling the cron
  alone is not enough; the plugin recreates it on every startup.

Colin's instruction was "I don't need it doing something all the time, just when
I call on it." Both changes serve that directly.

The weekly skill-collection review is deliberately left running — it is the only
scheduled job that serves the self-improvement goal, and it costs one call a week.

## Verification

```bash
openclaw agent -m "Who are you, and what is on my plate this week?"
```

Returns Molly, in voice, citing real course times and the UM-Flint dates. If it
returns a generic assistant, the workspace files did not load.

## Known rough edges

- The free pool is contended: roughly one call in three returns "service
  temporarily overloaded" and needs a resend. `openRouterRouting.allow_fallbacks`
  is on, which helps but does not eliminate it. A one-time $10 OpenRouter credit
  raises the daily cap 50 → 1000 permanently but does not buy priority.
- `openclaw gateway restart` does not restart an unmanaged process — it prints
  success and changes nothing. Use `launchctl kickstart -k` against the service.
- `openclaw onboard` resets `agents.defaults.model.primary` to `openrouter/auto`,
  which is paid. Re-run `bin/openclaw-free-model` after any onboard.
