# EDITH Phase 3 — Voice Loop (Browser Prototype)

## Context

The EDITH prototype (`apps/halo-prototype/`, branch `halo-web-prototype`, live on Render) already does visual AR: spacebar-tap triggers capture a camera frame and send it to Claude vision via `POST /api/describe`, rendering answers into a HUD text panel and tactical EDITH overlay panels (identity, status, memory, etc. — built in Phases 1–2, which also added face detection via `POST /api/faces`). It is currently silent — no mic input, no spoken output — by original design (documented at the top of `client.ts`).

The user now wants to talk to EDITH and have her talk back, tested today on the existing browser prototype, before any hardware or native app work happens. This is Phase 3 of a longer roadmap (full sequence below) but the *only* phase being built right now — everything past this depends on an iOS companion app that doesn't exist yet.

This must coexist with the existing tap-counting trigger (1 tap = ambient describe, 2 taps = read mode, 3 taps = reserved toast) without breaking it, and it must be built as an isolated, swappable module so the real Halo hardware's mic/bone-conduction speaker can drop in later without touching the rest of `client.ts`.

## Roadmap (for sequencing context only — not built in this pass)

3. **Voice Loop** (this plan) — Web Speech API STT/TTS in the browser prototype.
4. **EDITH iOS Companion App** — SwiftUI app, Core Bluetooth Halo pairing, background relay to the Molly backend. The real unlock; everything below depends on it existing.
5. **Account Integrations** — Google (read-only), Apple Calendar/Reminders (EventKit), HealthKit, Contacts (feeds face-memory naming), notification mirroring. Each an opt-in toggle in the iOS app.
6. **Automations Layer** — time/context/location-triggered panel changes, declarative `automations.json` in the Molly backend.
7. **Face Memory → backend** — migrate `FaceMemory` off `localStorage` into a Molly-side datastore (SQLite), local-only, so identity persists across the web prototype, iOS app, and hardware.

## Phase 3 — Voice Loop: implementation

### Backend: extend `/api/describe`, no new endpoint

EDITH's core use case is "hey, what is this" — a spoken question *about what the camera sees*. So voice reuses the same vision call rather than forking a separate text-only path.

**Request** (`lib/anthropic.ts` + `server.ts`):
```json
{ "image": "<base64 JPEG>", "mode": "read", "question": "what does this label say?" }
```
- `image` stays required — client always captures a frame at the start of a voice turn, same as today's read mode.
- `question` is new and optional; absent = today's exact behavior, unchanged.
- **Response unchanged**: `{ "text": "<answer>" }`.

Changes:
- `lib/anthropic.ts`: `describeImage(base64Jpeg, mode, question?)` — when `question` is present, use a new `PROMPTS.voiceQuestion` variant (wraps the existing read-mode instructions, appends the transcribed question, and asks for a short spoken-style answer — no "I see..." framing, 1-3 sentences, under 200 chars) instead of `PROMPTS.read`.
- `server.ts` `handleDescribe`: parse optional `body.question` (string), pass through.

### New file: `public/audio.ts`

Isolated Web Speech API wrapper — the entire swap-out seam for Halo's real mic/speaker later. No fetch calls, no EDITH panel knowledge — purely STT/TTS:
- `startPushToTalk(onResult, onError?, onListeningChange?)` — creates a `SpeechRecognition` (with `webkitSpeechRecognition` fallback), non-continuous, `en-US`, fires `onResult(transcript)` when done.
- `stopPushToTalk()` — calls `.stop()`, which triggers a final `onresult` then `onend`.
- `speak(text)` — `SpeechSynthesisUtterance`, cancels any in-flight speech first (barge-in safe).
- `stopSpeaking()`, `getVoiceCapabilities()` — feature-detection for showing/hiding the mic UI gracefully when unsupported (notably iOS Safari).

`client.ts` imports these two function pairs and owns all orchestration (capture, fetch, panel updates) — `audio.ts` never touches the DOM beyond the Web Speech APIs themselves.

### Interaction: mic button (primary) + spacebar-hold (secondary), safe alongside the existing tap counter

Two entry points, one shared `beginVoiceCapture()` / `endVoiceCapture()` pair:

