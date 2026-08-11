import { describe, expect, test } from "bun:test"
import { buildPulsePayload, sendPulse } from "./pulse"

describe("buildPulsePayload", () => {
  test("wraps the message with voice enabled", () => {
    expect(buildPulsePayload("Filed on outreach-builder: Add CSV export")).toEqual({
      message: "Filed on outreach-builder: Add CSV export",
      voice_enabled: true,
    })
  })

  test("passes the message through verbatim", () => {
    expect(buildPulsePayload("Got it — noted on your desk.").message).toBe("Got it — noted on your desk.")
  })
})

describe("sendPulse", () => {
  test("resolves false instead of throwing when Pulse is unreachable", async () => {
    const ok = await sendPulse("test message")
    expect(ok).toBe(false)
  })
})
