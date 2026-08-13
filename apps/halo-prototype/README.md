# Molly Halo AR Prototype

> **STATUS: LEARNING EXERCISE — SUPERSEDED (2026-08-13)**
>
> Noa (Brilliant Labs' native assistant) ships these features in the box: scene
> description, conversational voice Q&A, maps, basic face memory, even on-device
> app generation via Vibe Mode. Building them again here was redundant.
>
> Kept for the validated patterns:
> - `public/audio.ts` — isolated STT/TTS seam (swap-out boundary design)
> - `public/gestures.ts` — local MediaPipe hand tracking, zero API cost
> - `lib/anthropic.ts` — working Claude Haiku vision call + prompt patterns
>
> Molly's real layer is what Noa structurally can't access: the identity graph,
> OAuth into Colin's accounts, authority tiers, cross-surface continuity.
> That build lives in `apps/spine/` — see `SPINE.md` there and
> `NOA_GAP_PROTOCOL.md` here for what happens when the glasses arrive.

A browser-based prototype of Molly's AR interface for Brilliant Labs Halo glasses. Visual-first, silent by default, uses Claude Haiku 4.5 vision to describe camera scenes or read documents.

## Quick start (local)

```bash
cd apps/halo-prototype
bun install
ANTHROPIC_API_KEY=sk-... bun run server.ts
```

Then open `http://localhost:3000` in your browser.

## How to use

- **Press spacebar once:** capture the camera frame → Claude Haiku analyzes the scene (ambient mode) → displays a 1-2 sentence evocative description on the HUD.
- **Press spacebar twice** (within 450ms): same capture + read mode — Claude reads any visible text or documents and summarizes/answers.
- **Press spacebar three times**: shows "coming soon" for future face recognition / maps protocols.

The HUD displays:
- **Top line (stat):** current time + temperature (from Open-Meteo API, requires geolocation permission).
- **Description:** the result from Claude, persists until the next trigger.
- **Thinking indicator:** brief "thinking..." while Claude responds (~1-3s).

## Backend contract

`POST /api/describe`

**Request:**
```json
{ "image": "<base64 JPEG, no data-URI prefix>", "mode": "ambient" | "read" }
```

**Response:**
```json
{ "text": "<1-2 sentence description or answer>" }
```

## Environment variables

- `ANTHROPIC_API_KEY` (required) — your Claude API key.
- `HALO_SHARED_SECRET` (optional) — bearer token for auth. If unset, the endpoint is open (fine for solo testing; set it once deployed to prevent API budget burn).

## Design notes

- **HUD position:** fixed at `bottom: 32px; left: 24px;` — deliberately NOT spatially tracked, matching the real hardware's constraint (256×256 circular display, no positional tracking).
- **Colors:** `#39FF14` (HUD green) on a subtle scrim for legibility over the camera feed.
- **Silent by design:** zero audio/TTS in this prototype. On real Halo hardware, Noha (Brilliant's on-device voice assistant) can optionally speak the returned `text` — that wire is out of scope here.
- **Frame capture:** draws the current `<video>` frame to an offscreen `<canvas>`, exports as JPEG (quality 0.85), strips the data-URI prefix before sending to the backend.

## Path to real hardware

Once physical Halo glasses arrive:

```
Halo Lua (frame.camera.capture() JPEG) → BLE → Python host bridge
  → POST https://molly-gz19.onrender.com/api/describe {image, mode}
  ← {text}
  → frame.display.text(...) styled to mimic the green-HUD-card look
```

This prototype's vision call, prompts, and backend are the real production code — the browser version validates everything end-to-end before deploying to the glasses.

## Testing on real hardware (phone)

1. Deploy to Render (or set `ANTHROPIC_API_KEY` env var and run locally on HTTPS).
2. Open the Render URL on a phone browser with a real camera and HTTPS.
3. Allow geolocation and camera permissions.
4. Test the space x1 / x2 / x3 flow.

This is the closest proxy to "what you'll see through the glasses" before the hardware arrives.

## Build & deploy

Render (or any Node.js-compatible host):

```bash
# Docker runtime (Bun base image)
docker build -t halo-prototype .
docker run -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-... \
  -e HALO_SHARED_SECRET=<secret> \
  halo-prototype
```

Health check: `GET /` returns `200 OK`.
