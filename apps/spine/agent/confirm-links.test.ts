// Signed confirm links: token-gated resolution, fail-closed timeout, and the
// transport slotting into the same governed pipeline the mock used.
import { describe, test, expect } from "bun:test"

process.env.SPINE_DB_DIR = `/tmp/spine-confirm-test-${Date.now()}`

const { createPending, getPending, resolveConfirm, listOpenConfirms, LinkConfirmTransport, confirmUrl } =
  await import("./confirm-links")
const { createSession, governedExecute } = await import("./permissions")
const { sessionLog } = await import("./audit")

describe("pending confirms", () => {
  test("create → appears in open list with a signed URL", () => {
    const p = createPending("test action one")
    expect(p.status).toBe("pending")
    expect(p.token.length).toBe(32)
    expect(confirmUrl(p)).toContain(`id=${p.id}`)
    expect(confirmUrl(p)).toContain(`t=${p.token}`)
    expect(listOpenConfirms().some((c) => c.id === p.id)).toBe(true)
  })

  test("approve with correct token", () => {
    const p = createPending("approve me")
    expect(resolveConfirm(p.id, p.token, "approve").ok).toBe(true)
    expect(getPending(p.id)?.status).toBe("approved")
  })

  test("wrong token rejected", () => {
    const p = createPending("guarded")
    const r = resolveConfirm(p.id, "not-the-token", "approve")
    expect(r.ok).toBe(false)
    expect(getPending(p.id)?.status).toBe("pending")
  })

  test("double-resolve blocked", () => {
    const p = createPending("once only")
    resolveConfirm(p.id, p.token, "deny")
    const again = resolveConfirm(p.id, p.token, "approve")
    expect(again.ok).toBe(false)
    expect(getPending(p.id)?.status).toBe("denied")
  })

  test("unknown id rejected", () => {
    expect(resolveConfirm(999999, "x", "approve").ok).toBe(false)
  })
})

describe("LinkConfirmTransport in the governed pipeline", () => {
  test("tier-2 executes when the link is approved mid-wait", async () => {
    const transport = new LinkConfirmTransport()
    transport.confirmTimeoutMs = 10_000
    const session = createSession({ id: "link-approve", transport, dryRun: true })

    let executed = false
    const run = governedExecute("people_add", { name: "Linked Larry" }, session, () => {
      executed = true
      return "added"
    })

    // Simulate Colin tapping approve ~1s later
    await new Promise((r) => setTimeout(r, 300))
    const open = listOpenConfirms()
    expect(open.length).toBeGreaterThan(0)
    const p = open[0]
    expect(resolveConfirm(p.id, p.token, "approve").ok).toBe(true)

    const out = await run
    expect(executed).toBe(true)
    expect(out).toBe("added")
    expect(sessionLog("link-approve")[0].outcome).toBe("confirmed-yes")
  }, 15_000)

  test("deny blocks execution", async () => {
    const transport = new LinkConfirmTransport()
    transport.confirmTimeoutMs = 10_000
    const session = createSession({ id: "link-deny", transport, dryRun: true })

    let executed = false
    const run = governedExecute("remember", { subject: "x", fact: "y" }, session, () => {
      executed = true
      return "stored"
    })

    await new Promise((r) => setTimeout(r, 300))
    const p = listOpenConfirms()[0]
    resolveConfirm(p.id, p.token, "deny")

    const out = await run
    expect(executed).toBe(false)
    expect(out).toContain("NOT CONFIRMED")
    expect(sessionLog("link-deny")[0].outcome).toBe("confirmed-no")
  }, 15_000)

  test("no tap in window → timeout, fail closed, row expired", async () => {
    const transport = new LinkConfirmTransport()
    transport.confirmTimeoutMs = 2_500
    const session = createSession({ id: "link-timeout", transport, dryRun: true })

    let executed = false
    const out = await governedExecute("people_add", { name: "Ghost" }, session, () => {
      executed = true
      return "added"
    })

    expect(executed).toBe(false)
    expect(out).toContain("NOT CONFIRMED")
    expect(sessionLog("link-timeout")[0].outcome).toBe("confirm-timeout")
    // The row must be expired so a stray later tap can't approve a dead request
    expect(listOpenConfirms().some((c) => c.description.includes("Ghost"))).toBe(false)
  }, 15_000)
})
