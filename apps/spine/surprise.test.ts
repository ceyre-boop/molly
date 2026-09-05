// Surprise gate + decay. The decision logic is pure and tested without a
// model; the end-to-end cases need Ollama and skip without it.
import { describe, test, expect, beforeAll } from "bun:test"

process.env.SPINE_DB_DIR = `/tmp/spine-surprise-test-${Date.now()}`

const { decide, informativeTokens, preferText, decayFacts, unarchiveFact, touchFact,
        DUPLICATE_THRESHOLD, MERGE_THRESHOLD } = await import("./lib/surprise")
const { addFact, addFactIndexed, listFacts, recallFacts, counts, db } = await import("./lib/memory")
const { embeddingsAvailable } = await import("./lib/embeddings")


// bun runs every test file in one process and lib/memory.ts caches its
// Database, so all files share whichever DB the first import created. Wipe it
// so this file's assertions are about this file's data.
const { resetForTests } = await import("./lib/memory")
beforeAll(() => resetForTests())
const online = await embeddingsAvailable()

describe("decide — pure, no model", () => {
  test("nothing to compare against is always a store", () => {
    expect(decide(undefined, "anything")).toBe("store")
  })

  test("at or above the duplicate threshold, drop", () => {
    expect(decide(DUPLICATE_THRESHOLD, "a", "a")).toBe("drop")
    expect(decide(0.99, "x", "y")).toBe("drop")
  })

  test("below the merge threshold, store", () => {
    expect(decide(MERGE_THRESHOLD - 0.01, "totally new thing", "old")).toBe("store")
  })

  test("a pure restatement in the merge band is dropped", () => {
    expect(decide(0.9,
      "The calculus final for Colin takes place in December",
      "Colin's calculus final is in December")).toBe("drop")
  })

  test("REGRESSION: a refinement carrying a number is never dropped", () => {
    // The bug this replaced: length was the specificity proxy, so this shorter
    // but strictly more specific fact scored as a restatement and the date was
    // silently lost.
    const stored = "The calculus final for Colin takes place in December"
    const refined = "Colin's calculus final is on December 16"
    expect(refined.length).toBeLessThan(stored.length) // shorter, and still news
    expect(decide(0.9, refined, stored)).toBe("merge")
  })

  test("a single stray synonym is not news, two novel tokens are", () => {
    expect(decide(0.9, "Colin's calculus exam is in December", "Colin's calculus final is in December")).toBe("drop")
    expect(decide(0.9, "Colin's calculus final is in Gorman 3202 in December", "Colin's calculus final is in December")).toBe("merge")
  })

  test("thresholds sit either side of the measured paraphrase band", () => {
    // Paraphrases measured 0.906-0.916 against nomic-embed-text.
    expect(MERGE_THRESHOLD).toBeLessThan(0.906)
    expect(DUPLICATE_THRESHOLD).toBeGreaterThan(0.916)
  })
})

describe("token helpers", () => {
  test("stopwords and punctuation do not count as information", () => {
    const t = informativeTokens("The final is on December 16.")
    expect(t.has("december")).toBe(true)
    expect(t.has("16")).toBe(true)
    expect(t.has("the")).toBe(false)
    expect(t.has("is")).toBe(false)
  })

  test("preferText keeps the more specific text, not the longer one", () => {
    const wordy = "The calculus final for Colin takes place in December"
    const specific = "Colin's calculus final is on December 16"
    expect(preferText(wordy, specific)).toBe(specific)
  })
})

describe("end-to-end gate", () => {
  test.if(online)("a paraphrase does not create a second row", async () => {
    const before = counts().facts
    await addFactIndexed("school", "Colin's calculus final is in December", "test")
    await addFactIndexed("school", "The calculus final for Colin takes place in December", "test")
    expect(counts().facts).toBe(before + 1)
  })

  test.if(online)("a refinement updates the row and keeps the detail", async () => {
    await addFactIndexed("school", "Colin's calculus final is on December 16", "test")
    expect(listFacts().some((f) => f.fact.includes("December 16"))).toBe(true)
  })

  test.if(online)("something genuinely new is stored", async () => {
    const before = counts().facts
    const r = await addFactIndexed("trading", "NFP lands on first Fridays", "test")
    expect(r.verdict).toBe("store")
    expect(counts().facts).toBe(before + 1)
  })
})

describe("decay", () => {
  test("archives what nothing has asked for, and archived rows stop surfacing", () => {
    const f = addFact("stale", "A fact nobody ever asks about", "test")
    db.query("UPDATE facts SET ts = ?, last_recalled = NULL WHERE id = ?")
      .run(Date.now() - 200 * 86_400_000, f.id)

    expect(decayFacts(90)).toBeGreaterThan(0)
    expect((db.query("SELECT archived FROM facts WHERE id = ?").get(f.id) as { archived: number }).archived).toBe(1)
    expect(listFacts(500).some((x) => x.id === f.id)).toBe(false)
  })

  test("a recently recalled fact survives the decay pass", () => {
    const f = addFact("live", "A fact that gets asked about", "test")
    db.query("UPDATE facts SET ts = ? WHERE id = ?").run(Date.now() - 200 * 86_400_000, f.id)
    touchFact(f.id) // asked for today
    decayFacts(90)
    expect((db.query("SELECT archived FROM facts WHERE id = ?").get(f.id) as { archived: number }).archived).toBe(0)
  })

  test("archiving is reversible — nothing is deleted", () => {
    const f = addFact("recoverable", "Archived is not gone", "test")
    db.query("UPDATE facts SET ts = ?, last_recalled = NULL WHERE id = ?")
      .run(Date.now() - 200 * 86_400_000, f.id)
    decayFacts(90)
    unarchiveFact(f.id)
    expect(listFacts(500).some((x) => x.id === f.id)).toBe(true)
  })

  test.if(online)("recall marks what it returns as live", async () => {
    const f = addFact("touched", "Recall should stamp this row", "test")
    expect((db.query("SELECT last_recalled FROM facts WHERE id = ?").get(f.id) as { last_recalled: number | null }).last_recalled).toBeNull()
    await recallFacts("Recall should stamp")
    expect((db.query("SELECT last_recalled FROM facts WHERE id = ?").get(f.id) as { last_recalled: number | null }).last_recalled).not.toBeNull()
  })
})
