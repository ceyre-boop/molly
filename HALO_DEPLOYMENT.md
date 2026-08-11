# Halo Deployment

## Status (2026-08-11)

Two Halo-related efforts exist in this repo, at different maturity levels:

### 1. Browser Prototype (LIVE & WORKING NOW)

**Location:** `apps/halo-prototype/` (branch `halo-web-prototype`)

A real, working prototype deployed on Render that simulates the glasses HUD in a browser using `getUserMedia` camera + real Claude Haiku vision calls. **No physical hardware required to test.** Use this to validate the visual style, trigger logic (spacebar counts), and backend prompts before the glasses arrive.

- **Live:** https://molly-gz19.onrender.com
- **Setup:** Read `apps/halo-prototype/README.md`
- **Local test:** `cd apps/halo-prototype && bun install && ANTHROPIC_API_KEY=sk-... bun run server.ts`

### 2. Vercel Edge Scaffold (FUTURE PHASE)

**Location:** Branch `claude/issue-2-20260811-0008` (unmerged)

A scaffold for an "off-laptop reachability" phase (when the physical glasses need to reach Molly while the laptop is closed). Includes heartbeat, cost-capped Anthropic fallback, GitHub-persisted queue. **Non-functional today** (zero real Claude wiring, no Lua, no BLE bridge). See `Plans/build-it-all-right-peaceful-kahan.md` for the full spec. Out of scope for this pass — do not merge without revisiting the voice-first assumptions baked into its shared types.

---

## Edge Function Deployment (Vercel scaffold — future phase)

When you're ready to wire up your Brilliant Halo glasses to the web via the Vercel scaffold, follow these steps to deploy the edge function.

## Quick Start

```bash
# From the molly repo root:
cd apps/halo-edge
vercel deploy --prod
```

This deploys the Halo edge function as a standalone Vercel project. You'll get a live URL like:
```
halo-edge.vercel.app
```

## What Gets Deployed

The edge function at `apps/halo-edge/api/*.ts` handles:
- **Heartbeat/status checks** (glasses → backend, "am I connected?")
- **Task dispatch** (glasses send work to Claude)
- **Response streaming** (Claude thinking → glasses display)
- **Biometric data** (if used) stays local on glasses, never sent to server

## After Deploy

1. **Get the Vercel URL** — shown in the CLI output or check `https://vercel.com/ceyre-boop`
2. **Set environment variables in Vercel:**
   - `ANTHROPIC_API_KEY` — your Claude API key (for on-demand model calls from the edge function)
   - `HALO_SHARED_SECRET` — a secret for glasses to auth with the backend (prevents random people from using your deployment)

3. **Wire the glasses to the URL:**
   - On your Halo device, set `HALO_EDGE_URL` to the Vercel URL you got above
   - Restart the Halo Lua app
   - Glasses should connect

## Local Testing (before prod deploy)

```bash
cd apps/halo-edge

# Run locally on localhost:3000
vercel dev

# In another terminal, test the heartbeat:
curl http://localhost:3000/api/heartbeat

# Test a protocol (e.g., paper OCR — send a base64 JPEG):
curl -X POST http://localhost:3000/api/halo \
  -H "Content-Type: application/json" \
  -d '{
    "protocol": "paper_ocr",
    "image": "data:image/jpeg;base64,...",
    "secret": "your-test-secret"
  }'
```

## Wiring the Glasses

### Environment on Halo device (Lua config)
```lua
-- In your Halo Lua script:
HALO_EDGE_URL = "https://your-deployed-url.vercel.app"
HALO_SHARED_SECRET = "your-secret"
ANTHROPIC_API_KEY = "sk-..." -- or rely on server-side API call
```

### Protocols Ready (Phase 1)

- **Protocol 1 — Paper/Doc → Answer**
  - Trigger: button long-press
  - Glasses capture JPEG → send to edge function → Claude reads → response streams back to display
  - Status: **Scaffolded, ready to wire**

- **Protocol 2 — Facial Recognition** (local-only embedding, no cloud biometrics)
  - Trigger: manual double-press
  - Face embedding → local match against `contacts.db`
  - Status: **Design ready, needs implementation**

- **Protocol 3 — Maps Overlay**
  - Trigger: voice command
  - Phone GPS + routing API → turn arrows on display
  - Status: **Design ready, needs routing service integration**

## Deployment Status

- ✅ **Scaffold complete** — edge function folder exists with API routes
- ✅ **vercel.json** — deployment config ready (`apps/halo-edge/vercel.json`)
- ⏳ **Ready to deploy** — run `vercel deploy --prod` when you want it live
- ⏳ **Protocol 1** — wire up, test, then iterate on Protocols 2 & 3

## Cost

- **Vercel edge function:** ~$0.50–$2/mo (usage-based, pro-rated)
- **Claude API calls:** whatever you use (~$0.003 per 1K tokens for Claude Haiku)
- **No persistent storage** — state resets per request

## Next Steps

1. When ready: `cd apps/halo-edge && vercel deploy --prod`
2. Get the URL, set env vars in Vercel dashboard
3. Set `HALO_EDGE_URL` on your glasses
4. Test Protocol 1 (paper OCR) end-to-end
5. Iterate on protocols 2 & 3 as needed

For questions, check:
- `Plans/build-it-all-right-peaceful-kahan.md` — full Halo architecture spec
- `halo/HALO_ARCHITECTURE.md` — technical details
