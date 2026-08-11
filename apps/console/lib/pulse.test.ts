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
    // Point at a guaranteed-dead port — hitting real Pulse (31337) makes this
    // test environment-dependent and speaks out loud on the host machine.
    const ok = await sendPulse("test message", "http://127.0.0.1:1/notify")
    expect(ok).toBe(false)
  })
})
