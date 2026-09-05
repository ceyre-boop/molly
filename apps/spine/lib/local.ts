// The local model — Ollama on this machine, native API.
//
// lib/agent.ts is the paid reasoning path and honestly reports itself offline
// without ANTHROPIC_API_KEY. This is the free one. It exists so the reflection
// loop in lib/lessons.ts can run after EVERY session instead of being rationed
// against a budget — a self-critique that only runs when there is money for it
// is not a self-critique.
//
// Deliberately NOT /v1: Ollama's OpenAI-compatible endpoint breaks tool calling
// and can emit raw tool-call JSON as prose. Native /api/chat only.

const host = () =>
  process.env.OLLAMA_HOST?.replace(/^(?!https?:\/\/)/, "http://") ?? "http://127.0.0.1:11434"
const model = () => process.env.SPINE_LOCAL_MODEL ?? "qwen3:8b"

export async function localModelAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${host()}/api/tags`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return false
    const names: string[] = ((await res.json()).models ?? []).map((m: { name: string }) => m.name)
    return names.includes(model())
  } catch {
    return false
  }
}

export interface LocalChatOptions {
  system?: string
  /** Ask for a JSON object back. Ollama constrains the grammar, so this is far
   *  more reliable than asking politely in the prompt — but a model's word is
   *  still not a contract, so callers must validate the shape. */
  json?: boolean
  maxTokens?: number
  timeoutMs?: number
  /** 0 for classification and extraction. The default sampling temperature
   *  made reflect() return a lesson on one run and null on the next for the
   *  same transcript, which is a flaky feature, not just a flaky test. */
  temperature?: number
}

export async function localChat(prompt: string, opts: LocalChatOptions = {}): Promise<string> {
  const messages = [
    ...(opts.system ? [{ role: "system", content: opts.system }] : []),
    { role: "user", content: prompt },
  ]
  const res = await fetch(`${host()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model(),
      messages,
      stream: false,
      // qwen3 is a hybrid reasoning model and thinks by default: measured 108
      // generated tokens versus 7 for the same one-line answer. Reflection does
      // not need it and the loop runs after every session.
      think: false,
      ...(opts.json ? { format: "json" } : {}),
      options: { num_predict: opts.maxTokens ?? 300, temperature: opts.temperature ?? 0.7 },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  })
  if (!res.ok) throw new Error(`localChat: ${model()} returned HTTP ${res.status}`)
  const body = (await res.json()) as { message?: { content?: string }; error?: string }
  if (body.error) throw new Error(`localChat: ${body.error}`)
  return body.message?.content?.trim() ?? ""
}
