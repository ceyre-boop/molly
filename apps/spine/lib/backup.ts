// $0 persistence: export the graph/memory as JSON, restore on boot when the
// DB is empty. The backup workflow commits exports into apps/spine/backups/
// (with [skip render] so backups don't trigger deploys), which means every
// real deploy ships the latest backup inside the repo — the redeploy wipe
// restores itself.
import { join } from "path"
import { db } from "./memory"

const BACKUP_PATH = join(import.meta.dir, "..", "backups", "latest.json")

export interface SpineBackup {
  exportedAt: number
  people: Record<string, unknown>[]
  person_events: Record<string, unknown>[]
  facts: Record<string, unknown>[]
  kv: Record<string, unknown>[]
  conversations: Record<string, unknown>[]
  messages: Record<string, unknown>[]
}

export function exportData(): SpineBackup {
  const all = (table: string) => db.query(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]
  return {
    exportedAt: Date.now(),
    people: all("people"),
    person_events: all("person_events"),
    facts: all("facts"),
    kv: all("kv"),
    conversations: all("conversations"),
    messages: all("messages"),
  }
}

function isEmpty(): boolean {
  const n = (sql: string) => (db.query(sql).get() as { n: number }).n
  return n("SELECT COUNT(*) n FROM people") === 0 && n("SELECT COUNT(*) n FROM facts") === 0
}

export function restoreData(backup: SpineBackup): { people: number; facts: number } {
  const insert = (table: string, rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      const cols = Object.keys(row)
      const placeholders = cols.map(() => "?").join(", ")
      db.query(`INSERT OR IGNORE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`).run(
        ...(cols.map((c) => row[c]) as (string | number | null)[])
      )
    }
  }
  insert("people", backup.people)
  insert("person_events", backup.person_events)
  insert("facts", backup.facts)
  insert("kv", backup.kv)
  insert("conversations", backup.conversations)
  insert("messages", backup.messages)
  return { people: backup.people.length, facts: backup.facts.length }
}

/** Boot hook: restore the bundled backup, but only into an empty database. */
export async function restoreOnBootIfEmpty(): Promise<void> {
  if (!isEmpty()) return
  const file = Bun.file(BACKUP_PATH)
  if (!(await file.exists())) {
    console.log("[restore] no bundled backup — starting fresh")
    return
  }
  try {
    const backup = (await file.json()) as SpineBackup
    const { people, facts } = restoreData(backup)
    console.log(
      `[restore] restored ${people} people, ${facts} facts from backup dated ${new Date(backup.exportedAt).toISOString()}`
    )
  } catch (err) {
    console.error("[restore] backup file unreadable — starting fresh:", err)
  }
}
