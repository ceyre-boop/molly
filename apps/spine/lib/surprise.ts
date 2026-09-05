// Surprise gate — decide whether a candidate fact is worth storing at all.
//
// Storing everything is how a memory becomes useless: the same fact restated
// six ways crowds out the five other things Colin actually said. Before a
// write, the candidate is compared against its nearest stored neighbour and
// one of three things happens.
//
// The thresholds are measured, not guessed. Against "Colin's calculus final is
// in December", embedded with nomic-embed-text and its document prefix:
//
//   identical                                              1.000
//   "The calculus final for Colin takes place in December"  0.906
//   "Colin has his calc final in December"                  0.916
//   "Colin's calculus final is on December 16"              0.912   <- REFINEMENT
//   "Colin's COMM-131 speech is due in November"            0.669
//   "MATH-170 meets Tuesday 5:00-7:20 in Gorman 3202"       0.603
//   "NFP lands on first Fridays"                            0.617
//
// Paraphrases sit in a tight 0.906-0.916 band and everything genuinely
// different falls below 0.67 — a wide, safe gap, unlike the overlapping
// distributions that MIN_SIMILARITY in memory.ts has to live with.
//
// The trap is the refinement at 0.912: "on December 16" is NEW INFORMATION
// wearing a paraphrase's score. Cosine alone cannot tell it apart from a
// restatement, so the middle band does not decide on similarity at all — it
// asks whether the candidate carries an informative token the stored fact
// lacks. A number or an unseen proper noun is a refinement; nothing new is a
// restatement.
//
// The first version of this used text length as the specificity proxy and it
// failed on the very example above: once the stored text had been merged into
// the wordier "The calculus final for Colin takes place in December" (52
// chars), the genuinely more specific "Colin's calculus final is on December
// 16" (40 chars) was shorter, scored as a restatement, and the date was
// dropped. Length is not specificity.

import { db, type Fact } from "./memory"
import { embed } from "./embeddings"
import { indexFact, nearestFacts, unindexFact, vectorsAvailable } from "./vectors"

/** At or above this, the candidate says nothing the store does not already
 *  say. Set above the 0.916 paraphrase ceiling so a refinement never lands
 *  here. */
export const DUPLICATE_THRESHOLD = 0.93

/** Between this and DUPLICATE_THRESHOLD the candidate restates a known fact,
 *  possibly with more detail. Set below the 0.906 paraphrase floor and well
 *  above the 0.669 same-topic ceiling. */
export const MERGE_THRESHOLD = 0.8

export type Verdict = "store" | "merge" | "drop"

export interface Decision {
  verdict: Verdict
  /** The stored fact this was judged against, when there was one. */
  against?: Fact
  similarity?: number
  reason: string
}

// Words that carry no fact on their own. Kept deliberately short: the job is
// to stop "takes place" reading as new information, not to do linguistics.
const STOPWORDS = new Set([
  "a","an","and","are","as","at","be","by","for","from","has","have","he","her","his","in","is","it",
  "its","of","on","or","s","she","that","the","their","them","they","this","to","was","were","will",
  "with","does","do","did","take","takes","taking","place","put","get","gets","got","one","also",
])

/** Tokens that could carry a fact: numbers, names, nouns. Lowercased so
 *  "December" and "december" are the same token, punctuation stripped so
 *  "December 16." matches "December 16". */
export function informativeTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t))
  )
}

const hasDigit = (t: string) => /\d/.test(t)

/** Pure decision, no writes, no model. Exported so the thresholds and the
 *  refinement rule can be tested without Ollama running. */
