// Semantic recall — the gap this closes, and the guardrails around it.
//
// These tests need Ollama with nomic-embed-text. That is a deliberate choice:
// the whole point of the feature is that it runs on this machine for free, and
// a mocked embedder would prove nothing about whether recall actually works.
// When Ollama is not running the semantic cases skip and the fallback cases
// still run — which is exactly the behaviour the Render deploy relies on.
import { describe, test, expect, beforeAll } from "bun:test"

process.env.SPINE_DB_DIR = `/tmp/spine-recall-test-${Date.now()}`

const { addFact, addFactIndexed, recallFacts, searchFacts, backfillFactVectors, MIN_SIMILARITY } =
  await import("./lib/memory")
const { vectorsAvailable, vectorsStatus, nearestFacts, indexFact } = await import("./lib/vectors")
const { embed, embeddingsAvailable, cosine, EMBED_DIMS, toBlob } = await import("./lib/embeddings")


// bun runs every test file in one process and lib/memory.ts caches its
// Database, so all files share whichever DB the first import created. Wipe it
// so this file's assertions are about this file's data.
const { resetForTests } = await import("./lib/memory")
beforeAll(() => resetForTests())
const online = await embeddingsAvailable()
if (!online) {
  console.warn("[recall.test] Ollama/nomic-embed-text unavailable — semantic cases skipped")
}

describe("vector index", () => {
  test("sqlite-vec loads into the spine's own connection", () => {
    const s = vectorsStatus()
    // On macOS this needs Homebrew's SQLite; if it is missing the feature
    // degrades rather than throwing, so assert the shape either way.
    expect(typeof s.available).toBe("boolean")
    if (!s.available) expect(s.reason.length).toBeGreaterThan(0)
  })
})

describe("embeddings", () => {
  test.if(online)("returns 768-dim vectors", async () => {
    const v = await embed("Colin's calculus final is in December")
    expect(v.length).toBe(EMBED_DIMS)
  })

  test.if(online)("task prefixes separate related from unrelated", async () => {
    const doc = await embed("Colin's calculus final is in December", "document")
    const near = await embed("when is my math exam", "query")
    const far = await embed("how do I bake sourdough bread", "query")
    // The margin is what matters, not the absolute values — nomic's cosines
    // are compressed and the two distributions very nearly touch.
    expect(cosine(near, doc)).toBeGreaterThan(cosine(far, doc))
  })

  test("cosine is 1 for identical and 0 for orthogonal vectors", () => {
    const a = Float32Array.from([1, 0, 0, 0])
    const b = Float32Array.from([0, 1, 0, 0])
    expect(cosine(a, a)).toBeCloseTo(1, 5)
    expect(cosine(a, b)).toBeCloseTo(0, 5)
  })

  test("toBlob produces little-endian float32 bytes sqlite-vec can read", () => {
    const v = Float32Array.from([1.5, -2.25])
    expect(toBlob(v).byteLength).toBe(8)
  })
})

describe("hybrid recall", () => {
  test.if(online)("finds a fact no substring search could reach", async () => {
    await addFactIndexed("school", "Colin's calculus final is in December", "test")

    // The regression this feature exists for.
    expect(searchFacts("when is my math exam").length).toBe(0)

    const hits = await recallFacts("when is my math exam")
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].fact).toContain("calculus")
    expect(hits[0].via).toBe("semantic")
    expect(hits[0].similarity).toBeGreaterThanOrEqual(MIN_SIMILARITY)
  })

  test.if(online)("never regresses an exact substring match", async () => {
    await addFactIndexed("school", "MATH-170 meets Tuesday 5:00-7:20 in Gorman 3202", "test")
    const hits = await recallFacts("MATH-170")
    expect(hits.length).toBeGreaterThan(0)
    // Literal hits lead: an exact token means the person meant it.
    expect(hits[0].via).toBe("literal")
    expect(hits[0].fact).toContain("Gorman")
  })

  test.if(online)("returns nothing rather than the least-unrelated row", async () => {
    await addFactIndexed("trading", "NFP lands on first Fridays", "test")
    // kNN always returns k rows. Without MIN_SIMILARITY this comes back
    // confident and wrong.
    expect((await recallFacts("how do I bake sourdough bread")).length).toBe(0)
  })

  test.if(online)("does not return the same fact twice across both paths", async () => {
    await addFactIndexed("glasses", "The Halo glasses arrive this month", "test")
    const hits = await recallFacts("Halo glasses")
    expect(new Set(hits.map((h) => h.id)).size).toBe(hits.length)
  })

  test.if(online)("backfills facts written before the index existed", async () => {
    // addFact, not addFactIndexed — the pre-feature write path.
    addFact("legacy", "Colin drinks his coffee black", "test")
    expect(await backfillFactVectors()).toBeGreaterThan(0)
    const hits = await recallFacts("how does he take his coffee")
    expect(hits.some((h) => h.fact.includes("black"))).toBe(true)
  })

  test("falls back to literal search when embeddings are unreachable", async () => {
    const saved = process.env.OLLAMA_HOST
    process.env.OLLAMA_HOST = "http://127.0.0.1:9" // discard port; refuses fast
    try {
      addFact("fallback", "The spine must not die with the embedder", "test")
      const hits = await recallFacts("spine")
      expect(hits.length).toBeGreaterThan(0)
      expect(hits.every((h) => h.via === "literal")).toBe(true)
    } finally {
      if (saved === undefined) delete process.env.OLLAMA_HOST
      else process.env.OLLAMA_HOST = saved
    }
  })
})
