# Teleprompter — Halo readability rig

A browser-first teleprompter that renders your script inside the **real panel
geometry** of the glasses, driven by a BLE ring, so one question gets answered
before any hardware money is spent:

> Can you actually read a script on a 256px circular monocular display while
> you're speaking to a room?

The scroll engine is trivial. The display is the risk. This rig isolates the
risk.

## Run it

```bash
cd apps/teleprompter
bun install
bun run server.ts     # → http://localhost:3100
```

No API key, no network calls — everything runs in the browser.

## The experiment

1. Paste your real script (or load a `.txt` / `.md`).
2. Leave the panel on **Halo 256×256 circular** — the pessimistic assumption
   from the halo-prototype HUD notes, until the hardware confirms otherwise.
3. Set the font size you'd need to read at arm's length, and the pace you
   actually speak at.
4. Read it out loud, at that pace, standing up, while looking at someone.

The verdict card gives the go/no-go:

| Words per line | Verdict | What it means |
|---|---|---|
| < 2 | `unusable` | One word at a time. No phrasing survives. |
| 2–3.5 | `ticker` | A word ticker. Cue words only, not a script. |
| 3.5–6 | `workable` | Short phrases. Expect a choppy delivery. |
| 6+ | `comfortable` | Full phrases land. A real teleprompter. |

**The sample script scores 2.8 words/line at 22px — `ticker`.** That is the
finding to argue with, not a placeholder. Push the font down and lines-shown up
and watch what it costs you in legibility.

### Why "lines shown" changes the width

A circle has no usable width at its very top and bottom, so text lives in a
rectangle inscribed in the disc. Asking for more lines at once forces that
rectangle taller, which forces it **narrower**. On a rectangular panel (Frame)
the trade doesn't exist. That coupling is the whole reason a circular HUD reads
worse than its diameter suggests, and the rig makes it visible in real time.

## Ring control

Cheap BLE "page turner" / scroll rings enumerate as **HID keyboards**, so they
need no SDK, no pairing code, and no bridge — they just send keystrokes to
whatever has focus. Click the display, then press (or squeeze):

| Key | Action |
|---|---|
| `↑` `PgUp` `+` | faster (±10 wpm) |
| `↓` `PgDn` `−` | slower |
| `Space` `Enter` `K` | start / stop |
| `←` `→` | back / forward one line |
| `Home` `R` | restart |

Media keys are deliberately unbound: a browser never receives them, so a ring in
"volume" mode will appear dead. Put it in page-turner / camera-shutter mode.

## Path to the real hardware

The layout engine (`lib/prompter.ts`) is pure and display-agnostic, so the same
code drives the glasses once a host bridge exists:

```
BLE HID ring ──keystroke──┐
                          ├─→ host (Web Bluetooth page or Flutter app)
Halo panel ←──text push───┘        uses lib/prompter.ts unchanged
```

Brilliant ships a **Web Bluetooth SDK** alongside Python and Flutter, so the host
can be a web page on a laptop rather than a native iOS app — which is the same
seam `apps/spine/agent/halo-voice-transport.ts` is waiting on. Only the text-push
call changes; nothing in the engine does.

## Verification

```
bun test        → 28 pass, 0 fail
bunx tsc --noEmit → clean
```
