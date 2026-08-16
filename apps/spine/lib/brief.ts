// The morning brief — step 2 of the Donna sequencing. A cron hits
// /api/brief/generate; Molly reads her own tools (calendar_read, recall,
// people_lookup) and writes the brief into the spine, where the dashboard
// shows it. No sending, no acting: she's just already thought about the day.
import { chat } from "./agent"
import { kvGet, kvSet } from "./memory"

const BRIEF_KEY = "morning_brief"
const MIN_REGEN_MS = 6 * 60 * 60 * 1000 // don't let an open endpoint burn budget

export interface StoredBrief {
  text: string
  generatedAt: number
  tokens: number
}

const BRIEF_PROMPT =
  "Compose my morning brief. Use calendar_read for today AND tomorrow, recall for open loops and stored facts, " +
  "and people_lookup if anyone relevant comes up. Structure: (1) today at a glance — events, conflicts, prep needed; " +
  "(2) heads-up for tomorrow; (3) open loops worth closing today. " +
  "If the calendar is empty say so plainly. Keep it under 150 words — this gets read in one glance over coffee."

export function getBrief(): StoredBrief | null {
  const raw = kvGet(BRIEF_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredBrief
  } catch {
    return null
  }
}

export function shouldRegenerate(existing: StoredBrief | null, now = Date.now(), force = false): boolean {
  if (force) return true
  if (!existing) return true
  return now - existing.generatedAt > MIN_REGEN_MS
}

export async function generateBrief(force = false): Promise<{ brief: StoredBrief; cached: boolean }> {
  const existing = getBrief()
  if (!shouldRegenerate(existing, Date.now(), force)) {
    return { brief: existing!, cached: true }
  }

  const convId = `brief-${new Date().toISOString().slice(0, 10)}`
  const reply = await chat(convId, BRIEF_PROMPT)

  const brief: StoredBrief = {
    text: reply.text,
    generatedAt: Date.now(),
    tokens: reply.tokens ? reply.tokens.input + reply.tokens.output : 0,
  }
  // Don't overwrite a good brief with an offline notice
  if (!reply.offline) kvSet(BRIEF_KEY, JSON.stringify(brief))
  return { brief, cached: false }
}
