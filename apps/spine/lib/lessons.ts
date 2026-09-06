// Lessons — the self-correction loop.
//
// SOUL.md already names Molly's failure modes in the first person ("I claim
// success from signals that aren't", "I hardcode things that expire"). Those
// are decoration until something writes new ones down and puts the relevant
// ones back in front of her before the next attempt. This is that.
//
//   after a session   the LOCAL model writes one line: what went wrong, what to
//                     do differently, and the kind of request it applies to
//   before a session  the lessons whose trigger resembles the incoming request
//                     are prepended to the system prompt
//   over time         a lesson that never gets retrieved is pruned
//
// It runs on the free local model precisely so it can run every time. A
// self-critique rationed against an API budget is not a self-critique.

import { db } from "./memory"
import { embed, embeddingsAvailable } from "./embeddings"
import { toBlob } from "./embeddings"
import { vectorsAvailable } from "./vectors"
import { localChat, localModelAvailable } from "./local"
import { informativeTokens } from "./surprise"

db.run(`
  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trigger TEXT NOT NULL,
    lesson TEXT NOT NULL,
    hits INTEGER NOT NULL DEFAULT 0,
    ts INTEGER NOT NULL,
    last_hit INTEGER
  );
`)

export interface Lesson {
  id: number
  trigger: string
  lesson: string
  hits: number
  ts: number
  last_hit: number | null
}

const EMBED_DIMS = 768
let vecReady: boolean | null = null

function lessonVectorsReady(): boolean {
  if (vecReady !== null) return vecReady
  try {
    if (!vectorsAvailable()) throw new Error("vec0 unavailable")
    db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS lesson_vectors USING vec0(
      lesson_id INTEGER PRIMARY KEY,
      embedding FLOAT[${EMBED_DIMS}]
    )`)
    vecReady = true
  } catch {
    vecReady = false
  }
  return vecReady
}

/** Above this cosine two triggers describe the same situation and the lesson
 *  is already on file. Same band as the duplicate gate in lib/surprise.ts —
 *  lessons bloat the prompt faster than facts do, because every one of them is
 *  read on every matching request. */
export const LESSON_DUPLICATE_THRESHOLD = 0.93

/** A lesson has to be about the incoming request, not merely the least
 *  unrelated thing on file.
 *
 *  Measured, three lessons against four queries, embedding "trigger: lesson"
 *  as the document and the raw request as the query:
 *
 *    "did the launchagent pick up my new config?"   0.570  -> right lesson
 *    "I restarted the gateway, is the setting live?" 0.601  -> right lesson
 *    "can I remove these old scripts safely"         0.649  -> right lesson
 *    "what should I name this variable"              0.564  -> nothing applies
 *
 *  The RANKING is right every time; the absolute scores overlap almost
 *  completely (0.570 relevant vs 0.564 irrelevant). So this number cannot
 *  cleanly separate them and is not pretending to. 0.55 biases toward recall
 *  on purpose: an off-topic lesson costs one line under a heading that says
 *  "in situations like this one", which a model discounts. A missed lesson
 *  costs the mistake being repeated, which is the entire point of the loop.
 *
 *  Embedding "trigger" alone was tried and is worse — it scored every query
 *  0.10 lower and moved nothing apart. */
export const LESSON_MIN_SIMILARITY = 0.55

export async function recordLesson(trigger: string, lesson: string): Promise<Lesson | null> {
  const text = `${trigger}: ${lesson}`
  let vector: Float32Array | null = null

  if (lessonVectorsReady() && (await embeddingsAvailable())) {
    try {
      vector = await embed(text, "document")
      const dup = db
        .query(`SELECT lesson_id, vec_distance_cosine(embedding, ?1) AS cos
                FROM lesson_vectors WHERE embedding MATCH ?1 AND k = 1`)
        .get(toBlob(vector)) as { lesson_id: number; cos: number } | null
      if (dup && 1 - dup.cos >= LESSON_DUPLICATE_THRESHOLD) return null // already learned
    } catch { /* fall through and store it — a duplicate lesson beats a lost one */ }
  }

  const row = db
    .query("INSERT INTO lessons (trigger, lesson, hits, ts) VALUES (?, ?, 0, ?) RETURNING *")
    .get(trigger, lesson, Date.now()) as Lesson

  if (vector && lessonVectorsReady()) {
    try {
      db.query("DELETE FROM lesson_vectors WHERE lesson_id = ?").run(row.id)
      db.query("INSERT INTO lesson_vectors (lesson_id, embedding) VALUES (?, ?)").run(row.id, toBlob(vector))
    } catch { /* unindexed lesson: stored, just not retrievable by similarity */ }
  }
  return row
}

/** Lessons that apply to this request. Retrieval is what keeps a lesson alive,
 *  so this bumps `hits` — the same "earn your place" rule facts live under. */
export async function retrieveLessons(request: string, k = 3): Promise<Lesson[]> {
  if (!lessonVectorsReady() || !(await embeddingsAvailable())) return []
  let rows: { lesson_id: number; cos: number }[]
  try {
    rows = db
      .query(`SELECT lesson_id, vec_distance_cosine(embedding, ?1) AS cos
              FROM lesson_vectors WHERE embedding MATCH ?1 AND k = ?2 ORDER BY distance`)
      .all(toBlob(await embed(request, "query")), k) as { lesson_id: number; cos: number }[]
  } catch {
    return []
  }

  const ids = rows.filter((r) => 1 - r.cos >= LESSON_MIN_SIMILARITY).map((r) => r.lesson_id)
  if (!ids.length) return []

  const out = db
    .query(`SELECT * FROM lessons WHERE id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids) as Lesson[]
  for (const l of out) {
    db.query("UPDATE lessons SET hits = hits + 1, last_hit = ? WHERE id = ?").run(Date.now(), l.id)
  }
  return out
}

