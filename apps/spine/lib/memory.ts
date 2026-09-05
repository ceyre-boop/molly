// Memory — conversations, messages, and facts. bun:sqlite, local file, zero API cost.
import { Database } from "bun:sqlite"
import { join } from "path"
import { mkdirSync } from "fs"

const DB_DIR = process.env.SPINE_DB_DIR ?? join(import.meta.dir, "..", "db")
mkdirSync(DB_DIR, { recursive: true })

// bun:sqlite links macOS's system SQLite, which is compiled with extension
// loading disabled — so lib/vectors.ts cannot load sqlite-vec into this
// connection unless bun is pointed at a SQLite that permits it first. This has
// to happen BEFORE the first Database is constructed, which is why it lives
// here rather than in the module that actually needs it.
//
// Failure is expected and fine: on Linux (the Render deploy) the bundled
// SQLite already allows extensions, and if neither path works the vector index
// simply reports unavailable and recall falls back to LIKE.
for (const candidate of [
  process.env.SPINE_SQLITE_PATH,
  "/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib",
  "/usr/local/opt/sqlite/lib/libsqlite3.dylib",
]) {
  if (!candidate) continue
  try { Database.setCustomSQLite(candidate); break } catch { /* next candidate */ }
}

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

// Added after the fact: a fact now records when it was last retrieved (for the
// decay pass) and whether it has been archived. ALTER is wrapped because it
// throws on a second run and IF NOT EXISTS is not available for columns.
for (const [col, ddl] of [
  ["last_recalled", "ALTER TABLE facts ADD COLUMN last_recalled INTEGER"],
  ["archived", "ALTER TABLE facts ADD COLUMN archived INTEGER NOT NULL DEFAULT 0"],
] as const) {
  const has = (db.query("PRAGMA table_info(facts)").all() as { name: string }[]).some((c) => c.name === col)
  if (!has) db.run(ddl)
}

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
  /** When recall last returned this row. Null until it earns a retrieval. */
  last_recalled: number | null
  /** 1 once the decay pass has retired it. Archived, never deleted. */
  archived: number
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
  return db.query("SELECT * FROM facts WHERE archived = 0 ORDER BY ts DESC LIMIT ?").all(limit) as Fact[]
}

export function searchFacts(term: string, limit = 10): Fact[] {
  const like = `%${term}%`
  return db
    .query("SELECT * FROM facts WHERE archived = 0 AND (subject LIKE ? OR fact LIKE ?) ORDER BY ts DESC LIMIT ?")
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
    facts: c("SELECT COUNT(*) n FROM facts WHERE archived = 0"),
  }
}

// ── Semantic recall ─────────────────────────────────────────────────────────
// addFact stays synchronous so every existing caller and test is untouched.
// Embedding is async, so the indexed write and the hybrid read live here as
// separate async functions rather than being smuggled into addFact.

import { embed, embeddingsAvailable } from "./embeddings"
import { indexFact, nearestFacts, unindexedFactIds, vectorsAvailable } from "./vectors"
import { judge, mergeInto, touchFact, type Verdict } from "./surprise"

export interface StoreResult {
  fact: Fact
  verdict: Verdict
  reason: string
}

/** Store a fact and index it for semantic recall, unless the store already
 *  knows it. The surprise gate decides — see lib/surprise.ts for the measured
 *  thresholds and the refinement trap they exist to avoid.
 *
 *  Indexing failure is logged and swallowed: a fact written but unindexed is
 *  still findable by LIKE, whereas a fact lost to a dead embedding server is
 *  gone. */
export async function addFactIndexed(subject: string, fact: string, source = "chat"): Promise<StoreResult> {
  const decision = await judge(subject, fact)

  if (decision.verdict === "drop" && decision.against) {
    // Not a write, but it IS a retrieval — the fact just proved it is live.
    touchFact(decision.against.id)
    return { fact: decision.against, verdict: "drop", reason: decision.reason }
  }
  if (decision.verdict === "merge" && decision.against) {
    return { fact: await mergeInto(decision.against, fact), verdict: "merge", reason: decision.reason }
  }

  const row = addFact(subject, fact, source)
  try {
    if (vectorsAvailable()) indexFact(row.id, await embed(`${subject}: ${fact}`, "document"))
  } catch (e) {
    console.warn(`[memory] fact ${row.id} stored but not indexed:`, e instanceof Error ? e.message : e)
  }
  return { fact: row, verdict: "store", reason: decision.reason }
}

