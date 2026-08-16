// Google OAuth2 (read-only Calendar) — raw REST, no SDK dependency.
// Tokens live in the kv store under secret_* keys, which the backup exporter
// EXCLUDES (backups are committed to a public repo — see lib/backup.ts).
//
// Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
// Colin creates the OAuth client in Google Cloud Console; the spine never
// sees his password — only the standard consent-screen code exchange.
import { kvGet, kvSet } from "./memory"

const SCOPE = "https://www.googleapis.com/auth/calendar.readonly"
const TOKENS_KEY = "secret_google_tokens"
const STATE_KEY = "secret_google_oauth_state"

interface StoredTokens {
  access_token: string
  refresh_token: string
  expires_at: number // epoch ms
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function googleConnected(): boolean {
  return Boolean(kvGet(TOKENS_KEY))
}

function redirectUri(): string {
  return process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/oauth/google/callback"
}

export function getAuthUrl(): string {
  const state = crypto.randomUUID()
  kvSet(STATE_KEY, state)
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function exchangeCode(
  code: string,
  state: string
): Promise<{ ok: boolean; error?: string; refreshToken?: string }> {
  const expectedState = kvGet(STATE_KEY)
  if (!expectedState || state !== expectedState) return { ok: false, error: "state mismatch" }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  })
  if (!res.ok) return { ok: false, error: `token exchange failed (${res.status})` }

  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
  if (!data.refresh_token) return { ok: false, error: "no refresh_token returned (revoke access and retry with prompt=consent)" }

  const tokens: StoredTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  }
  kvSet(TOKENS_KEY, JSON.stringify(tokens))
  return { ok: true, refreshToken: data.refresh_token }
}

async function getAccessToken(): Promise<string | null> {
  let raw = kvGet(TOKENS_KEY)

  // Env-seeded fallback: redeploys wipe kv tokens (secret_* is excluded from
  // backups by design). GOOGLE_REFRESH_TOKEN in the env survives deploys and
  // re-seeds the connection on first use — set once after connecting.
  if (!raw && process.env.GOOGLE_REFRESH_TOKEN) {
    raw = JSON.stringify({
      access_token: "",
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      expires_at: 0,
    } satisfies StoredTokens)
    kvSet(TOKENS_KEY, raw)
  }

  if (!raw) return null
  let tokens: StoredTokens
  try {
    tokens = JSON.parse(raw)
  } catch {
    return null
  }

  if (Date.now() < tokens.expires_at) return tokens.access_token

  // Refresh
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: tokens.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { access_token: string; expires_in: number }
  kvSet(
    TOKENS_KEY,
    JSON.stringify({
      ...tokens,
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in - 60) * 1000,
    })
  )
  return data.access_token
}

export interface CalendarEvent {
  summary: string
  start: string // ISO or date
  end: string
  location?: string
  allDay: boolean
}

export async function fetchEvents(
  timeMinIso: string,
  timeMaxIso: string
): Promise<CalendarEvent[] | { error: string }> {
  const token = await getAccessToken()
  if (!token) return { error: "no valid token — reconnect at /oauth/google/start" }

  const params = new URLSearchParams({
    timeMin: timeMinIso,
    timeMax: timeMaxIso,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "25",
  })
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const detail = res.status === 403
      ? "HTTP 403 — is the Google Calendar API ENABLED for the project that owns the OAuth client?"
      : `HTTP ${res.status}`
    return { error: detail }
  }

  const data = (await res.json()) as {
    items?: Array<{
      summary?: string
      location?: string
      start?: { dateTime?: string; date?: string }
      end?: { dateTime?: string; date?: string }
    }>
  }
  return (data.items ?? []).map((e) => ({
    summary: e.summary ?? "(untitled)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    location: e.location,
    allDay: Boolean(e.start?.date && !e.start?.dateTime),
  }))
}
