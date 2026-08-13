// Memory — conversations, messages, and facts. bun:sqlite, local file, zero API cost.
import { Database } from "bun:sqlite"
import { join } from "path"
import { mkdirSync } from "fs"

const DB_DIR = process.env.SPINE_DB_DIR ?? join(import.meta.dir, "..", "db")
mkdirSync(DB_DIR, { recursive: true })

export const db = new Database(join(DB_DIR, "spine.sqlite"))

db.run(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL,
    surface TEXT NOT NULL DEFAULT 'web'
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conv_id TEXT NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content TEXT NOT NULL,
    ts INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL,
    fact TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'chat',
    ts INTEGER NOT NULL
  );
`)

export interface Message {
  role: "user" | "assistant"
  content: string
  ts: number
}

export interface Fact {
  id: number
  subject: string
  fact: string
  source: string
  ts: number
}

export function ensureConversation(id: string, surface = "web"): void {
  db.query(
    "INSERT OR IGNORE INTO conversations (id, started_at, surface) VALUES (?, ?, ?)"
  ).run(id, Date.now(), surface)
}

export function addMessage(convId: string, role: "user" | "assistant", content: string): void {
  db.query(
    "INSERT INTO messages (conv_id, role, content, ts) VALUES (?, ?, ?, ?)"
  ).run(convId, role, content, Date.now())
}

export function getMessages(convId: string, limit = 40): Message[] {
  const rows = db
    .query(
      "SELECT role, content, ts FROM messages WHERE conv_id = ? ORDER BY id DESC LIMIT ?"
    )
    .all(convId, limit) as Message[]
  return rows.reverse()
}

export function addFact(subject: string, fact: string, source = "chat"): Fact {
  const result = db
    .query("INSERT INTO facts (subject, fact, source, ts) VALUES (?, ?, ?, ?) RETURNING *")
    .get(subject, fact, source, Date.now()) as Fact
  return result
}

export function listFacts(limit = 20): Fact[] {
  return db.query("SELECT * FROM facts ORDER BY ts DESC LIMIT ?").all(limit) as Fact[]
}

export function searchFacts(term: string, limit = 10): Fact[] {
  const like = `%${term}%`
  return db
    .query("SELECT * FROM facts WHERE subject LIKE ? OR fact LIKE ? ORDER BY ts DESC LIMIT ?")
    .all(like, like, limit) as Fact[]
}

// Tiny KV store — survives free-tier sleep (in the sqlite file), used for lastVisit etc.
db.run("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)")

export function kvSet(key: string, value: string): void {
  db.query("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value)
}

export function kvGet(key: string): string | null {
  const row = db.query("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | null
  return row?.value ?? null
}

export function counts(): { conversations: number; messages: number; facts: number } {
  const c = (sql: string) => (db.query(sql).get() as { n: number }).n
  return {
    conversations: c("SELECT COUNT(*) n FROM conversations"),
    messages: c("SELECT COUNT(*) n FROM messages"),
    facts: c("SELECT COUNT(*) n FROM facts"),
  }
}
