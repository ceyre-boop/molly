// MCP tool registry for the spine.
//
// This is the "Claude Code as harness" route: Claude Code holds the Max
// subscription and drives the loop, and Molly's spine is exposed to it as an
// MCP server. Anthropic's April 2026 policy excludes third-party harnesses
// from subscription coverage but explicitly still covers Claude Code calling
// third-party MCP servers — which is what this is.
//
// Two governance rules survive the change of harness:
//
//   1. The Tier-3 guard runs inside this process, first and unconditionally,
//      on every call. Claude Code's own permission system sits ABOVE this
//      server and can be widened by the user (allowlists,
//      --dangerously-skip-permissions). This guard cannot.
//
//   2. Writes are off by default. The spine's Tier-2 contract is a spoken
//      confirm that fails closed; there is no voice channel over stdio, and
//      Claude Code's approval prompt is a weaker substitute the user can
//      disable. So tier-2 tools are only registered when SPINE_MCP_ALLOW_WRITES=1
//      is set explicitly at launch — a deliberate act, not a default.

import { z } from "zod"
import { createSession, preToolUseGuard, type AgentSession } from "../agent/permissions"
import type { ConfirmResult, VoiceTransport } from "../agent/voice-transport"
import { auditLog } from "../agent/audit"
import { executeTool } from "../lib/tools"
import { executeCalendarRead } from "../lib/calendar-tool"
import { getBrief } from "../lib/brief"
import { counts } from "../lib/memory"

/**
 * Fail-closed transport for the MCP route. Never approves, never writes to
 * stdout (stdout is the JSON-RPC channel — a stray log corrupts the stream).
 * Tier-2 tools are gated by env flag before they ever reach a confirm, so this
 * exists to keep the session type honest, not to grant anything.
 */
export class SilentVoiceTransport implements VoiceTransport {
  async speak(_text: string): Promise<void> {}
  async listenForConfirm(_timeoutMs: number): Promise<ConfirmResult> {
    return "no"
  }
}

export function writesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.SPINE_MCP_ALLOW_WRITES === "1"
}

export function createMcpSession(id = `mcp-${Date.now()}`): AgentSession {
  return createSession({
    id,
    transport: new SilentVoiceTransport(),
    // No repo is in scope over MCP. Coding runs stay on the spine's own path,
    // where the merge/push confirm gate lives.
    declaredRepos: [],
    allowDestructiveGit: false,
    dryRun: false,
  })
}

export interface McpTool {
  name: string
  tier: 1 | 2
  description: string
  shape: z.ZodRawShape
  run: (input: Record<string, unknown>) => Promise<string> | string
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: "people_lookup",
    tier: 1,
    description:
      "Search Colin's identity graph for a person by name, role, org, or notes. Returns real people with real history — this is the context Noa and generic assistants structurally cannot reach.",
    shape: { query: z.string().describe("Name or keyword to search for") },
    run: (input) => executeTool("people_lookup", input),
  },
  {
    name: "recall",
    tier: 1,
    description: "Search durable facts Molly has stored from previous conversations across every surface.",
    shape: { query: z.string().describe("Keyword to search facts for") },
    run: (input) => executeTool("recall", input),
  },
  {
    name: "calendar_read",
    tier: 1,
    description:
      "Read Colin's Google Calendar over a time range. Read-only scope; pure observation, never writes an event.",
    shape: {
      range: z
        .string()
        .describe("Time range: 'today', 'tomorrow', 'week', or 'next week'"),
    },
    run: (input) => executeCalendarRead(input),
  },
  {
    name: "morning_brief",
    tier: 1,
    description:
      "Return the most recent stored morning brief. Reads the cache only — it never regenerates, so it never spends API budget without being asked.",
    shape: {},
    run: () => {
      const brief = getBrief()
      if (!brief) return "No brief stored yet. Generate one from the spine, not from here."
      const age = Math.round((Date.now() - brief.generatedAt) / 60000)
      return `${brief.text}\n\n(generated ${age} minutes ago)`
    },
  },
  {
    name: "spine_status",
    tier: 1,
    description: "Spine health: how many conversations, messages, people, and facts the identity graph holds.",
    shape: {},
    run: () => {
      const c = counts()
      return JSON.stringify(c)
    },
  },
  {
    name: "remember",
    tier: 2,
    description: "Store a durable fact so future conversations on any surface can recall it.",
    shape: {
      subject: z.string().describe("What the fact is about"),
      fact: z.string().describe("The fact itself"),
    },
    run: (input) => executeTool("remember", input),
  },
  {
    name: "people_add",
    tier: 2,
    description: "Add a person to the identity graph with their real name and context.",
    shape: {
      name: z.string().describe("Person's real name"),
      role: z.string().optional().describe("Their role, e.g. 'engineer'"),
      org: z.string().optional().describe("Organization, e.g. 'TABOOST'"),
      notes: z.string().optional().describe("Any context worth keeping"),
    },
    run: (input) => executeTool("people_add", input),
  },
]

/** Tools actually exposed, given the current write gate. */
export function activeTools(env: Record<string, string | undefined> = process.env): McpTool[] {
  return writesEnabled(env) ? MCP_TOOLS : MCP_TOOLS.filter((t) => t.tier === 1)
}

export interface DispatchResult {
  text: string
  isError: boolean
}

/**
 * Single execution path for every MCP tool call. Tier-3 guard first, always —
 * before the tool is looked up, before any argument is trusted.
 */
export async function dispatch(
  name: string,
  input: Record<string, unknown>,
  session: AgentSession,
  env: Record<string, string | undefined> = process.env
): Promise<DispatchResult> {
  const guard = preToolUseGuard(name, input, session)
  if (guard.denied) {
    auditLog({ session_id: session.id, tool: name, tier: 3, outcome: "denied-tier3", tokens: 0, summary: guard.reason ?? "denied" })
    return { text: `Denied. ${guard.reason}`, isError: true }
  }

  const tool = MCP_TOOLS.find((t) => t.name === name)
  if (!tool) return { text: `Unknown tool: ${name}`, isError: true }

  // Belt and braces: even if a tier-2 tool were registered by mistake, it
  // cannot execute while the write gate is closed.
  if (tool.tier === 2 && !writesEnabled(env)) {
    auditLog({ session_id: session.id, tool: name, tier: 2, outcome: "confirmed-no", tokens: 0, summary: "write gate closed (SPINE_MCP_ALLOW_WRITES unset)" })
    return {
      text: `"${name}" writes to Colin's identity graph and is disabled. Relaunch the MCP server with SPINE_MCP_ALLOW_WRITES=1 to enable it.`,
      isError: true,
    }
  }

  try {
    const text = await tool.run(input)
    auditLog({ session_id: session.id, tool: name, tier: tool.tier, outcome: tool.tier === 1 ? "allowed" : "confirmed-yes", tokens: 0, summary: text.slice(0, 120) })
    return { text, isError: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    auditLog({ session_id: session.id, tool: name, tier: tool.tier, outcome: "allowed", tokens: 0, summary: `error: ${message}` })
    return { text: `${name} failed: ${message}`, isError: true }
  }
}
