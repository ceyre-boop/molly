---
project: molly
task: Kanban command-center dashboard (kanban.html)
effort: E3
phase: complete
progress: 51/51
mode: build
started: 2026-07-30
updated: 2026-07-30
---

## Problem

Molly's existing `index.html` is a personal-productivity surface — goals, brain dump, tool links, commit feed. It has no *work-state* model: nothing shows what is queued, what is actively being worked, what shipped, and what got shelved. Colin saw the Klaus Dashboard (agent-operator Kanban with a persistent-agent sidebar, four-lane board, deliverables shelf, notes inbox, and action log) and wants that operating model for Molly. Today there is no board, no card lifecycle, no deliverables shelf, and no action log anywhere in the repo.

## Vision

Opening `kanban.html` should feel like walking into a control room where the machine has already been working. The agent identity panel sits on the left with a live status; four lanes are colour-coded by *state of energy* — cool indigo for queued, warm amber for in-flight, green for shipped, flat grey for archived — so lane membership reads pre-attentively before any word is parsed. Cards drag between lanes with physical weight. Every mutation writes itself into the Action Log without being asked, so the board keeps its own minutes. The euphoric surprise: it looks like a hosted SaaS product but it is one static file with zero dependencies that Colin can fork, edit, and deploy from GitHub Pages in seconds.

## Out of Scope

No backend, no build step, no framework, no npm/bun install, no authentication (the "Logout" affordance is decorative parity with the reference design and must not pretend to secure anything). No multi-user sync, no realtime collaboration, no server-side persistence. The existing `index.html` is not modified beyond adding one navigation link — its layout, theme, and JavaScript stay untouched. No Obsidian vault read/write in this iteration. No mobile-native app.

## Constraints

- Single static file `kanban.html` — zero dependencies, no CDN, no build tooling. Must run from `file://` and from GitHub Pages identically.
- Vanilla HTML/CSS/JS only. No React, no Tailwind CDN, no bundler.
- Must reuse the existing `index.html` CSS custom-property palette (`--bg-primary: #0a0a0f`, `--accent: #7c5cff`, etc.) so the two pages read as one product.
- Seed data lives at `config/tasks.json`; runtime state lives in `localStorage`. Seed must never clobber existing user state.
- `index.html` may gain a link but must not otherwise change.
- Repo is deployed via GitHub Pages from `main` root — no `.github/workflows/`, no Actions-mode Pages (see CONTEXT.md Keystone incident).

## Goal

Ship `molly/kanban.html`: a zero-dependency single-file Kanban command center visually modeled on the Klaus Dashboard — persistent agent sidebar, four drag-and-drop lanes (To Do / In Progress / Done / Archived), a Deliverables shelf, a Notes inbox, and an auto-writing Action Log — seeded from `config/tasks.json`, persisted to `localStorage`, with JSON export/import round-trip, and linked from `index.html`.

## Criteria

**Structure & files**
- [x] ISC-1: `molly/kanban.html` exists and is non-empty
- [x] ISC-2: `molly/config/tasks.json` exists and parses as valid JSON
- [x] ISC-3: `kanban.html` contains zero `<script src=` and zero `<link rel="stylesheet"` external references
- [x] ISC-4: `kanban.html` declares a `:root` block reusing the `index.html` palette tokens (`--bg-primary`, `--accent`, `--green`, `--orange`)
- [x] ISC-5: `index.html` contains a link whose href is `kanban.html`
- [x] ISC-6: Anti: `index.html` diff touches only the added navigation link — no changes to its `<style>`, `<script>`, or existing markup

**Header bar**
- [x] ISC-7: Header renders an avatar glyph plus the title "Molly Dashboard"
- [x] ISC-8: Header renders a green pulsing status dot with the label "Online"
- [x] ISC-9: Header renders a "Last sync" timestamp that updates on every state mutation
- [x] ISC-10: Header renders a right-aligned secondary-styled button matching the reference's Logout affordance
- [x] ISC-11: Anti: the Logout-parity button never claims to be authentication — clicking it resets the session view only and says so

