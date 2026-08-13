# Noa Gap Protocol — What To Do When the Halo Glasses Arrive

Do **not** build anything glasses-facing first. Live with stock Noa for several
days and let empirical gaps — not guesses — define what Molly needs to cover.

## Days 1–3: Stock Noa only

Use Noa for everything you'd instinctively want Molly for. Log every failure or
friction moment in this file (or NEXT.md), tagged by category:

### 1. Identity
- Does Noa's "Narrative" memory ever tell you *who* someone is, or only that
  you've "seen this presence N times"?
- Moments where you wanted: "that's Marco from TABOOST, you last spoke about X"
  and got an anonymous embedding count instead.

### 2. Cross-account tasks
- Anything requiring Gmail, Calendar, HealthKit, Sovereign alerts, dashboards.
- Noa is sandboxed to what the glasses see/hear + its own cloud. Log every
  "check my calendar / any urgent email / how did the portfolio do" miss.

### 3. Continuity
- Does Noa remember yesterday's conversations usefully?
- Moments where you wanted one entity across Telegram + desktop + glasses and
  Noa restarted as a general-purpose assistant.

### 4. Authority
- Anything you wanted *done* (reply, book, buy, confirm) rather than answered.
- Noa has no concept of free-action vs confirm-first governance over real
  accounts.

## Also test immediately: Vibe Mode as scaffolding generator

Ask Noa/Vibe Mode to voice-generate pieces of the Molly bridge itself:
- A minimal app that POSTs what the camera sees to a URL (the spine's endpoint)
- A display app that renders text pushed from a URL
- If it can vibe-code a maps app from a prompt, it may cover a chunk of the old
  Phase-4 iOS bridge before a line of Swift is written.

Log what it can and can't generate.

## Exit criteria

After ~3 days, the log here answers: **what is the smallest glasses client that
covers the observed gaps?** That spec — not the old Phase 4–7 roadmap — drives
the next build. The spine (`apps/spine/`) will already be running by then; the
glasses client is just another surface talking to it.
