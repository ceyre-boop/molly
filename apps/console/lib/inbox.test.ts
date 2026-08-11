import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { appendInboxEntry } from "./inbox"

describe("appendInboxEntry", () => {
  test("creates the file with a header on first write", () => {
    const dir = mkdtempSync(join(tmpdir(), "console-inbox-"))
    const path = join(dir, "console-inbox.md")
    try {
      appendInboxEntry("remind me to call the dentist", path)
      const contents = readFileSync(path, "utf8")
      expect(contents).toContain("# Molly's Desk Inbox")
      expect(contents).toContain("remind me to call the dentist")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("appends subsequent entries without duplicating the header", () => {
    const dir = mkdtempSync(join(tmpdir(), "console-inbox-"))
    const path = join(dir, "console-inbox.md")
    try {
      appendInboxEntry("first note", path)
      appendInboxEntry("second note", path)
      const contents = readFileSync(path, "utf8")
      expect(contents.match(/# Molly's Desk Inbox/g)?.length).toBe(1)
      expect(contents).toContain("first note")
      expect(contents).toContain("second note")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
