import { describe, expect, test } from "bun:test"
import { INBOX_ACK, dispatchAck, dispatchFailure } from "./replies"

describe("replies", () => {
  test("dispatch ack names the repo and the title", () => {
    expect(dispatchAck("molly", "Add CSV export")).toBe("Filed on molly: Add CSV export")
  })

  test("inbox ack is an acknowledgment, not a promise of a reply", () => {
    expect(INBOX_ACK).toBe("Noted on your desk.")
  })

  test("dispatch failure carries the error", () => {
    expect(dispatchFailure("label not found")).toBe("Couldn't file that issue: label not found")
  })
})
