# OpenClaw — Molly's messaging gateway

Multi-channel gateway (Telegram, WhatsApp, Signal, Slack, iMessage, Discord…)
that fronts an agent. Installed globally: `openclaw 2026.9.1`.

```bash
bin/openclaw-kimi     # creates the workspace, then sets the model
```

The script runs `openclaw setup --baseline` first (which writes its own
config), then patches `agents.defaults.model.primary` in place. It backs up to
`openclaw.json.bak`, preserves every other key, and refuses to retarget a
backend someone else already chose.

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

## The backend: Kimi K2.6, free

| | |
|---|---|
| Model | `openrouter/moonshotai/kimi-k2.6:free` |
| Cost | $0 |
| Context | 262,144 tokens |
| Rate limit | 20 requests/minute |
| Daily cap | 50/day — or **1000/day** permanently after $10 of OpenRouter credit is purchased once |

The $10 is a one-time purchase, not a subscription, and the raised cap survives
spending the credit. That is the practical unlock: Kimi's own **Moderato** tier
is ~$19/month recurring for K3 and Kimi Code; $10 once gets 20× the daily
throughput here and never bills again.

The gap versus Moderato is honest: this is **K2.6, not K3**, and there is no
Kimi Code agent, Deep Research, or Slides/Websites generator. For a messaging
gateway none of those matter — it needs a good conversational model with a long
context, which is exactly what K2.6 free is.

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
