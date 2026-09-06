#!/usr/bin/env bun
// Spine maintenance — the passes that keep memory from becoming landfill.
//
// Without an entry point, decayFacts() and pruneLessons() are library
// functions nothing ever calls, which is the same as not having written them.
//
//   bun run maintenance.ts            report only, changes nothing
//   bun run maintenance.ts --apply    archive stale facts, prune dead lessons
//   bun run maintenance.ts --backfill embed facts written before the index
//
// Nothing here deletes a fact. Decay archives, and archived is reversible.

import { counts, backfillFactVectors } from "./lib/memory"
import { decayFacts, DEFAULT_DECAY_DAYS } from "./lib/surprise"
import { pruneLessons, lessonsStatus } from "./lib/lessons"
import { vectorsStatus } from "./lib/vectors"
import { db } from "./lib/memory"

const apply = Bun.argv.includes("--apply")
const backfill = Bun.argv.includes("--backfill")

const c = counts()
const v = vectorsStatus()
const l = lessonsStatus()

console.log(`facts ${c.facts} live · messages ${c.messages} · conversations ${c.conversations}`)
console.log(`vectors ${v.available ? `${v.indexed} indexed` : `unavailable (${v.reason})`}`)
console.log(`lessons ${l.total} · ${l.retrieved} have fired · ${l.unused} never used`)

if (backfill) {
  console.log(`\nbackfilled ${await backfillFactVectors()} fact vectors`)
}

const cutoff = Date.now() - DEFAULT_DECAY_DAYS * 86_400_000
const staleFacts = (db
  .query("SELECT COUNT(*) n FROM facts WHERE archived = 0 AND COALESCE(last_recalled, ts) < ?")
  .get(cutoff) as { n: number }).n
const deadLessons = (db
  .query("SELECT COUNT(*) n FROM lessons WHERE hits = 0 AND ts < ?")
  .get(Date.now() - 30 * 86_400_000) as { n: number }).n

if (!apply) {
  console.log(`\nwould archive ${staleFacts} fact(s) unrecalled in ${DEFAULT_DECAY_DAYS} days`)
  console.log(`would prune   ${deadLessons} lesson(s) never retrieved in 30 days`)
  console.log(`\nnothing changed. re-run with --apply`)
} else {
  console.log(`\narchived ${decayFacts()} fact(s) — reversible, use unarchiveFact(id)`)
  console.log(`pruned   ${pruneLessons()} lesson(s)`)
}
