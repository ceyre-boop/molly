# Halo AR Glasses — Browser Prototype (Visual, Silent, Deployed Now)

## Context

The Brilliant Labs Halo glasses ship with **Noha**, their own on-device voice assistant, which already handles general conversational tasks well. An earlier attempt at wiring Molly into Halo (on unmerged branch `claude/issue-2-20260811-0008`) made the mistake of treating voice as mandatory — every response type carries a `voiceText` field baked into shared TypeScript interfaces across `halo/protocols.ts`, `apps/halo-edge/api/halo.ts`, etc. That code is also almost entirely non-functional: zero real Claude vision calls (the Anthropic call is a literal stub that logs "not yet wired" and returns `null`), zero Lua code, zero BLE bridge, zero real face-recognition DB.

The corrected direction: **Molly on Halo is action-triggered and visual — silent by default.** She doesn't compete with Noha for voice. She answers by putting something on the display: a short HUD-style description or answer, styled like the reference mockup (green monospace text, time+temp stat line, a 1-2 sentence description card, not spatially locked to anything — the hardware genuinely can't do that, 256×256 display, no positional tracking). Later, on real hardware, her text answer *could* be piped through Noha's TTS — but that's a future wire, not part of this build.

The immediate, concrete ask: **get a real, working prototype live on Render right now**, on its own branch, so it can be tested from a phone browser before the glasses arrive, and so the same backend can be pointed at the real hardware the moment it's in hand. This also fixes a live problem: the existing Render service (`molly`, `srv-d9td6t2jobas73cmbf3g`) is currently failing every deploy with exit 127, because it's misconfigured — `runtime: python` trying to run `bun bin/server.ts`, a file that was deleted from `main` during the dashboard cleanup. Confirmed live via the Render CLI (already authenticated in this environment as `ceyre@mcc.edu`).

## What this is NOT (explicitly out of scope this round)

- Not touching `main` — dashboard/GitHub Pages stays exactly as-is.
- Not reusing/merging the `apps/halo-edge` Vercel scaffold or its voice-first types — that stays untouched on its branch as a legitimate *future* phase (laptop-closed reachability, cost-capped fallback, heartbeat/queue). This prototype is simpler: browser camera → Render → Claude vision → HUD text.
- Not implementing face recognition or maps overlay yet — 3rd space-press is reserved with a "coming soon" placeholder, no backend call.
- Not adding audio/TTS in the prototype itself — confirmed zero `SpeechSynthesis`/audio code. A comment in the code notes where Noha TTS would hook in later.

---

## 1. Branch

```bash
git checkout main && git pull origin main
git checkout -b halo-web-prototype
git push -u origin halo-web-prototype
```
All work happens here. `main` is untouched — verified at the end via `git diff main origin/main` (expect empty).

## 2. New app: `apps/halo-prototype/`

Follows the repo's existing `apps/console/` pattern (Bun.serve() + Bun.build()-bundled client — zero framework, matches house style), not the single-file `index.html` style, because this app has real client logic worth type-checking (camera lifecycle, canvas capture, geolocation, debounced multi-press key handling).

```
apps/halo-prototype/
├── server.ts              # Bun.serve(): static files + POST /api/describe
├── lib/
│   ├── anthropic.ts        # describeImage(base64, mode) — pure, testable
│   └── anthropic.test.ts
├── public/
│   ├── index.html           # <video>, hidden <canvas>, HUD overlay divs
│   ├── client.ts             # camera, keydown triggers, capture, fetch, HUD render
│   └── styles.css            # HUD green monospace styling
├── package.json             # scoped: name "halo-prototype", private, engines.bun
├── Dockerfile                # oven/bun:1 base — Render has no native bun runtime
├── .dockerignore
└── README.md                 # setup, API contract, path to real hardware
```

**`server.ts`** — binds to all interfaces (not localhost-only like `apps/console`, since it must be reachable from Render and, for local testing, from a phone on the LAN). Routes: `POST /api/describe`, static `/`, `/client.js` (bundled), `/styles.css`.

**`lib/anthropic.ts`** — the repo's first real Anthropic vision call:
```ts
import Anthropic from "@anthropic-ai/sdk"
const client = new Anthropic() // ANTHROPIC_API_KEY from env

const PROMPTS = {
  ambient: 'Describe the scene in 1-2 short sentences (under 150 chars), evocatively. ' +
    'Style: "Fujiyoshida\'s Honco Street frames Mount Fuji perfectly, blending everyday life ' +
    'with Japan\'s most iconic view." No preamble.',
  read: "Read any visible text/document and summarize or answer in 1-3 short sentences. " +
    "If nothing readable is visible, say so briefly. No preamble.",
} as const

export async function describeImage(base64Jpeg: string, mode: "ambient" | "read") {
  const res = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 256,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Jpeg } },
      { type: "text", text: PROMPTS[mode] },
    ]}],
  })
  const block = res.content.find((b) => b.type === "text")
  return block?.type === "text" ? block.text.trim() : ""
}
```
`claude-haiku-4-5` — fast, cheap, vision-capable, correct alias per the claude-api skill. Response shape is `{ text: string }` only — no `voiceText`, no forced audio field.

## 3. Backend contract

`POST /api/describe` — `{ image: "<base64 JPEG, no data-URI prefix>", mode: "ambient" | "read" }` → `{ text: string }`.