export function decide(similarity: number | undefined, incoming: string, stored?: string): Verdict {
  if (similarity === undefined) return "store"
  if (similarity >= DUPLICATE_THRESHOLD) return "drop"
  if (similarity < MERGE_THRESHOLD) return "store"
  if (!stored) return "merge"

  // Middle band: near-identical meaning. The only question left is whether the
  // candidate knows something the stored fact does not.
  const known = informativeTokens(stored)
  const novel = [...informativeTokens(incoming)].filter((t) => !known.has(t))

  if (novel.length === 0) return "drop"        // pure restatement
  if (novel.some(hasDigit)) return "merge"     // a date, a time, a room number
  return novel.length >= 2 ? "merge" : "drop"  // one stray synonym is not news
}

/** Which of two texts to keep on a merge: the one carrying more informative
 *  tokens, so a wordier paraphrase never displaces a specific one. */
export function preferText(a: string, b: string): string {
  return informativeTokens(b).size > informativeTokens(a).size ? b : a
}

/** Judge a candidate against what is already stored. Read-only. */
export async function judge(subject: string, fact: string): Promise<Decision> {
  if (!vectorsAvailable()) {
    return { verdict: "store", reason: "no vector index — cannot compare, so keep it" }
  }
  let hits: ReturnType<typeof nearestFacts>
  try {
    hits = nearestFacts(await embed(`${subject}: ${fact}`, "document"), 1)
  } catch (e) {
    return { verdict: "store", reason: `embedding failed (${e instanceof Error ? e.message : e}) — keep it` }
  }
  const top = hits[0]
  if (!top) return { verdict: "store", reason: "nothing stored to compare against" }

  const against = db.query("SELECT * FROM facts WHERE id = ? AND archived = 0").get(top.factId) as Fact | null
  if (!against) return { verdict: "store", reason: "nearest neighbour is archived or gone" }

  const verdict = decide(top.similarity, fact, against.fact)
  const reason =
    verdict === "drop" ? `already known (cosine ${top.similarity.toFixed(3)} vs fact ${against.id})`
    : verdict === "merge" ? `refines fact ${against.id} (cosine ${top.similarity.toFixed(3)})`
    : `new (nearest is only ${top.similarity.toFixed(3)})`
  return { verdict, against, similarity: top.similarity, reason }
}

/** Mark a fact as retrieved. Feeds the decay pass — a fact nothing ever asks
 *  for is a fact that is not earning its place in the prompt. */
export function touchFact(id: number): void {
  db.query("UPDATE facts SET last_recalled = ? WHERE id = ?").run(Date.now(), id)
}

/** Replace a stored fact's text and re-index it. Keeps whichever text carries
 *  more informative tokens — see the refinement note at the top of this file. */
export async function mergeInto(target: Fact, incoming: string): Promise<Fact> {
  const text = preferText(target.fact, incoming)
  db.query("UPDATE facts SET fact = ?, ts = ? WHERE id = ?").run(text, Date.now(), target.id)
  const row = db.query("SELECT * FROM facts WHERE id = ?").get(target.id) as Fact
  try {
    if (vectorsAvailable()) indexFact(row.id, await embed(`${row.subject}: ${row.fact}`, "document"))
  } catch { /* stale vector beats a lost fact */ }
  return row
}

export const DEFAULT_DECAY_DAYS = 90

/** Archive facts nothing has recalled in `days`. Archived, never deleted:
 *  reversible by design, and the row is still there to be un-archived if the
 *  threshold turns out to be wrong. */
export function decayFacts(days = DEFAULT_DECAY_DAYS): number {
  const cutoff = Date.now() - days * 86_400_000
  const stale = db
    .query(`SELECT id FROM facts
            WHERE archived = 0 AND COALESCE(last_recalled, ts) < ?`)
    .all(cutoff) as { id: number }[]
  for (const { id } of stale) {
    db.query("UPDATE facts SET archived = 1 WHERE id = ?").run(id)
    unindexFact(id) // out of the index, so it stops competing for the top-k
  }
  return stale.length
}

export function unarchiveFact(id: number): void {
  db.query("UPDATE facts SET archived = 0, last_recalled = ? WHERE id = ?").run(Date.now(), id)
}
