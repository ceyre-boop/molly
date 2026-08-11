/**
 * Molly Console — Pulse voice bridge.
 *
 * Pulse (Molly's local voice server) owns text-to-speech; this app never
 * talks to ElevenLabs directly (CLAUDE.md). Requests are best-effort: if
 * Pulse isn't running, the console keeps working silently.
 */

const PULSE_URL = "http://localhost:31337/notify"
const TIMEOUT_MS = 1500

export interface PulsePayload {
  message: string
  voice_enabled: true
}

export function buildPulsePayload(message: string): PulsePayload {
  return { message, voice_enabled: true }
}

export async function sendPulse(message: string, url: string = PULSE_URL): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildPulsePayload(message)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}
