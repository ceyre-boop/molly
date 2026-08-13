// The agent loop — the ONLY paid path in the spine. Everything else runs free.
// Cleanly degrades when no API key / budget $0: the dashboard stays fully usable.
import Anthropic from "@anthropic-ai/sdk"
import { TOOL_DEFS, executeTool } from "./tools"
import { getMessages } from "./memory"

const MODEL = "claude-haiku-4-5"
const MAX_TOOL_ROUNDS = 5

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

export async function chat(convId: string, userMessage: string): Promise<AgentReply> {
  if (!reasoningAvailable()) {
    return {
      text: "Reasoning is offline — the API budget is set to $0. The identity graph, memory, and everything local still work. Raise the budget and I wake up.",
      offline: true,
      toolCalls: [],
    }
  }

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
        tools: TOOL_DEFS as Anthropic.Tool[],
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
        return { text, offline: false, toolCalls, tokens: { input: totalIn, output: totalOut } }
      }

      // Execute requested tools locally, feed results back
      messages.push({ role: "assistant", content: response.content })
      const results: Anthropic.ToolResultBlockParam[] = []
      for (const block of response.content) {
        if (block.type === "tool_use") {
          toolCalls.push(block.name)
          const output = executeTool(block.name, block.input as Record<string, unknown>)
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
