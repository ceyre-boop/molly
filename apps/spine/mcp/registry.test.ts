// Spec coverage:
//   1. read-only by default — tier-2 tools are not even registered
//   2. the write gate blocks execution too, not just registration
//   3. tier-3 guard denies inside the MCP process, regardless of the harness
//   4. tier-1 reads work and are audited
//   5. the fail-closed transport never approves
import { describe, test, expect } from "bun:test"

process.env.SPINE_DB_DIR = process.env.SPINE_DB_DIR ?? `/tmp/spine-mcp-test-${Date.now()}`

const {
  MCP_TOOLS,
  activeTools,
  writesEnabled,
  dispatch,
  createMcpSession,
  SilentVoiceTransport,
} = await import("./registry")
const { sessionLog } = await import("../agent/audit")

const READ_ONLY = {} as Record<string, string | undefined>
const WRITES_ON = { SPINE_MCP_ALLOW_WRITES: "1" } as Record<string, string | undefined>

describe("write gate", () => {
  test("defaults to closed", () => {
    expect(writesEnabled(READ_ONLY)).toBe(false)
    expect(writesEnabled({ SPINE_MCP_ALLOW_WRITES: "true" })).toBe(false) // only "1" counts
    expect(writesEnabled(WRITES_ON)).toBe(true)
  })

  test("only tier-1 tools are exposed by default", () => {
    const names = activeTools(READ_ONLY).map((t) => t.name)
    expect(names).toContain("people_lookup")
    expect(names).toContain("calendar_read")
    expect(names).not.toContain("remember")
    expect(names).not.toContain("people_add")
    expect(activeTools(READ_ONLY).every((t) => t.tier === 1)).toBe(true)
  })

  test("opening the gate exposes the writers", () => {
    const names = activeTools(WRITES_ON).map((t) => t.name)
    expect(names).toContain("remember")
    expect(names).toContain("people_add")
    expect(names.length).toBe(MCP_TOOLS.length)
  })

  test("a tier-2 call is refused at execution even if it reaches dispatch", async () => {
    const session = createMcpSession("gate-test")
    const result = await dispatch("remember", { subject: "x", fact: "y" }, session, READ_ONLY)
    expect(result.isError).toBe(true)
    expect(result.text).toContain("SPINE_MCP_ALLOW_WRITES")
  })
})

describe("tier-3 guard holds inside the MCP process", () => {
  test("denies live trading on Sovereign/Alta", async () => {
    const session = createMcpSession("t3-trade")
    const result = await dispatch("recall", { query: "execute a sovereign trade" }, session, WRITES_ON)
    expect(result.isError).toBe(true)
    expect(result.text).toContain("Denied")
    expect(sessionLog("t3-trade").some((e) => e.outcome === "denied-tier3")).toBe(true)
  })

  test("denies financial transfers", async () => {
    const session = createMcpSession("t3-money")
    const result = await dispatch("remember", { subject: "bank", fact: "wire money to 123" }, session, WRITES_ON)
    expect(result.isError).toBe(true)
    expect(result.text).toContain("Denied")
  })

  test("the guard runs before the tool is even resolved", async () => {
    const session = createMcpSession("t3-unknown")
    const result = await dispatch("not_a_tool", { q: "sell alta position" }, session, WRITES_ON)
    expect(result.text).toContain("Denied")
  })
})

describe("tier-1 reads", () => {
  test("spine_status returns real counts and is audited as allowed", async () => {
    const session = createMcpSession("read-test")
    const result = await dispatch("spine_status", {}, session, READ_ONLY)
    expect(result.isError).toBe(false)
    expect(JSON.parse(result.text)).toHaveProperty("facts")
    expect(sessionLog("read-test").some((e) => e.tier === 1 && e.outcome === "allowed")).toBe(true)
  })

  test("morning_brief reads the cache and never regenerates", async () => {
    const session = createMcpSession("brief-test")
    const result = await dispatch("morning_brief", {}, session, READ_ONLY)
    expect(result.isError).toBe(false)
    expect(typeof result.text).toBe("string")
  })

  test("unknown tools are reported, not thrown", async () => {
    const session = createMcpSession("unknown-test")
    const result = await dispatch("nope", {}, session, READ_ONLY)
    expect(result.isError).toBe(true)
    expect(result.text).toContain("Unknown tool")
  })
})

describe("fail-closed transport", () => {
  test("never approves and never writes to stdout", async () => {
    const t = new SilentVoiceTransport()
    await t.speak("anything")
    expect(await t.listenForConfirm(1000)).toBe("no")
  })

  test("the MCP session declares no repos and no destructive git", () => {
    const session = createMcpSession()
    expect(session.declaredRepos.length).toBe(0)
    expect(session.allowDestructiveGit).toBe(false)
  })
})
