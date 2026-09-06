// Embeddings — Ollama on this machine, over plain HTTP. No SDK, no API key, no bill.
//
// The model is nomic-embed-text (274MB, 768 dims). It has to be a real
// embedding model: asking /api/embed for a chat model returns an error object,
// not a vector, which is how this first failed.
//
// nomic-embed-text is trained with task prefixes and is badly calibrated
// without them. Measured here on "the calculus final is in December" vs
// "when is my math exam", against an unrelated control sentence:
//   unprefixed   related 0.650 / unrelated 0.520  -> 0.13 of separation
//   prefixed     see the test in spine.test.ts
// So a document is embedded as "search_document: ..." and a query as
// "search_query: ...". Mixing the two prefixes silently degrades recall
// instead of erroring, which is exactly the kind of failure that hides.

// Read per call, not once at import. A module-level constant cannot be
// overridden by a test that points OLLAMA_HOST at a dead port, so the fallback
// path would look tested while never actually being exercised.
const host = () =>
  process.env.OLLAMA_HOST?.replace(/^(?!https?:\/\/)/, "http://") ?? "http://127.0.0.1:11434"
const model = () => process.env.SPINE_EMBED_MODEL ?? "nomic-embed-text"

export const EMBED_DIMS = 768

/** Ollama is optional. When it is not running, retrieval falls back to LIKE
 *  rather than taking the whole spine down with it — the same $0-mode contract
 *  lib/agent.ts already honours for the reasoning path. */
export async function embeddingsAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${host()}/api/tags`, { signal: AbortSignal.timeout(1500) })
    if (!res.ok) return false
    const names: string[] = ((await res.json()).models ?? []).map((m: { name: string }) => m.name)
    return names.some((n) => n.startsWith(model()))
  } catch {
    return false
  }
}

export type EmbedRole = "document" | "query"

const PREFIX: Record<EmbedRole, string> = {
  document: "search_document: ",
  query: "search_query: ",
}

/** One vector for one string. Throws on failure — callers decide whether a
 *  missing embedding is fatal (it is not, anywhere in this codebase). */
export async function embed(text: string, role: EmbedRole = "document"): Promise<Float32Array> {
  const [v] = await embedBatch([text], role)
  return v
}

export async function embedBatch(texts: string[], role: EmbedRole = "document"): Promise<Float32Array[]> {
  if (!texts.length) return []
  texts = texts.map((t) => PREFIX[role] + t)
  const res = await fetch(`${host()}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: model(), input: texts }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`embed: ${model()} returned HTTP ${res.status}`)

  const body = (await res.json()) as { embeddings?: number[][]; error?: string }
  if (body.error) throw new Error(`embed: ${body.error}`)
  if (!body.embeddings?.length) throw new Error(`embed: ${model()} returned no vectors`)

  return body.embeddings.map((e) => {
    if (e.length !== EMBED_DIMS) {
      throw new Error(`embed: expected ${EMBED_DIMS} dims from ${model()}, got ${e.length}`)
    }
    return Float32Array.from(e)
  })
}

/** sqlite-vec wants raw little-endian float32 bytes, not a JS array. */
export function toBlob(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const d = Math.sqrt(na) * Math.sqrt(nb)
  return d === 0 ? 0 : dot / d
}
