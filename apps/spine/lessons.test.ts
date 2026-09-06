// The self-correction loop. The pure parts are tested without a model; the
// reflection cases need Ollama and skip without it.
import { describe, test, expect, beforeAll } from "bun:test"

process.env.SPINE_DB_DIR = `/tmp/spine-lessons-test-${Date.now()}`

const { recordLesson, retrieveLessons, composeSystemPrompt, pruneLessons, listLessons,
        lessonsStatus, isGrounded, reflect, learnFromSession, judgeSession,
        LESSON_MIN_SIMILARITY, LESSON_DUPLICATE_THRESHOLD } = await import("./lib/lessons")
const { db, resetForTests } = await import("./lib/memory")
const { embeddingsAvailable } = await import("./lib/embeddings")
const { localModelAvailable } = await import("./lib/local")

beforeAll(() => {
  resetForTests()
  db.run("DELETE FROM lessons")
  try { db.run("DELETE FROM lesson_vectors") } catch { /* not indexed */ }
})

const online = await embeddingsAvailable()
const modelUp = await localModelAvailable()

const LESSONS: [string, string][] = [
  ["verifying a service restarted",
   "Check the running process env with ps, not the command exit code — kickstart does not reread the plist."],
  ["choosing a similarity threshold",
   "Measure the distribution on real data before picking a number; related and unrelated ranges may overlap."],
  ["deleting files from a repo",
   "Grep launchd, crontab and shell rc for references before removing anything."],
]

describe("isGrounded — pure", () => {
  const transcript = "launchctl kickstart restarted the process but did not re-read the plist; " +
    "I claimed success from a command exit code instead of checking the service state"

  test("a lesson about the actual work is grounded", () => {
    expect(isGrounded(
      "Verify configuration changes by checking the actual service state, not just command exit codes.",
      "configuring a service", transcript)).toBe(true)
  })

  test("REGRESSION: a fortune cookie is not", () => {
    // The model volunteered exactly this for the session "what is 2+2 / 4 /
    // thanks", with worth_recording set true.
    expect(isGrounded(
      "Ensure clarity and completeness in responses for better user understanding.",
      "responding to users", "User: what is 2+2\nAssistant: 4.\nUser: thanks")).toBe(false)
  })
})

describe("storage and retrieval", () => {
  test.if(online)("stores lessons and retrieves the applicable one", async () => {
    for (const [t, l] of LESSONS) await recordLesson(t, l)
    expect(lessonsStatus().total).toBe(3)

    const hits = await retrieveLessons("did the launchagent actually pick up my new config?")
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some((h) => h.lesson.includes("plist"))).toBe(true)
  })

  test.if(online)("does not store the same lesson twice", async () => {
    const before = lessonsStatus().total
    expect(await recordLesson(...LESSONS[0])).toBeNull()
    expect(lessonsStatus().total).toBe(before)
  })

  test.if(online)("returns nothing when no lesson applies", async () => {
    expect((await retrieveLessons("what is the capital of Peru")).length).toBe(0)
  })

  test.if(online)("retrieval is what keeps a lesson alive", async () => {
    // Assert the hit count on the row itself. Counting DISTINCT lessons with
    // hits > 0 does not rise when an already-retrieved lesson is retrieved
    // again, which is what made the first version of this test flaky.
    const hits = (id: number) =>
      (db.query("SELECT hits FROM lessons WHERE id = ?").get(id) as { hits: number }).hits
    const [target] = await retrieveLessons("did the launchagent pick up my new config?")
    expect(target).toBeDefined()
    const before = hits(target.id)
    await retrieveLessons("did the launchagent pick up my new config?")
    expect(hits(target.id)).toBe(before + 1)
  })

  test.if(online)("prepends applicable lessons to the system prompt", async () => {
    const out = await composeSystemPrompt("You are Molly.", "I restarted the gateway, is the setting live?")
    expect(out).toContain("You are Molly.")
    expect(out).toContain("got wrong before")
  })

  test.if(online)("leaves the prompt untouched when nothing applies", async () => {
    // An empty "things you got wrong" heading reads as an instruction to
    // invent one.
    expect(await composeSystemPrompt("You are Molly.", "what is the capital of Peru")).toBe("You are Molly.")
  })

  test("thresholds are ordered and documented", () => {
    expect(LESSON_MIN_SIMILARITY).toBeLessThan(LESSON_DUPLICATE_THRESHOLD)
  })
})

describe("pruning", () => {
  test("drops lessons nothing ever retrieved, keeps ones that fired", async () => {
    db.run("DELETE FROM lessons")
    try { db.run("DELETE FROM lesson_vectors") } catch { /* not indexed */ }

    const used = await recordLesson("a lesson that fires", "This one gets retrieved and should survive pruning.")
    const dead = await recordLesson("a lesson that never fires", "This one is never retrieved and should be pruned.")
    const old = Date.now() - 60 * 86_400_000
    db.query("UPDATE lessons SET ts = ?").run(old)
    db.query("UPDATE lessons SET hits = 3 WHERE id = ?").run(used!.id)

    expect(pruneLessons(30)).toBe(1)
    const left = listLessons().map((l) => l.id)
    expect(left).toContain(used!.id)
    expect(left).not.toContain(dead!.id)
  })

  test("a recent unused lesson is given time to prove itself", async () => {
    const fresh = await recordLesson("brand new lesson", "Recorded today and not yet retrieved by anything.")
    expect(pruneLessons(30)).toBe(0)
    expect(listLessons().map((l) => l.id)).toContain(fresh!.id)
  })
})

describe("reflection", () => {
  const failed = `User: point openclaw at the local model
Assistant: I set OLLAMA_KEEP_ALIVE in the plist and ran launchctl kickstart -k. Done, the setting is live.
User: it is not live.
Assistant: ps eww on the running pid shows OLLAMA_KEEP_ALIVE absent. kickstart -k restarts the process but does not re-read the plist; it took bootout + bootstrap. I claimed success from a command exit code instead of checking the effect.`

  test.if(modelUp)("judges a session with a correction as gone wrong", async () => {
    expect(await judgeSession(failed)).toBe(true)
  })

  test.if(modelUp)("extracts a concrete lesson from a real failure", async () => {
    // Deterministic now: reflection runs at temperature 0. Before that this
    // returned a lesson on one run and null on the next for the same input.
    const r = await reflect(failed)
    expect(r).not.toBeNull()
    expect(r!.lesson.length).toBeGreaterThan(10)
    expect(isGrounded(r!.lesson, r!.trigger, failed)).toBe(true)
  }, 60_000)

  test.if(modelUp)("REGRESSION: invents nothing from a session that went fine", async () => {
    // Both of these produced a stored "lesson" before judge and extract were
    // split into separate calls.
    expect(await learnFromSession("User: what is 2+2\nAssistant: 4.\nUser: thanks")).toBeNull()
    expect(await learnFromSession("User: whats on my calendar tomorrow\nAssistant: Nothing scheduled.\nUser: ok")).toBeNull()
  }, 60_000)

  test("returns null rather than throwing when the model is unreachable", async () => {
    const saved = process.env.OLLAMA_HOST
    process.env.OLLAMA_HOST = "http://127.0.0.1:9"
    try {
      expect(await reflect(failed)).toBeNull()
    } finally {
      if (saved === undefined) delete process.env.OLLAMA_HOST
      else process.env.OLLAMA_HOST = saved
    }
  })
})