export interface Recalled extends Fact {
  /** How this row was found. Semantic hits carry a cosine; LIKE hits do not. */
  via: "semantic" | "literal"
  similarity?: number
}

/** Below this cosine a "nearest" neighbour is just the least-unrelated row in
 *  the table, not an answer. kNN always returns k rows, so without a floor an
 *  empty-handed query comes back looking confident.
 *
 *  Measured on nomic-embed-text with task prefixes, six queries against a
 *  five-fact corpus:
 *
 *    genuinely related, top hit   0.624 - 0.780
 *    unrelated,         top hit   0.428 - 0.602   ("what is the capital of Peru")
 *
 *  Those ranges very nearly touch. There is no threshold that cleanly
 *  separates them, and anyone tuning this number should know that rather than
 *  discover it. 0.6 is chosen to favour recall: a marginal fact costs the
 *  reading model a line of context, a missed one costs the answer. The model
 *  is the final filter, not this constant. */
export const MIN_SIMILARITY = 0.6

/** Hybrid recall: vector top-k UNIONed with the existing LIKE search.
 *
 *  The union is the point. Vector search alone quietly loses exact-string
 *  lookups ("MATH-170") that substring match has always got right, and LIKE
 *  alone is why "when is my math exam" returned nothing for a fact about a
 *  calculus final. Literal hits are listed first because when someone types an
 *  exact token they mean it. */
export async function recallFacts(query: string, limit = 10): Promise<Recalled[]> {
  const literal: Recalled[] = searchFacts(query, limit).map((f) => ({ ...f, via: "literal" as const }))
  const seen = new Set(literal.map((f) => f.id))

  if (!vectorsAvailable() || !(await embeddingsAvailable())) return literal

  let semantic: Recalled[] = []
  try {
    const hits = nearestFacts(await embed(query, "query"), limit)
    const byId = new Map(
      (db.query(`SELECT * FROM facts WHERE archived = 0 AND id IN (${hits.map(() => "?").join(",") || "NULL"})`)
        .all(...hits.map((h) => h.factId)) as Fact[]).map((f) => [f.id, f])
    )
    semantic = hits
      .filter((h) => h.similarity >= MIN_SIMILARITY && !seen.has(h.factId) && byId.has(h.factId))
      .map((h) => ({ ...byId.get(h.factId)!, via: "semantic" as const, similarity: h.similarity }))
  } catch (e) {
    console.warn("[memory] semantic recall failed, literal only:", e instanceof Error ? e.message : e)
  }

  const out = [...literal, ...semantic].slice(0, limit)
  for (const f of out) touchFact(f.id) // it was asked for; it is earning its place
  return out
}

/** Embed any facts written before the index existed. Returns how many it did. */
export async function backfillFactVectors(limit = 500): Promise<number> {
  if (!vectorsAvailable() || !(await embeddingsAvailable())) return 0
  const ids = unindexedFactIds(limit)
  let done = 0
  for (const id of ids) {
    const f = db.query("SELECT * FROM facts WHERE id = ?").get(id) as Fact | null
    if (!f) continue
    try { indexFact(f.id, await embed(`${f.subject}: ${f.fact}`, "document")); done++ } catch { /* leave for next run */ }
  }
  return done
}

/** Wipe every table. Tests only.
 *
 *  bun runs all test files in ONE process, and `db` above is a module
 *  singleton — so whichever file imports this module first decides
 *  SPINE_DB_DIR for the entire run, and setting it per file is theatre. That
 *  was harmless while tests only appended rows. It stopped being harmless the
 *  moment the surprise gate made facts interact: one file's "The Halo glasses
 *  arrive this month" started suppressing another file's "Halo arriving this
 *  month" as a duplicate, and three tests failed for reasons that had nothing
 *  to do with the code under test.
 *
 *  Files run sequentially, so a wipe in beforeAll gives real isolation.
 *
 *  Refuses to run against a database outside /tmp — this must never be
 *  reachable from a real spine. */
export function resetForTests(): void {
  const file = db.filename
  if (!file.startsWith("/tmp/") && !file.startsWith("/private/tmp/")) {
    throw new Error(`resetForTests refused: ${file} is not a scratch database`)
  }
  // people/person_events are created by lib/people.ts and fact_vectors by
  // lib/vectors.ts — either may be absent depending on what the test imported.
  for (const t of ["messages", "conversations", "facts", "kv", "person_events", "people", "fact_vectors"]) {
    try { db.run(`DELETE FROM ${t}`) } catch { /* table not created in this run */ }
  }
}