/** Prepend the applicable lessons to a system prompt. Returns the base prompt
 *  unchanged when nothing applies — an empty "things you learned" heading reads
 *  as an instruction to invent one. */
export async function composeSystemPrompt(base: string, request: string): Promise<string> {
  const lessons = await retrieveLessons(request)
  if (!lessons.length) return base
  const lines = lessons.map((l) => `- ${l.lesson}`).join("\n")
  return `${base}\n\nThings you got wrong before, in situations like this one:\n${lines}`
}

/** Drop lessons nothing has ever retrieved. A lesson that never fires is
 *  either wrong or about something that stopped happening; either way it is
 *  costing prompt space. Deleted rather than archived — unlike a fact, an
 *  unretrieved lesson holds no record of Colin's life. */
export function pruneLessons(minAgeDays = 30): number {
  const cutoff = Date.now() - minAgeDays * 86_400_000
  const dead = db.query("SELECT id FROM lessons WHERE hits = 0 AND ts < ?").all(cutoff) as { id: number }[]
  for (const { id } of dead) {
    db.query("DELETE FROM lessons WHERE id = ?").run(id)
    try { db.query("DELETE FROM lesson_vectors WHERE lesson_id = ?").run(id) } catch { /* not indexed */ }
  }
  return dead.length
}

export function listLessons(limit = 50): Lesson[] {
  return db.query("SELECT * FROM lessons ORDER BY hits DESC, ts DESC LIMIT ?").all(limit) as Lesson[]
}

export function lessonsStatus(): { total: number; retrieved: number; unused: number } {
  const n = (sql: string) => (db.query(sql).get() as { n: number }).n
  return {
    total: n("SELECT COUNT(*) n FROM lessons"),
    retrieved: n("SELECT COUNT(*) n FROM lessons WHERE hits > 0"),
    unused: n("SELECT COUNT(*) n FROM lessons WHERE hits = 0"),
  }
}

