/**
 * Molly Console — routing logic.
 *
 * A transcript that opens with "dispatch", "build", or "file" becomes a
 * pipeline issue; everything else goes to Molly's desk inbox. Kept free of
 * DOM/server concerns so it can be unit tested directly.
 */

export const ALLOWED_REPOS = ["outreach-builder", "molly"] as const
export type Repo = (typeof ALLOWED_REPOS)[number]
export const DEFAULT_REPO: Repo = "outreach-builder"

const TRIGGER_RE = /^(dispatch|build|file)\b[:,-]*\s*/i

export type Decision = { kind: "dispatch" } | { kind: "inbox" }

export function classify(text: string): Decision {
  return TRIGGER_RE.test(text.trim()) ? { kind: "dispatch" } : { kind: "inbox" }
}

export function extractIssueTitle(text: string): string {
  const rest = text.trim().replace(TRIGGER_RE, "").trim()
  if (!rest) return "Untitled task (from Molly Console)"
  return rest[0].toUpperCase() + rest.slice(1)
}

export function resolveRepo(choice: unknown): Repo {
  return (ALLOWED_REPOS as readonly string[]).includes(choice as string)
    ? (choice as Repo)
    : DEFAULT_REPO
}