- **Mic button** (`#mic-btn`, new element in `index.html`, bottom-right, separate from the existing bottom-left `#hud`): `pointerdown` → `beginVoiceCapture()`, `pointerup`/`pointercancel` → `endVoiceCapture()`. Works for mouse and touch.
- **Spacebar hold**: the existing tap-counter uses a 450ms debounce on release. A hold is distinguished with a hold-timer armed on `keydown` (guarded by `e.repeat` so OS key-repeat doesn't re-arm it) at a **500ms threshold** — deliberately longer than the tap debounce. If the timer fires before `keyup`, the press is committed as a hold: any in-flight tap sequence is cancelled (`pressCount = 0`), and `beginVoiceCapture()` runs. If `keyup` happens first, it falls through to the existing tap-counting logic completely unchanged. The two gestures are mutually exclusive per keypress, decided at the threshold crossing — zero behavior change to today's 1-tap/2-tap/3-tap flow.

`beginVoiceCapture()` shows a "listening" state (`#mic-btn[data-listening="true"]`, `#voice-indicator` text), calls `startPushToTalk()`. On result, calls a new `triggerVoiceQuestion(transcript)`.

### `triggerVoiceQuestion(question)` — new function in `client.ts`, parallel to existing `triggerCapture()`

Captures a fresh frame, POSTs `{ image, mode: "read", question }` to `/api/describe`, and on response:
1. Renders the answer into `#hud-desc` via the existing `animateTextReveal()` typewriter effect (same visual path as camera-triggered answers).
2. Calls `speak(responseText)` immediately after — text and voice carry the identical answer, in parallel, so "voice supplements display, doesn't replace it."

Reuses `showThinking()`, `edith.setMode("read")`, `edith.setAnalyzing()` exactly as `triggerCapture("read")` does today.

### UI additions

- `index.html`: `#mic-btn` (circular button, 🎤, bottom-right) and `#voice-indicator` ("● LISTENING" text), both siblings of the existing `#hud`.
- `styles.css`: reuses existing `--hud-green` variable and `scanPulse`/`glitchShift` keyframes already defined for the green monospace theme — no new palette introduced, stays consistent with the HUD-overlay layer (distinct from the blue/cyan EDITH canvas panels, which are a different visual layer).

### Compatibility notes (flag in README, not blocking)
- `SpeechRecognition` requires HTTPS/localhost — the Render deployment is fine; plain-HTTP local dev needs a callout.
- iOS Safari has historically weak/no `SpeechRecognition` support — `getVoiceCapabilities()` gates whether the mic button renders, with a toast fallback ("voice not supported, use spacebar taps") instead of silent failure.
- First `speechSynthesis.speak()` on mobile needs a user gesture — satisfied naturally by the mic button tap.

## Files touched

| File | Change |
|---|---|
| `apps/halo-prototype/public/audio.ts` | **New.** STT/TTS wrapper — sole swap point for real Halo hardware later. |
| `apps/halo-prototype/public/client.ts` | Import `audio.ts`; hold-vs-tap spacebar logic; mic button handlers; `beginVoiceCapture`/`endVoiceCapture`; `triggerVoiceQuestion`. Existing tap-counter and `triggerCapture` untouched. |
| `apps/halo-prototype/public/index.html` | Add `#mic-btn`, `#voice-indicator`. |
| `apps/halo-prototype/public/styles.css` | Add `#mic-btn`, `#mic-btn[data-listening="true"]`, `#voice-indicator` (reuses existing theme vars/animations). |
| `apps/halo-prototype/lib/anthropic.ts` | `describeImage(base64Jpeg, mode, question?)`; new `PROMPTS.voiceQuestion`. |
| `apps/halo-prototype/server.ts` | `handleDescribe` parses optional `question`, passes through. |
| `apps/halo-prototype/README.md` | Update "silent by design" section, document mic + spacebar-hold, note `question` field and HTTPS/iOS caveats. |

No new dependencies — Web Speech API is native to the browser.

## Verification

**Local:**
```bash
cd apps/halo-prototype && bun install
bunx tsc --noEmit
ANTHROPIC_API_KEY=sk-... bun run server.ts
# open http://localhost:3000 (or ngrok/LAN HTTPS if testing STT locally — plain http may block SpeechRecognition)
# tap space once/twice/thrice — confirm ambient/read/toast flow is unchanged
# hold spacebar past ~0.5s, ask a question aloud, release — confirm transcript triggers a read-mode
#   response that both types into hud-desc AND is spoken aloud
# tap-and-hold #mic-btn — same flow via touch/mouse
# interrupt mid-speech with a new voice question — confirm speech barge-in cancels prior utterance
```

**Live (after Render redeploys):**
```bash
curl -sI https://molly-gz19.onrender.com/     # expect 200
```
Open the Render URL on a phone browser (real HTTPS, real mic) and run the same push-to-talk flow.

## Critical files
`apps/halo-prototype/{server.ts, lib/anthropic.ts, public/client.ts, public/audio.ts, public/index.html, public/styles.css, README.md}`