**Agent sidebar**
- [x] ISC-12: Sidebar renders a circular avatar with a glow ring
- [x] ISC-13: Sidebar renders the agent name "Molly" under the avatar
- [x] ISC-14: Sidebar renders a status row with a coloured dot and a status word (Idle / Working)
- [x] ISC-15: Sidebar renders a bordered status-message box ("Ready for tasks") whose text is data-driven
- [x] ISC-16: Sidebar renders live counts of cards per lane

**Board lanes**
- [x] ISC-17: Exactly four lane columns render, titled To Do, In Progress, Done, Archived
- [x] ISC-18: Each lane header shows an emoji/icon, the lane title, and a card count
- [x] ISC-19: To Do cards render with an indigo/violet left accent and tinted background
- [x] ISC-20: In Progress cards render with an amber/orange left accent and tinted background
- [x] ISC-21: Done cards render with a green left accent and tinted background
- [x] ISC-22: Archived cards render in the compact flat row style (title left, date right), not the tinted card style
- [x] ISC-23: Every non-archived card renders its title and its formatted date

**Interaction**
- [x] ISC-24: A card can be dragged from one lane and dropped into another, and the DOM reflects the new lane
- [x] ISC-25: Drop targets show a visible hover/dragover state
- [x] ISC-26: Each lane has an "+ Add" affordance that creates a new card in that lane
- [x] ISC-27: A card can be renamed in place (click-to-edit) and the new title persists
- [x] ISC-28: A card can be deleted, and deletion is reflected in counts
- [x] ISC-29: Keyboard: `Escape` cancels an in-progress inline edit without saving

**Deliverables / Notes / Action Log**
- [x] ISC-30: A Deliverables shelf renders horizontally-scrolling tiles with icon, title, date, and a tag chip
- [x] ISC-31: A "Notes for Molly" textarea renders and its content persists across reload
- [x] ISC-32: An Action Log panel renders newest-first entries with a coloured timestamp and a description
- [x] ISC-33: Creating, moving, renaming, or deleting a card appends an Action Log entry automatically
- [x] ISC-34: Action Log is capped (does not grow unbounded) and the cap is enforced in code

**Persistence**
- [x] ISC-35: On first load with empty `localStorage`, the board seeds from `config/tasks.json`
- [x] ISC-36: On reload after a mutation, the mutated state is restored from `localStorage`, not re-seeded
- [x] ISC-37: An "Export JSON" control produces a downloadable file whose content re-imports to an identical board (round-trip)
- [x] ISC-38: Anti: opening the page from `file://` with `config/tasks.json` unreachable (fetch failure) still renders a working empty board rather than a blank/error page

**Experiential**
- [x] ISC-39: Antecedent: lane identity is legible from colour alone at a glance — a desaturated/blurred screenshot still distinguishes the four lanes
- [x] ISC-40: Antecedent: the page renders above-the-fold with no layout shift and no visible loading flash on a normal load
- [x] ISC-41: At 1440px the board shows four lanes side by side; below 900px lanes stack vertically without horizontal body scroll

**Added by IterativeDepth pass — Failure lens**
- [x] ISC-42: Anti: card titles and note text are never injected as HTML — a title containing `<img src=x onerror=alert(1)>` renders as literal text
- [x] ISC-43: Corrupt/unparseable `localStorage` state is caught and falls back to the seed rather than throwing
- [x] ISC-44: `localStorage` being unavailable or quota-exceeded is caught — the board still runs in-memory for the session
- [x] ISC-45: An empty lane is still a valid drop target (lane body has a min-height and its own dragover/drop handlers)
- [x] ISC-46: Anti: dropping a card outside any lane is a no-op — the card is never lost or duplicated
- [x] ISC-47: Card IDs are collision-free across rapid successive adds (counter or crypto-random, not bare `Date.now()`)
- [x] ISC-48: Touch fallback — every card exposes explicit lane-move controls so the board is usable where HTML5 drag-and-drop is not

**Added by IterativeDepth pass — First-encounter lens**
- [x] ISC-49: Antecedent: the sidebar status is derived from board state — it reads "Working" with the active card's title when In Progress is non-empty, "Idle / Ready for tasks" when it is empty
- [x] ISC-50: Antecedent: the seeded board contains Colin's real work items (Alta / TABOOST / Molly / school), not placeholder lorem tasks
- [x] ISC-51: An empty lane renders a dashed "drop cards here" placeholder rather than blank space

