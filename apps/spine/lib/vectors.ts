// Vector index — sqlite-vec loaded into the SAME connection lib/memory.ts owns.
//
// Two things make this fragile enough to be worth spelling out:
//
//   1. bun:sqlite on macOS links the system SQLite, which is built with
//      extension loading DISABLED. Loading vec0 requires pointing bun at a
//      SQLite that allows it (Homebrew's), and Database.setCustomSQLite() has
//      to run BEFORE the first Database is constructed — which is why the call
//      lives at the top of lib/memory.ts, not here.
//   2. None of that exists on the Render deploy. So every function here is
//      allowed to report "unavailable" and every caller falls back to the LIKE
//      search that has always worked. A missing vector index degrades recall;
//      it must never take the spine down.

import { db } from "./memory"
import { EMBED_DIMS, toBlob } from "./embeddings"

const EXT_CANDIDATES = [
  new URL("../node_modules/sqlite-vec-darwin-arm64/vec0", import.meta.url).pathname,
  new URL("../node_modules/sqlite-vec-linux-x64/vec0", import.meta.url).pathname,
]

let ready: boolean | null = null
let reason = ""

export function vectorsAvailable(): boolean {
  if (ready !== null) return ready
  try {
    let loaded = false
    for (const path of EXT_CANDIDATES) {
      try { db.loadExtension(path); loaded = true; break } catch { /* try the next platform */ }
    }
    if (!loaded) throw new Error("no vec0 extension for this platform")

    db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS fact_vectors USING vec0(
      fact_id INTEGER PRIMARY KEY,
      embedding FLOAT[${EMBED_DIMS}]
    )`)
    ready = true
  } catch (e) {
    reason = e instanceof Error ? e.message : String(e)
    ready = false
  }
  return ready
}

export function vectorsStatus(): { available: boolean; reason: string; indexed: number } {
  const available = vectorsAvailable()
  return {
    available,
    reason: available ? "" : reason,
    indexed: available ? (db.query("SELECT COUNT(*) n FROM fact_vectors").get() as { n: number }).n : 0,
  }
}

export function indexFact(factId: number, embedding: Float32Array): void {
  if (!vectorsAvailable()) return
  // vec0 has no UPSERT; delete-then-insert keeps re-indexing idempotent.
  db.query("DELETE FROM fact_vectors WHERE fact_id = ?").run(factId)
  db.query("INSERT INTO fact_vectors (fact_id, embedding) VALUES (?, ?)").run(factId, toBlob(embedding))
}

export function unindexFact(factId: number): void {
  if (!vectorsAvailable()) return
  db.query("DELETE FROM fact_vectors WHERE fact_id = ?").run(factId)
}

export interface Neighbour { factId: number; distance: number; similarity: number }

/** k nearest facts. `distance` is sqlite-vec's L2 over unnormalised vectors;
 *  `similarity` is the cosine the callers actually reason about. */
export function nearestFacts(embedding: Float32Array, k = 5): Neighbour[] {
  if (!vectorsAvailable()) return []
  const rows = db
    .query(`SELECT fact_id, distance, vec_distance_cosine(embedding, ?1) AS cos
            FROM fact_vectors WHERE embedding MATCH ?1 AND k = ?2 ORDER BY distance`)
    .all(toBlob(embedding), k) as { fact_id: number; distance: number; cos: number }[]
  return rows.map((r) => ({ factId: r.fact_id, distance: r.distance, similarity: 1 - r.cos }))
}

/** Facts that have no vector yet — the backfill worklist. */
export function unindexedFactIds(limit = 500): number[] {
  if (!vectorsAvailable()) return []
  const rows = db
    .query(`SELECT f.id FROM facts f
            LEFT JOIN fact_vectors v ON v.fact_id = f.id
            WHERE v.fact_id IS NULL ORDER BY f.id LIMIT ?`)
    .all(limit) as { id: number }[]
  return rows.map((r) => r.id)
}
