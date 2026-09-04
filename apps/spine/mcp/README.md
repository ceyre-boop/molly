# Spine over MCP — the subscription route

Claude Code holds the Max subscription and runs the loop; the spine is exposed
to it as an MCP server. Molly's identity graph, memory, calendar and brief
become tools Claude Code can call.

This is the counterpart to `bin/openclaw-kimi`. Same goal — Molly reachable
with her real context — reached two different ways:

| | OpenClaw + Kimi | Spine over MCP |
|---|---|---|
| Harness | OpenClaw | Claude Code |
| Model | Kimi K2.6 (OpenRouter free) | Whatever Claude Code is on |
| Billed to | Nothing ($0) | The Max subscription |
| Anthropic policy | N/A — not an Anthropic product | **Covered.** Claude Code calling third-party MCP servers is explicitly still subscription usage |
| Reach | Any channel OpenClaw supports — Telegram, WhatsApp, Signal, iMessage | Wherever Claude Code runs — terminal, desktop, IDE, web |
| Governance | OpenClaw's own | The spine's Tier-3 guard, in-process |

The policy line that makes this route legitimate: subscriptions stopped
covering third-party harnesses in April 2026, but Claude Code itself was never
affected, **including when it calls third-party MCP servers** — the calls
happen inside Claude Code. Nothing here touches subscription OAuth.

## Run it

Registered at the repo root in `.mcp.json`, so Claude Code picks it up
automatically when started in `~/molly`. To reach Molly from every project:

```bash
claude mcp add molly-spine --scope user -- bun run ~/molly/apps/spine/mcp/server.ts
```

## Tools

Read-only by default — five tools:

| Tool | What it does |
|---|---|
| `people_lookup` | Search the identity graph. The context a generic assistant structurally cannot reach. |
| `recall` | Search durable facts from previous conversations, any surface. |
| `calendar_read` | Google Calendar over a range. Read-only scope. |
| `morning_brief` | The stored brief. Cache read only — never regenerates, so it never spends budget unasked. |
| `spine_status` | Conversation / message / people / fact counts. |

Two more appear only with `SPINE_MCP_ALLOW_WRITES=1`:

| Tool | What it does |
|---|---|
| `remember` | Store a durable fact. |
| `people_add` | Add a person to the identity graph. |

## Why writes are off by default

The spine's Tier-2 contract is a spoken confirm that fails closed. There is no
voice channel over stdio, and Claude Code's approval prompt is a weaker
substitute — the user can allowlist a tool or run with permissions skipped
entirely. Rather than quietly downgrade Tier 2 to "whatever the harness asks",
writes are simply absent unless someone opts in at launch. The gate is enforced
twice: tier-2 tools are not registered, and `dispatch` refuses them even if one
somehow is.

To enable, edit `.mcp.json`:

```json
"env": { "SPINE_MCP_ALLOW_WRITES": "1" }
```

## What does not change

**The Tier-3 guard runs inside this process, first, on every call**, before the
tool is even resolved. Claude Code's permission system sits above this server
and the user can widen it; this guard cannot be widened from there. Sovereign/
Alta trading, financial transfers, and destructive git on protected branches
stay denied no matter which harness is driving.

The MCP session declares **no repos** and no destructive-git override, so
`run_claude_code` is deliberately not exposed here — coding runs stay on the
spine's own path where the merge/push confirm gate lives.

Every call is written to `agent_log` with tier and outcome, exactly as the
spine's own route does.

## Verification

```bash
bun test mcp/registry.test.ts   # 12 pass — gate, tier-3, reads, transport
bun run mcp/verify.ts           # spawns the real server, speaks real JSON-RPC
bunx tsc --noEmit
```

`verify.ts` is the one that matters: it launches the server as a subprocess,
completes an MCP handshake, and asserts the write gate and the Tier-3 guard
both hold across the wire in both launch modes. It costs nothing to run.