// Two calls, not one. Asked to judge AND extract in a single shot, an 8B model
// sets worth_recording true on a session that went fine and fills the field:
// on the transcript "what is 2+2 / 4 / thanks" it produced "Ensure clarity and
// completeness in responses" and then, after a grounding check was added,
// "Acknowledge the user's thanks with a friendly response" — grounded, and
// still not a lesson. A small model is much better at one narrow yes/no than
// at a combined judgement-plus-extraction, so the gate is its own call and the
// extraction only runs after it says yes.
const JUDGE_SYSTEM = `Did the assistant make a mistake, get corrected by the user, or have to redo work?

Reply with JSON only: {"went_wrong": boolean, "what": string}

went_wrong is true ONLY if there was an actual error, correction, or rework in
this transcript. A short exchange that simply worked is false. Being brief is
not a mistake. "what" is a few words naming the error, or "" when there was none.`

const EXTRACT_SYSTEM = `An assistant made a mistake. Write ONE lesson so it does not repeat.

Reply with JSON only: {"trigger": string, "lesson": string}

"trigger" describes the KIND of task this applies to, under 12 words, so a
future request can be matched against it. Not the specific details.
"lesson" is one imperative sentence under 25 words: what to do differently.
Be concrete and specific to what actually went wrong. No general advice.`

/** A real lesson talks about the work that actually happened. A generic one
 *  does not, and the model produces those freely: asked to reflect on the
 *  session "what is 2+2 / 4 / thanks", it set worth_recording true and offered
 *  "Ensure clarity and completeness in responses for better user
 *  understanding." That is not a lesson, it is a fortune cookie, and storing
 *  it would put a permanent noise line in front of every future request.
 *
 *  So the critique has to be grounded: at least two of its content words must
 *  appear in the transcript it claims to be about. The good lesson from that
 *  same test — "Verify configuration changes by checking the actual service
 *  state, not just command exit codes" — shares service, state, command,
 *  configuration. The fortune cookie shares nothing. */
export function isGrounded(lesson: string, trigger: string, transcript: string): boolean {
  const source = informativeTokens(transcript)
  const claimed = [...informativeTokens(`${trigger} ${lesson}`)]
  return claimed.filter((t) => source.has(t)).length >= 2
}

export interface Reflection {
  trigger: string
  lesson: string
  worth_recording: boolean
}

function parseJson<T>(raw: string): Partial<T> | null {
  try { return JSON.parse(raw) as Partial<T> } catch { return null }
}

/** Did anything actually go wrong? Its own call — see the note above. */
export async function judgeSession(transcript: string): Promise<boolean> {
  const raw = await localChat(transcript.slice(0, 6000), { system: JUDGE_SYSTEM, json: true, maxTokens: 80, temperature: 0 })
  return parseJson<{ went_wrong: boolean }>(raw)?.went_wrong === true
}

/** Ask the local model what went wrong. Returns null when nothing did, when
 *  the model is unreachable, or when it returns a shape that is not a
 *  reflection — a malformed critique must not become a stored lesson. */
export async function reflect(transcript: string): Promise<Reflection | null> {
  if (!(await localModelAvailable())) return null
  try {
    if (!(await judgeSession(transcript))) return null

    const raw = await localChat(transcript.slice(0, 6000), { system: EXTRACT_SYSTEM, json: true, maxTokens: 160, temperature: 0 })
    const r = parseJson<Reflection>(raw)
    if (!r || typeof r.trigger !== "string" || typeof r.lesson !== "string") return null

    const trigger = r.trigger.trim()
    const lesson = r.lesson.trim()
    if (!trigger || !lesson || informativeTokens(lesson).size < 3) return null
    if (!isGrounded(lesson, trigger, transcript)) return null
    return { trigger, lesson, worth_recording: true }
  } catch {
    return null
  }
}

/** The whole loop: reflect on a session, store the lesson if there is one. */
export async function learnFromSession(transcript: string): Promise<Lesson | null> {
  const r = await reflect(transcript)
  return r ? recordLesson(r.trigger, r.lesson) : null
}
