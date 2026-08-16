// calendar_read — Tier-1 read-only tool. The spine's first external observer:
// the single highest-signal input for anticipation (meetings imply prep,
// travel, conflicts, follow-ups).
import { googleConfigured, googleConnected, fetchEvents, type CalendarEvent } from "./google"

export const CALENDAR_READ_DEF = {
  name: "calendar_read",
  description:
    "Read Colin's Google Calendar (read-only). Returns a compact event list for the requested range. " +
    "Use for questions about schedule, availability, conflicts, or day planning.",
  input_schema: {
    type: "object" as const,
    properties: {
      range: {
        type: "string",
        description: "'today', 'tomorrow', or 'week' (next 7 days). Defaults to 'today'.",
      },
    },
    required: [],
  },
}

export function rangeToWindow(range: string, now = new Date()): { min: Date; max: Date; label: string } {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const today = startOfDay(now)
  const dayMs = 24 * 60 * 60 * 1000

  if (range === "tomorrow") {
    const t = new Date(today.getTime() + dayMs)
    return { min: t, max: new Date(t.getTime() + dayMs), label: "tomorrow" }
  }
  if (range === "week") {
    return { min: today, max: new Date(today.getTime() + 7 * dayMs), label: "the next 7 days" }
  }
  return { min: today, max: new Date(today.getTime() + dayMs), label: "today" }
}

export function formatEvents(events: CalendarEvent[], label: string): string {
  if (events.length === 0) return `No events ${label}. Clear runway.`
  const lines = events.map((e) => {
    if (e.allDay) return `${e.summary} (all day)`
    const t = new Date(e.start)
    const hm = `${t.getHours()}:${String(t.getMinutes()).padStart(2, "0")}`
    const durMin = Math.round((new Date(e.end).getTime() - t.getTime()) / 60000)
    const dur = durMin >= 60 ? `${Math.round(durMin / 60 * 10) / 10}h` : `${durMin}m`
    return `${hm} ${e.summary} (${dur}${e.location ? `, ${e.location}` : ""})`
  })
  return `${events.length} event(s) ${label}: ${lines.join("; ")}`
}

export async function executeCalendarRead(input: Record<string, unknown>): Promise<string> {
  if (!googleConfigured())
    return "Google Calendar is not configured — GOOGLE_CLIENT_ID/SECRET env vars are missing. See SPINE.md setup."
  if (!googleConnected())
    return "Google Calendar is not connected yet — Colin needs to visit /oauth/google/start once to grant read-only access."

  const range = typeof input.range === "string" ? input.range : "today"
  const { min, max, label } = rangeToWindow(range)
  const events = await fetchEvents(min.toISOString(), max.toISOString())
  if (!Array.isArray(events)) return `Calendar fetch failed (${events.error}).`
  return formatEvents(events, label)
}