- Client strips the `data:image/jpeg;base64,` prefix before sending (matches what the Anthropic SDK's `source.data` field expects — raw base64, no prefix).
- Optional auth: `HALO_SHARED_SECRET` bearer check, permissive when unset (fine for solo testing now; note in README to set it once confirmed working, since an open endpoint on a public URL can burn API budget).
- Same-origin (frontend + API served by the same `Bun.serve()`), so no CORS concerns.

## 4. Frontend — replicates the mockup

- `<video>` full-viewport via `getUserMedia({ video: { facingMode: "environment" } })`. Requires HTTPS or localhost — Render's URL is HTTPS, local dev is `localhost`, both fine.
- HUD card: `position: fixed; left: 24px; bottom: 32px;` — deliberately NOT spatially tracked, matching the hardware's real constraint (comment this explicitly, don't hide it). Green (`#39FF14`) monospace text (reuse the repo's existing `--mono` font stack from `index.html`), subtle scrim behind text for legibility (`rgba(0,0,0,.35)` + blur) — a browser-only affordance, noted as not carrying over to the real 256×256 display.
- Stat line: client clock (`HH:MM`, updates every 30s) + temperature via `navigator.geolocation` → `api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=temperature_2m` (free, no API key, read `response.current.temperature_2m`).
- **Trigger logic** (exact): `keydown` on `Space` (with `preventDefault()`), increments a counter, resets a 450ms debounce timer on each press; when the timer fires, dispatch on final count — **1 press → capture frame, POST mode `"ambient"`**; **2 presses → capture frame, POST mode `"read"`**; **3 presses → "coming soon" toast, no network call** (reserved for future face/maps protocols).
- Frame capture: draw current video frame to an offscreen `<canvas>`, `toDataURL("image/jpeg", 0.85)`, strip the prefix, POST.
- "Thinking..." indicator shown between trigger and response (Claude call takes 1-3s). Description persists on screen until the next trigger — matches a HUD showing last-known-state.
- Zero audio/TTS code. One comment at the top of `client.ts`: *"SILENT BY DESIGN — on real hardware, `text` could later be piped to Noha's TTS; out of scope here."*

## 5. Fix the Render deploy (confirmed live via `render` CLI, already authenticated)

**Diagnosis:** service `molly` (`srv-d9td6t2jobas73cmbf3g`, live at `https://molly-gz19.onrender.com`) has `runtime: python` trying to run `bun bin/server.ts` — a file deleted from `main` in an earlier cleanup commit. Double failure (wrong runtime + missing file) → exit 127.

**Fix — reconfigure the same service** (keeps the existing hostname, avoids a second free-tier service):
```bash
render services update srv-d9td6t2jobas73cmbf3g \
  --branch halo-web-prototype \
  --root-directory apps/halo-prototype \
  --runtime docker \
  --confirm
```
Using `runtime: docker` (Render has no native `bun` runtime — confirmed against the render-deploy skill's runtime list) sidesteps another "does this runtime actually have bun" guess, which is exactly what caused today's failure.

**`Dockerfile`:**
```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app
COPY package.json ./
RUN bun install
COPY . .
EXPOSE 3000
CMD ["bun", "run", "server.ts"]
```

**Env vars** (this CLI build has no `env-vars` subcommand — confirmed): use the `render-env-vars` skill if it can reach this service at execution time; otherwise manual Dashboard step — `molly` service → Environment → add `ANTHROPIC_API_KEY` (secret, required) and `HALO_SHARED_SECRET` (secret, optional) → Save (auto-redeploys).

**`render.yaml`** (Blueprint reference, kept in the app folder for future use):
```yaml
services:
  - type: web
    name: molly
    runtime: docker
    branch: halo-web-prototype
    rootDir: apps/halo-prototype
    dockerfilePath: ./Dockerfile
    plan: free
    healthCheckPath: /
    envVars:
      - key: ANTHROPIC_API_KEY
        sync: false
      - key: HALO_SHARED_SECRET
        sync: false
```

## 6. Documentation

- `HALO_DEPLOYMENT.md` (root) gets a new top status section distinguishing the two Halo efforts: this browser prototype (live, working) vs. `apps/halo-edge` (future phase, non-functional today) — existing content about `apps/halo-edge` stays below, untouched.
- `apps/halo-prototype/README.md` — setup, API contract, env vars, deploy notes, and the path-to-real-hardware note below.

## 7. Path to real hardware (unchanged later)

```
Halo Lua (frame.camera.capture()) → BLE → Python host bridge
   → POST https://molly-gz19.onrender.com/api/describe {image, mode}
   ← {text}
   → frame.display.text(...) styled to mimic the same green-HUD-card look
```
Button press replaces spacebar count; `frame.display.*` replaces DOM rendering. The vision call, prompts, and response shape are validated now, in the browser — this prototype **is** the real prototype, not throwaway.

## 8. Verification

**Local:**
```bash
cd apps/halo-prototype && bun install
bun test                 # lib/anthropic.test.ts
ANTHROPIC_API_KEY=sk-... bun run server.ts
# open http://localhost:3000 — camera prompt, live feed, HUD stat line populates
# space x1 → "thinking" → ambient description appears
# space x2 → read-mode response
# space x3 → "coming soon" toast, confirm no network call in devtools
```

**Live (after Render redeploys):**
```bash
curl -sI https://molly-gz19.onrender.com/                # expect 200
curl -s -X POST https://molly-gz19.onrender.com/api/describe \
  -H "content-type: application/json" -d '{"image":"<test-base64>","mode":"ambient"}'
render deploys list srv-d9td6t2jobas73cmbf3g -o json | head -5   # expect status: "live"
```
Open the Render URL on a **phone browser** (real camera, real HTTPS) and run the full space x1/x2/x3 flow — closest available proxy to "what I'll see through the glasses" before hardware arrives.

Confirm `main` untouched: `git diff main origin/main` empty.

## Critical files
`apps/halo-prototype/{server.ts, lib/anthropic.ts, public/client.ts, public/index.html, public/styles.css, Dockerfile, package.json, README.md}`, `HALO_DEPLOYMENT.md`
