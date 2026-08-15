// Backup round-trip: export a populated DB, restore into the same schema,
// verify nothing is lost and non-empty DBs are never clobbered.
import { describe, test, expect } from "bun:test"

process.env.SPINE_DB_DIR = `/tmp/spine-backup-test-${Date.now()}`

const { addFact, listFacts } = await import("./lib/memory")
const { addPerson, listPeople, searchPeople } = await import("./lib/people")
const { exportData, restoreData } = await import("./lib/backup")

describe("backup", () => {
  test("export captures people and facts", () => {
    addPerson("Backup Bella", "probe", "Spine QA", "round-trip test")
    addFact("backup", "round-trip works", "test")
    const dump = exportData()
    expect(dump.exportedAt).toBeGreaterThan(0)
    expect(dump.people.length).toBeGreaterThanOrEqual(1)
    expect(dump.facts.length).toBeGreaterThanOrEqual(1)
    expect(dump.people.some((p) => p.name === "Backup Bella")).toBe(true)
  })

  test("restore is idempotent — INSERT OR IGNORE never duplicates", () => {
    const before = listPeople().length
    const dump = exportData()
    restoreData(dump) // restoring into the SAME db — every row already exists
    expect(listPeople().length).toBe(before)
    expect(searchPeople("Backup Bella").length).toBe(1)
  })

  test("restore fills missing rows", () => {
    const dump = exportData()
    // simulate a lost row
    const { db } = require("./lib/memory")
    db.query("DELETE FROM facts WHERE subject = 'backup'").run()
    expect(listFacts().every((f) => f.subject !== "backup")).toBe(true)

    restoreData(dump)
    expect(listFacts().some((f) => f.subject === "backup")).toBe(true)
  })
})
