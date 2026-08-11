/**
 * Molly Console — desk inbox.
 *
 * Anything that isn't dispatched becomes a timestamped line in
 * logs/console-inbox.md (gitignored — this is a runtime log, not a
 * committed artifact).
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "fs"
import { dirname, join } from "path"

export const DEFAULT_INBOX_PATH = join(import.meta.dir, "..", "..", "..", "logs", "console-inbox.md")

export function appendInboxEntry(text: string, path: string = DEFAULT_INBOX_PATH): void {
  mkdirSync(dirname(path), { recursive: true })
  if (!existsSync(path)) writeFileSync(path, "# Molly's Desk Inbox\n\n")
  appendFileSync(path, `- **${new Date().toISOString()}** — ${text}\n`)
}
