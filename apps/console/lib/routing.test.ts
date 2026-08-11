import { describe, expect, test } from "bun:test"
import { classify, extractIssueTitle, resolveRepo } from "./routing"

describe("classify", () => {
  test("dispatches on a leading dispatch/build/file", () => {
    expect(classify("dispatch the new login page").kind).toBe("dispatch")
    expect(classify("Build a CSV exporter").kind).toBe("dispatch")
    expect(classify("file a bug about the header").kind).toBe("dispatch")
    expect(classify("FILE: the header is broken").kind).toBe("dispatch")
  })

  test("everything else goes to the inbox", () => {
    expect(classify("remind me to call the dentist").kind).toBe("inbox")
    expect(classify("what's on my calendar today").kind).toBe("inbox")
    expect(classify("").kind).toBe("inbox")
  })

  test("only matches a leading trigger word, not one buried in the sentence", () => {
    expect(classify("please build the report").kind).toBe("inbox")
    expect(classify("I need to file my taxes").kind).toBe("inbox")
  })
})

describe("extractIssueTitle", () => {
  test("strips the trigger word and capitalizes the remainder", () => {
    expect(extractIssueTitle("dispatch add csv export to filters")).toBe("Add csv export to filters")
    expect(extractIssueTitle("build a dark mode toggle")).toBe("A dark mode toggle")
    expect(extractIssueTitle("file: the header is broken on mobile")).toBe("The header is broken on mobile")
    expect(extractIssueTitle("file, the header is broken on mobile")).toBe("The header is broken on mobile")
  })

  test("falls back to a placeholder when nothing follows the trigger", () => {
    expect(extractIssueTitle("dispatch")).toBe("Untitled task (from Molly Console)")
    expect(extractIssueTitle("   ")).toBe("Untitled task (from Molly Console)")
  })

  test("leaves non-triggered text untouched aside from capitalization", () => {
    expect(extractIssueTitle("remind me to call the dentist")).toBe("Remind me to call the dentist")
  })
})

describe("resolveRepo", () => {
  test("accepts an allowed repo choice", () => {
    expect(resolveRepo("molly")).toBe("molly")
    expect(resolveRepo("outreach-builder")).toBe("outreach-builder")
  })

  test("falls back to the default for anything else", () => {
    expect(resolveRepo("some-other-repo")).toBe("outreach-builder")
    expect(resolveRepo(undefined)).toBe("outreach-builder")
    expect(resolveRepo(42)).toBe("outreach-builder")
  })
})
