// Calendar connector tests — pure logic + the security invariant that OAuth
// tokens never leak into backups (which are committed to a PUBLIC repo).
import { describe, test, expect } from "bun:test"

process.env.SPINE_DB_DIR = `/tmp/spine-cal-test-${Date.now()}`

const { rangeToWindow, formatEvents } = await import("./lib/calendar-tool")
const { kvSet } = await import("./lib/memory")
const { exportData } = await import("./lib/backup")
const { createSession, classifyTier } = await import("./agent/permissions")
const { MockVoiceTransport } = await import("./agent/voice-transport")

describe("range windows", () => {
  const now = new Date(2026, 7, 16, 14, 30) // Aug 16 2026, 14:30 local

  test("today spans the local calendar day", () => {
    const { min, max, label } = rangeToWindow("today", now)
    expect(label).toBe("today")
    expect(min.getDate()).toBe(16)
    expect(min.getHours()).toBe(0)
    expect(max.getDate()).toBe(17)
  })

  test("tomorrow is one day forward", () => {
    const { min, max } = rangeToWindow("tomorrow", now)
    expect(min.getDate()).toBe(17)
    expect(max.getDate()).toBe(18)
  })

  test("week spans 7 days, unknown range defaults to today", () => {
    const { min, max } = rangeToWindow("week", now)
    expect((max.getTime() - min.getTime()) / 86400000).toBe(7)
    expect(rangeToWindow("nonsense", now).label).toBe("today")
  })
})

describe("event formatting", () => {
  test("empty calendar reads as clear runway", () => {
    expect(formatEvents([], "today")).toContain("Clear runway")
  })

  test("timed and all-day events format compactly", () => {
    const out = formatEvents(
      [
        { summary: "Standup", start: "2026-08-16T09:00:00", end: "2026-08-16T09:30:00", allDay: false },
        { summary: "Ship day", start: "2026-08-16", end: "2026-08-17", allDay: true },
        { summary: "Dentist", start: "2026-08-16T13:00:00", end: "2026-08-16T14:30:00", location: "Main St", allDay: false },
      ],
      "today"
    )
    expect(out).toContain("3 event(s) today")
    expect(out).toContain("9:00 Standup (30m)")
    expect(out).toContain("Ship day (all day)")
    expect(out).toContain("13:00 Dentist (1.5h, Main St)")
  })
})

describe("security — tokens never leave via backup", () => {
  test("secret_* kv keys are excluded from exports", () => {
    kvSet("secret_google_tokens", JSON.stringify({ refresh_token: "SUPER-SECRET" }))
    kvSet("lastVisit", "12345")
    const dump = exportData()
    const keys = dump.kv.map((r) => r.key)
    expect(keys).toContain("lastVisit")
    expect(keys.every((k) => !String(k).startsWith("secret_"))).toBe(true)
    expect(JSON.stringify(dump)).not.toContain("SUPER-SECRET")
  })
})

describe("governance", () => {
  test("calendar_read classifies as Tier 1", () => {
    const session = createSession({ id: "cal-tier", transport: new MockVoiceTransport() })
    expect(classifyTier("calendar_read", { range: "today" }, session)).toBe(1)
  })
})
