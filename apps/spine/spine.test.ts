// Spine Phase A tests — memory, people, tools. Pure local, zero network.
import { describe, test, expect, beforeAll } from "bun:test"

// Use a throwaway DB dir for tests
process.env.SPINE_DB_DIR = `/tmp/spine-test-${Date.now()}`

const { addFact, listFacts, searchFacts, ensureConversation, addMessage, getMessages, counts } =
  await import("./lib/memory")
const { addPerson, listPeople, searchPeople, touchPerson, personEvents, peopleCount } =
  await import("./lib/people")
const { TOOL_DEFS, executeTool } = await import("./lib/tools")

describe("memory", () => {
  test("stores and recalls facts", () => {
    addFact("coffee", "Colin takes it black", "test")
    const facts = listFacts()
    expect(facts.length).toBeGreaterThan(0)
    expect(facts[0].fact).toContain("black")
  })

  test("searches facts by term", () => {
    addFact("sovereign", "portfolio rebalanced monthly", "test")
    const hits = searchFacts("portfolio")
    expect(hits.length).toBe(1)
    expect(hits[0].subject).toBe("sovereign")
  })

  test("persists conversation messages in order", () => {
    ensureConversation("t1")
    addMessage("t1", "user", "hello")
    addMessage("t1", "assistant", "hi")
    const msgs = getMessages("t1")
    expect(msgs.length).toBe(2)
    expect(msgs[0].role).toBe("user")
    expect(msgs[1].role).toBe("assistant")
  })

  test("counts reflect writes", () => {
    const c = counts()
    expect(c.facts).toBeGreaterThanOrEqual(2)
    expect(c.messages).toBeGreaterThanOrEqual(2)
    expect(c.conversations).toBeGreaterThanOrEqual(1)
  })
})

describe("people (identity graph)", () => {
  test("adds a person with real name and context", () => {
    const p = addPerson("Marco", "engineer", "TABOOST", "met at standup")
    expect(p.id).toBeGreaterThan(0)
    expect(p.name).toBe("Marco")
    expect(peopleCount()).toBeGreaterThanOrEqual(1)
  })

  test("searches across name, role, org, notes", () => {
    expect(searchPeople("marco").length).toBe(1)
    expect(searchPeople("TABOOST").length).toBe(1)
    expect(searchPeople("standup").length).toBe(1)
    expect(searchPeople("nobody-xyz").length).toBe(0)
  })

  test("touch updates last_seen and logs event", () => {
    const p = listPeople()[0]
    touchPerson(p.id, "mentioned in chat")
    const events = personEvents(p.id)
    expect(events.length).toBeGreaterThanOrEqual(2)
    expect(events[0].event).toBe("mentioned in chat")
  })
})

describe("tools registry", () => {
  test("defs are valid tool schemas", () => {
    expect(TOOL_DEFS.length).toBe(4)
    for (const def of TOOL_DEFS) {
      expect(def.name).toBeTruthy()
      expect(def.input_schema.type).toBe("object")
      expect(def.input_schema.required.length).toBeGreaterThan(0)
    }
  })

  test("people_lookup finds real people", async () => {
    const out = await executeTool("people_lookup", { query: "Marco" })
    expect(out).toContain("Marco")
    expect(out).toContain("TABOOST")
  })

  test("remember + recall round-trip", async () => {
    await executeTool("remember", { subject: "glasses", fact: "Halo arriving this month" })
    const out = await executeTool("recall", { query: "Halo" })
    expect(out).toContain("arriving")
  })

  test("people_add creates a graph entry", async () => {
    const out = await executeTool("people_add", { name: "Ava", role: "analyst" })
    expect(out).toContain("Ava")
    expect(searchPeople("Ava").length).toBe(1)
  })

  test("unknown tool fails gracefully", async () => {
    expect(await executeTool("nope", {})).toContain("Unknown tool")
  })
})
