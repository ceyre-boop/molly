// Brief freshness guard — the open endpoint must not be able to burn budget.
import { describe, test, expect } from "bun:test"

process.env.SPINE_DB_DIR = `/tmp/spine-brief-test-${Date.now()}`

const { shouldRegenerate } = await import("./lib/brief")

describe("brief regeneration guard", () => {
  const now = 1_000_000_000_000
  const fresh = { text: "brief", generatedAt: now - 60_000, tokens: 100 }
  const stale = { text: "brief", generatedAt: now - 7 * 60 * 60 * 1000, tokens: 100 }

  test("no existing brief → regenerate", () => {
    expect(shouldRegenerate(null, now)).toBe(true)
  })
  test("fresh brief → cached, no spend", () => {
    expect(shouldRegenerate(fresh, now)).toBe(false)
  })
  test("stale brief (>6h) → regenerate", () => {
    expect(shouldRegenerate(stale, now)).toBe(true)
  })
  test("force overrides freshness", () => {
    expect(shouldRegenerate(fresh, now, true)).toBe(true)
  })
})