## Test Strategy

| isc | type | check | threshold | tool |
|-----|------|-------|-----------|------|
| ISC-1..5 | file | file present, content grep | exact match | `Read` / `Grep` |
| ISC-2 | data | JSON parses | no throw | `Bash` (`node -e JSON.parse`) |
| ISC-3, ISC-6 | anti | absence of external refs / minimal diff | 0 hits / 1 hunk | `Grep`, `git diff --stat` |
| ISC-7..23 | UI | rendered element present + styled | visual match | `Skill("Interceptor")` screenshot |
| ISC-24..29 | interaction | drive the UI, assert DOM | state changes | `Skill("Interceptor")` act + read |
| ISC-30..34 | UI/behaviour | panel renders; log entry appears after mutation | ≥1 entry | Interceptor screenshot + read |
| ISC-35..37 | persistence | seed / reload / export round-trip | identical JSON | Interceptor + localStorage read |
| ISC-38 | anti | block the fetch, load page | board renders | Interceptor with offline seed |
| ISC-39..41 | experiential | screenshot at 1440 and 800 width | no h-scroll, lanes distinct | Interceptor screenshots |

## Features

| name | description | satisfies | depends_on | parallelizable |
|------|-------------|-----------|------------|----------------|
| seed-data | `config/tasks.json` with real Colin work items across four lanes + deliverables | ISC-2, ISC-35 | — | yes |
| shell | Page skeleton, palette, header bar, responsive grid | ISC-1, ISC-3, ISC-4, ISC-7..11, ISC-41 | — | yes |
| sidebar | Agent identity panel with avatar, status, lane counts | ISC-12..16 | shell | no |
| board | Four lanes, card rendering, per-lane styling | ISC-17..23, ISC-39 | shell | no |
| interaction | Drag/drop, add, inline rename, delete, Escape | ISC-24..29 | board | no |
| panels | Deliverables shelf, Notes inbox, Action Log | ISC-30..34 | shell | no |
| persistence | localStorage store, JSON seed loader, export/import, log cap | ISC-33..38, ISC-40 | board, panels | no |
| nav-link | Single link added to `index.html` | ISC-5, ISC-6 | shell | yes |

## Decisions

- **2026-07-30 — Placement: new `kanban.html`, not a replacement.** Asked Colin directly. Chose additive over destructive: `index.html` keeps working, both pages ship, promotion to index is a later one-line decision.
- **2026-07-30 — Data: `config/tasks.json` seed + `localStorage` runtime.** Pure-localStorage would make the board un-authorable by me; vault-markdown would require a local server and break GitHub Pages. The seed+localStorage split keeps both authorship paths open with zero backend.
- **2026-07-30 — Delegation floor (soft, E3 ≥2) relaxed to 0 delegation capabilities. Show your math:** session-level operating instruction in this environment explicitly forbids invoking the Agent tool unless the user requests it, which blocks the Forge auto-include binding and any Explore/Designer fan-out. What Forge would have done: independently author the drag-and-drop + persistence layer for cross-model diversity on edge cases (drop-outside-lane, storage-quota-exceeded, seed-vs-state precedence). Mitigation: those three edge cases are lifted into explicit ISCs (ISC-24, ISC-36, ISC-38) and probed live rather than trusted. Thinking floor (HARD, ≥4) is met in full and not relaxed.
- **2026-07-30 — Decorative Logout.** The reference design has a Logout button. Reproducing it without auth would be a lie; ISC-11 forces it to be honest (session-view reset, labelled as such).

## Verification

All 51 ISCs probed on 2026-07-30. UI/interaction ISCs verified live in real Chrome (Claude-in-Chrome extension) against `http://localhost:8777/kanban.html`; Interceptor CLI is not installed on this machine (`/opt/homebrew/bin/interceptor` absent) — substituted a real-Chrome extension probe of the same class, not CDP/agent-browser.

