// The agent loop — the ONLY paid path in the spine. Everything else runs free.
// Cleanly degrades when no API key / budget $0: the dashboard stays fully usable.
// Every tool call routes through the three-tier permission pipeline
// (agent/permissions.ts): tier-3 guard first, tier-2 voice confirm, tier-1 logged.
import Anthropic from "@anthropic-ai/sdk"
import { TOOL_DEFS, executeTool } from "./tools"
import { getMessages } from "./memory"
import { governedExecute, createSession, type AgentSession } from "../agent/permissions"
import { MockVoiceTransport } from "../agent/voice-transport"
import { RUN_CLAUDE_CODE_DEF, runClaudeCode } from "../agent/claude-code-tool"
import { CALENDAR_READ_DEF, executeCalendarRead } from "./calendar-tool"
import { auditLog } from "../agent/audit"

const MODEL = "claude-haiku-4-5"
const MAX_TOOL_ROUNDS = 5

const ALL_TOOL_DEFS = [...TOOL_DEFS, RUN_CLAUDE_CODE_DEF, CALENDAR_READ_DEF]

// Route a governed call to the right executor.
function dispatchTool(name: string, input: Record<string, unknown>, session: AgentSession): Promise<string> | string {
  if (name === "run_claude_code") return runClaudeCode(input, session)
  if (name === "calendar_read") return executeCalendarRead(input)
  return executeTool(name, input)
}

const SYSTEM = `You are Molly, Colin's personal executive secretary — the spine behind every surface (desktop, Telegram, and soon Halo glasses).
You are NOT a general assistant: you are the layer that knows what device assistants structurally can't — Colin's real identity graph, his stored facts, and (soon) his accounts.
Use your tools to ground answers in real data. If the identity graph or facts are empty, say so honestly and offer to store what you learn.
Voice: economy, not performance. Short sentences. Outcomes, not process. First person. No preamble.`

export interface AgentReply {
  text: string
  offline: boolean
  toolCalls: string[]
  tokens?: { input: number; output: number }
}

export function reasoningAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

export async function chat(convId: string, userMessage: string, session?: AgentSession): Promise<AgentReply> {
  if (!reasoningAvailable()) {
    return {
      text: "Reasoning is offline — the API budget is set to $0. The identity graph, memory, and everything local still work. Raise the budget and I wake up.",
      offline: true,
      toolCalls: [],
    }
  }

  // Default session: dry-run, no declared repos (run_claude_code hard-denied),
  // mock transport scripted to approve routine tier-2 writes (people_add,
  // remember) so web chat keeps working — every approval still logged.
  const sess =
    session ??
    createSession({
      id: convId,
      transport: new MockVoiceTransport(["yes", "yes", "yes", "yes", "yes"]),
      declaredRepos: (process.env.SPINE_DECLARED_REPOS ?? "").split(",").filter(Boolean),
      dryRun: true,
    })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const history = getMessages(convId).map((m) => ({
    role: m.role,
    content: m.content,
  }))
  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: userMessage },
  ]

  const toolCalls: string[] = []
  let totalIn = 0
  let totalOut = 0

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 512,
        system: SYSTEM,
        tools: ALL_TOOL_DEFS as Anthropic.Tool[],
        messages,
      })
      totalIn += response.usage.input_tokens
      totalOut += response.usage.output_tokens

      if (response.stop_reason !== "tool_use") {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim()
        console.log(`[agent] tokens in=${totalIn} out=${totalOut} tools=${toolCalls.length}`)
        auditLog({
          session_id: sess.id,
          tool: "(session)",
          tier: 1,
          outcome: "session-summary",
          tokens: totalIn + totalOut,
          summary: `${toolCalls.length} tool call(s); reply ${text.length} chars`,
        })
        return { text, offline: false, toolCalls, tokens: { input: totalIn, output: totalOut } }
      }

      // Execute requested tools through the governed pipeline, feed results back
      messages.push({ role: "assistant", content: response.content })
      const results: Anthropic.ToolResultBlockParam[] = []
      for (const block of response.content) {
        if (block.type === "tool_use") {
          toolCalls.push(block.name)
          const output = await governedExecute(
            block.name,
            block.input as Record<string, unknown>,
            sess,
            (name, input, s) => dispatchTool(name, input, s)
          )
          results.push({ type: "tool_result", tool_use_id: block.id, content: output })
        }
      }
      messages.push({ role: "user", content: results })
    }
    return {
      text: "I hit my tool-round limit on that one. Try a narrower question.",
      offline: false,
      toolCalls,
      tokens: { input: totalIn, output: totalOut },
    }
  } catch (err) {
    console.error("[agent] reasoning failed:", err)
    return {
      text: "Reasoning is unavailable right now (API error — likely the $0 budget cap). Everything local still works.",
      offline: true,
      toolCalls,
    }
  }
}
