# OpenClaw — Molly's messaging gateway

Multi-channel gateway (Telegram, WhatsApp, Signal, Slack, iMessage, Discord…)
that fronts an agent. Installed globally: `openclaw 2026.9.1`.

```bash
bin/molly-local-model                            # the default: a model on this machine
bin/molly-local-model qwen3:14b                  # or name one; refused unless it is pulled
launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway   # apply
```

`bin/molly-local-model` points OpenClaw at the Ollama server this machine
already runs, registering `models.providers.ollama` with the **native** API and
no `/v1` suffix — OpenClaw's own docs are explicit that the OpenAI-compatible
URL breaks tool calling and lets models emit raw tool-call JSON as prose. It
reads `/api/tags` first and refuses to pin a model that is not actually pulled,
because a model string that resolves in config and 404s at runtime is worse
than no change at all.

`bin/openclaw-free-model` is still here as the OpenRouter fallback. It checks
the live models API and refuses anything that is not $0 in both directions —
an earlier version hardcoded a `:free` slug that OpenRouter later withdrew,
leaving the slug resolving as paid. Both scripts back up to `openclaw.json.bak`.

Local is the default because it has no quota, no 402, and no policy exposure,
and because it measured *faster* than the free OpenRouter pool: 5.8s warm for a
Telegram-shaped turn against roughly one call in three coming back overloaded.

## Why not the Claude Max subscription

Colin asked for this to run on the Max seat. It can't, and the reason is worth
keeping written down so it isn't re-litigated:

- **April 4, 2026** — Anthropic announced Claude subscriptions no longer cover
  third-party harnesses, naming OpenClaw specifically. Usage must be billed
  pay-as-you-go instead.
- **March 2026** — subscription OAuth was restricted to first-party products.
  Using those tokens in any other product, tool, or service — the Agent SDK
  included — is not permitted, and it is enforced server-side.
- Anthropic reserves the right to restrict the account **without prior
  notice**.

OpenClaw ships the workarounds (`--auth-choice anthropic-cli`, `setup-token`).
They are the named case, not a loophole. The Max seat runs Claude Code, the
spine, the dispatch pipeline, and the standup crons; a gateway's model bill is
not worth risking all of it.

**What the subscription does still cover:** Claude Code itself, including when
Claude Code calls third-party MCP servers. If the goal is "Molly on the Max
plan," the architecture is Claude Code as the harness with messaging as a tool
it calls — which is close to what `apps/spine/` already is. That is a different
build from this one.

## The backend: a verified-free OpenRouter model

Currently **`openrouter/minimax/minimax-m3:free`** — $0 both directions,
1,048,576 token context.

| | |
|---|---|
| Cost | $0 |
| Rate limit | 20 requests/minute |
| Daily cap | 50/day — or **1000/day** permanently after $10 of OpenRouter credit is purchased once |

The $10 is a one-time purchase, not a subscription, and the raised cap survives
spending the credit. That is the practical unlock: 20x the daily throughput,
permanently, for less than one month of any assistant subscription.

### Why the script verifies instead of hardcoding

This started on `moonshotai/kimi-k2.6:free`, chosen because it was free, strong,
and had a 262K context. OpenRouter later withdrew the free variant — and the
failure was silent in the worst way. The slug still resolved; it had simply
become **paid**. A config written weeks earlier would have quietly started
billing.

Worse, `openclaw onboard` resets `agents.defaults.model.primary` to
`openrouter/auto`, which routes to whatever OpenRouter picks — also paid. Two
independent paths to an unexpected bill, neither of which announces itself.

So the script no longer trusts a slug. It reads the live models API, refuses
anything that is not $0 in both directions, and falls through a preference list
until it finds one that is still free. **Re-run it after any `openclaw onboard`**,
which is the step that resets the model.

## First run

```bash
bin/openclaw-kimi
openclaw onboard --auth-choice openrouter-oauth   # browser sign-in; stores the key
openclaw channels login                            # pick channels
openclaw gateway --port 18789                      # run
```

OAuth is preferred over `--auth-choice openrouter-api-key` so no key is ever
pasted into a file. Per this repo's non-negotiables, tokens live in the
environment or the keychain — never in the repo.

## Notes

- Gateway binds to **loopback only**. Nothing is reachable off the machine.
- OpenClaw is a Node app (needs Node ≥ 22) installed via `bun install -g`.
- Config lives at `~/.openclaw/openclaw.json`, outside this repo. The script
  never overwrites an existing one — it prints the change to make instead.
- Switching backends later is one line: `agents.defaults.model.primary`.
  OpenClaw supports 60+ providers, so Moonshot direct, Groq, or an Anthropic
  API key are all a config edit away.
- Telegram is locked down with `dmPolicy: "allowlist"` and an explicit numeric
  `allowFrom`. The default `pairing` policy is weaker — the docs recommend an
  allowlist for a one-owner bot, and it survives config churn that a stored
  pairing approval may not.
- The gateway runs **unmanaged** — it does not survive a reboot. `openclaw
  gateway install` registers it with launchd if it should.
- The `memory-core` plugin schedules a "dreaming" cron on startup. On a
  50/day free tier that spends quota unasked; disable it if the cap bites.
