// Three-tier authority tests.
// Spec coverage:
//   1. auto-allow passes with ZERO prompts, still logged
//   2. tier-2 blocks until mock-confirm returns (no → executor never runs)
//   3. tier-3 denied even when a fake always-yes canUseTool would approve
import { describe, test, expect } from "bun:test"

process.env.SPINE_DB_DIR = process.env.SPINE_DB_DIR ?? `/tmp/spine-perm-test-${Date.now()}`

const { createSession, governedExecute, preToolUseGuard, classifyTier } = await import("./permissions")
const { MockVoiceTransport } = await import("./voice-transport")
const { sessionLog } = await import("./audit")
const { runClaudeCode } = await import("./claude-code-tool")

let sessionCounter = 0
function freshSession(opts: Partial<Parameters<typeof createSession>[0]> = {}) {
  const transport = (opts.transport as InstanceType<typeof MockVoiceTransport>) ?? new MockVoiceTransport()
  return createSession({
    id: `test-${++sessionCounter}`,
    transport,
    declaredRepos: opts.declaredRepos ?? [],
    allowDestructiveGit: opts.allowDestructiveGit ?? false,
    dryRun: true,
  })
}

describe("tier 1 — auto-allow", () => {
  test("passes with zero prompts and is logged", async () => {
    const transport = new MockVoiceTransport()
    const session = freshSession({ transport })
    let executed = false

    const out = await governedExecute("people_lookup", { query: "Marco" }, session, () => {
      executed = true
      return "found"
    })

    expect(executed).toBe(true)
    expect(out).toBe("found")
    expect(transport.spoken.length).toBe(0) // zero prompts

    const log = sessionLog(session.id)
    expect(log.length).toBe(1)
    expect(log[0].tier).toBe(1)
    expect(log[0].outcome).toBe("allowed")
  })
})

describe("tier 2 — confirm-required", () => {
  test("blocks until mock-confirm returns yes", async () => {
    const transport = new MockVoiceTransport(["yes"])
    const session = freshSession({ transport })
    let executed = false

    const out = await governedExecute("people_add", { name: "Ava" }, session, () => {
      executed = true
      return "added"
    })

    expect(transport.spoken.length).toBe(1) // it asked
    expect(executed).toBe(true)
    expect(out).toBe("added")
    expect(sessionLog(session.id)[0].outcome).toBe("confirmed-yes")
  })

  test("no means the executor never runs", async () => {
    const transport = new MockVoiceTransport(["no"])
    const session = freshSession({ transport })
    let executed = false

    const out = await governedExecute("remember", { subject: "x", fact: "y" }, session, () => {
      executed = true
      return "stored"
    })

    expect(executed).toBe(false)
    expect(out).toContain("NOT CONFIRMED")
    expect(sessionLog(session.id)[0].outcome).toBe("confirmed-no")
  })

  test("empty script fails closed (default no)", async () => {
    const transport = new MockVoiceTransport() // no scripted answers
    const session = freshSession({ transport })
    let executed = false

    await governedExecute("people_add", { name: "Zed" }, session, () => {
      executed = true
      return "added"
    })
    expect(executed).toBe(false)
  })
})

describe("tier 3 — hard deny, guard-enforced", () => {
  test("denied even when the confirm transport would say yes to everything", async () => {
    // Fake "canUseTool approves everything" — transport scripted all-yes.
    const transport = new MockVoiceTransport(["yes", "yes", "yes"])
    const session = freshSession({ transport, declaredRepos: ["ceyre-boop/molly"] })
    let executed = false

    const out = await governedExecute(
      "run_claude_code",
      { task: "refactor", repo: "ceyre-boop/quant" }, // NOT in declared scope
      session,
      () => {
        executed = true
        return "ran"
      }
    )

    expect(executed).toBe(false)
    expect(out).toContain("DENIED")
    expect(transport.spoken.length).toBe(0) // never even asked — guard fired first
    const log = sessionLog(session.id)
    expect(log[0].tier).toBe(3)
    expect(log[0].outcome).toBe("denied-tier3")
  })

  test("sovereign/alta trading language is denied regardless of tool", async () => {
    const session = freshSession({ transport: new MockVoiceTransport(["yes"]) })
    let executed = false
    const out = await governedExecute(
      "remember",
      { subject: "orders", fact: "execute the sovereign trading order at open" },
      session,
      () => {
        executed = true
        return "stored"
      }
    )
    expect(executed).toBe(false)
    expect(out).toContain("DENIED")
  })

  test("financial transfer language is denied", () => {
    const session = freshSession({})
    const guard = preToolUseGuard("some_tool", { note: "wire $500 and link the account" }, session)
    expect(guard.denied).toBe(true)
  })

  test("destructive git on protected branch denied without session-start override", () => {
    const session = freshSession({})
    const guard = preToolUseGuard("run_claude_code", { task: "git push --force origin main", repo: "x" }, session)
    expect(guard.denied).toBe(true)

    const overridden = freshSession({ allowDestructiveGit: true, declaredRepos: ["x"] })
    const guard2 = preToolUseGuard("run_claude_code", { task: "git push --force origin main", repo: "x" }, overridden)
    expect(guard2.denied).toBe(false)
  })

  test("run_claude_code without a repo is denied", () => {
    const session = freshSession({ declaredRepos: ["ceyre-boop/molly"] })
    expect(preToolUseGuard("run_claude_code", { task: "do things" }, session).denied).toBe(true)
  })

  test("session scope is frozen — cannot be widened mid-session", () => {
    const session = freshSession({ declaredRepos: ["ceyre-boop/molly"] })
    expect(() => {
      ;(session.declaredRepos as string[]).push("ceyre-boop/quant")
    }).toThrow()
    expect(() => {
      ;(session as { allowDestructiveGit: boolean }).allowDestructiveGit = true
    }).toThrow()
  })
})

describe("run_claude_code — merge/push gate", () => {
  test("dry-run without push never prompts", async () => {
    const transport = new MockVoiceTransport()
    const session = freshSession({ transport, declaredRepos: ["ceyre-boop/molly"] })
    const out = await runClaudeCode({ task: "tidy docs", repo: "ceyre-boop/molly" }, session)
    expect(out).toContain("dry-run")
    expect(out).toContain("unpushed")
    expect(transport.spoken.length).toBe(0)
  })

  test("push step requires its own confirm even when the run was allowed", async () => {
    const transport = new MockVoiceTransport(["no"])
    const session = freshSession({ transport, declaredRepos: ["ceyre-boop/molly"] })
    const out = await runClaudeCode({ task: "tidy docs", repo: "ceyre-boop/molly", push: "true" }, session)
    expect(transport.spoken.length).toBe(1) // the merge/push confirm
    expect(out).toContain("NOT approved")
  })
})

describe("classification", () => {
  test("tiers assign as specified", () => {
    const session = freshSession({ declaredRepos: ["r"] })
    expect(classifyTier("people_lookup", {}, session)).toBe(1)
    expect(classifyTier("recall", {}, session)).toBe(1)
    expect(classifyTier("people_add", {}, session)).toBe(2)
    expect(classifyTier("remember", { subject: "a", fact: "b" }, session)).toBe(2)
    expect(classifyTier("run_claude_code", { repo: "other" }, session)).toBe(3)
  })
})