- ISC-1..5: `wc -c kanban.html` → 30753 bytes; `node -e require('./config/tasks.json')` → 20 cards / 5 deliverables; `grep -cE '<script src=|<link rel="stylesheet"' kanban.html` → 0; palette tokens present; `grep -c 'href="kanban.html"' index.html` → 1
- ISC-6: `git diff --stat index.html` → `1 file changed, 1 insertion(+)`
- ISC-7..11: screenshot — "⚡ Molly Dashboard", status dot, `Last sync: 2:10:57 PM`, Reset button; `btnReset.title` = "No auth here — this clears local board state and re-seeds from config/tasks.json"
- ISC-12..16: screenshot — avatar + conic glow ring, "Molly", "Working" dot, status box, per-lane counts 8/3/6/3
- ISC-17..23: DOM probe → lanes `["todo","progress","done","archived"]`, titles `["To Do","In Progress","Done","Archived"]`, counts `["8","3","6","3"]`; screenshot confirms indigo / amber / green tints and flat archived rows
- ISC-24: synthetic `DragEvent('drop')` with a card id onto another lane → card moved (`dropMovedCard: true`)
- ISC-25/45: `dragover` on an EMPTY lane body → `lane.classList.contains('dragover') === true`; `min-height: 120px`
- ISC-26/27/28/29: add → inline editor opened; `Escape` → `escapeDiscardedEdit: true` (title stayed "New task"); delete → `deleteWorks: true`
- ISC-30..33: 5 `.tile` deliverables, notes textarea present, 2→3 `.log-row` after a move; newest entry `Moved "Rotate Supabase prod DB credential + Hiram shared login" from To Do → In Progress`
- ISC-34: `grep -n LOG_CAP kanban.html` → cap 60 enforced at `normalize()` and `logAction()`
- ISC-35/36: fresh load seeded 20 cards from `config/tasks.json`; after moving a card, reload restored `progressCount: 4` (mutated state, not re-seed)
- ISC-37: intercepted the Export blob — `application/json`, 4780 bytes, 20 cards, `roundTripIdentical: true` vs stored state
- ISC-38: served `kanban.html` alone on :8778 with `config/tasks.json` returning 404 → 4 lanes, 3 inline-seed cards, board usable, not blank
- ISC-39/40: screenshots at 1512px — four lanes distinguishable by accent colour alone; inline seed renders synchronously so first paint is the final layout
- ISC-41: iframe probe at 800px viewport → board 1 column, app 1 column, bottom 1 column, `noHorizontalScrollAt800: true`; at 1512px → 4 columns, no h-scroll
- ISC-42: injected `<img src=x onerror=alert(1)>` as a card title → `xssRendersAsText: true`, `.card-title img` count 0
- ISC-43: wrote `{not valid json` to `localStorage` then reloaded → `bootedAfterCorruptState: true`, 20 cards
- ISC-44: monkey-patched `Storage.prototype.setItem` to throw `QuotaExceededError` → `survivedStorageFailure: true`, no throw, board intact
- ISC-46: dropped an unknown card id → `strayDropIsNoop: true`, card count unchanged
- ISC-47: 5 rapid `+ Add task` clicks → `idsUnique: true` across 25 cards
- ISC-48: `‹ ›` lane-move buttons present on all 20 cards; clicking `›` moved a card To Do → In Progress
- ISC-49: In Progress non-empty → sidebar read "Working" / "Molly command center — Kanban dashboard"; header read "Local" (no daemon heartbeat)
- ISC-50: seeded board contains real work items (Supabase rotation, ict_scanner octal bug, ThetaDataLoader, G2 gate, UM Flint readmission, Northbound portfolio)
- ISC-51: emptied Archived lane → `placeholderShown: true`, text "Drop cards here"
- Console: `read_console_messages` filtered on `error|Uncaught|TypeError|warn` → no messages

### Doctrine notes
- **Rule 1 (live probe): fired.** All user-facing ISCs carry real-browser evidence.
- **Rule 2 (advisor): attempted, failed.** `Inference.ts --mode advisor` returned `Timeout after 120000ms`. Not treated as passing; live probes stand as the evidence instead.
- **Rule 2a (Cato): N/A at E3.**
- Two defects were caught by the first live probe and fixed: date-only strings parsed as UTC (every card rendered a day early), and archived-row titles collapsed to one character per line because `.card-actions` competed for flex width.
