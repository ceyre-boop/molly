import {
  DISPLAY_PROFILES,
  profileById,
  layoutScript,
  advance,
  applyRingAction,
  resolveRingAction,
  clampWpm,
  estimateDurationSec,
  formatDuration,
  VERDICT_NOTE,
  DEFAULT_CHAR_RATIO,
  type Layout,
  type PrompterState,
} from "../lib/prompter"

const SAMPLE = `Good morning. I want to make one argument, and I want to make it quickly.
We keep rebuilding things that already ship in the box. The glasses already describe a scene. They already answer a question out loud. What they cannot do is know who you are, reach your calendar, or act on your accounts with your authority.
So the smallest useful client is not another assistant. It is a bridge. It carries identity in, and it carries a decision back out.
That is the whole build. Everything else is a distraction we can afford to skip.`

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const els = {
  frame: $<HTMLDivElement>("frame"),
  frameScale: $<HTMLDivElement>("frame-scale"),
  viewport: $<HTMLDivElement>("viewport"),
  script: $<HTMLDivElement>("script"),
  empty: $<HTMLDivElement>("empty"),
  frameCaption: $<HTMLSpanElement>("frame-caption"),
  badge: $<HTMLSpanElement>("verdict-badge"),
  note: $<HTMLSpanElement>("verdict-note"),
  wpl: $<HTMLElement>("stat-wpl"),
  cpl: $<HTMLElement>("stat-cpl"),
  lines: $<HTMLElement>("stat-lines"),
  words: $<HTMLElement>("stat-words"),
  runtime: $<HTMLElement>("stat-runtime"),
  remaining: $<HTMLElement>("stat-remaining"),
  toggle: $<HTMLButtonElement>("toggle"),
  restart: $<HTMLButtonElement>("restart"),
  wpmReadout: $<HTMLOutputElement>("wpm-readout"),
  input: $<HTMLTextAreaElement>("script-input"),
  file: $<HTMLInputElement>("file"),
  sample: $<HTMLButtonElement>("sample"),
  profile: $<HTMLSelectElement>("profile"),
  font: $<HTMLInputElement>("font"),
  fontOut: $<HTMLOutputElement>("font-out"),
  linesCtl: $<HTMLInputElement>("lines"),
  linesOut: $<HTMLOutputElement>("lines-out"),
  zoom: $<HTMLInputElement>("zoom"),
  zoomOut: $<HTMLOutputElement>("zoom-out"),
  wpm: $<HTMLInputElement>("wpm"),
  wpmOut: $<HTMLOutputElement>("wpm-out"),
  lastKey: $<HTMLParagraphElement>("last-key"),
}

const settings = {
  profileId: "halo-256",
  fontPx: 22,
  visibleLines: 3,
  zoom: 2,
}

let state: PrompterState = { wpm: 140, running: false, offset: 0 }
let layout: Layout = layoutScript("", profileById(settings.profileId), { fontPx: 22 })

/** Measure the real average character advance for the HUD font at this size,
 *  so the layout maths matches what the browser will actually paint. */
const measureCanvas = document.createElement("canvas")
function measureCharRatio(fontPx: number): number {
  const ctx = measureCanvas.getContext("2d")
  if (!ctx) return DEFAULT_CHAR_RATIO
  const family = getComputedStyle(els.script).fontFamily || "monospace"
  ctx.font = `600 ${fontPx}px ${family}`
  const sample = "the quick brown fox jumps over a lazy dog, 0123456789."
  return ctx.measureText(sample).width / sample.length / fontPx
}

function relayout() {
  const profile = profileById(settings.profileId)
  const charRatio = measureCharRatio(settings.fontPx)

  layout = layoutScript(els.input.value, profile, {
    fontPx: settings.fontPx,
    visibleLines: settings.visibleLines,
    charRatio,
  })

  els.frame.classList.toggle("circle", profile.shape === "circle")
  els.frame.style.width = `${profile.width}px`
  els.frame.style.height = `${profile.height}px`
  els.frame.style.transform = `scale(${settings.zoom})`
  // Reserve the zoomed footprint so the caption below is never overlapped.
  els.frameScale.style.width = `${profile.width * settings.zoom}px`
  els.frameScale.style.height = `${profile.height * settings.zoom}px`

  els.viewport.style.width = `${layout.viewport.width}px`
  els.viewport.style.height = `${layout.viewport.height}px`

  els.script.style.fontSize = `${settings.fontPx}px`
  els.script.style.lineHeight = `${layout.lineHeightPx}px`
  els.script.textContent = layout.lines.join("\n")

  const hasScript = layout.lines.length > 0
  els.empty.style.display = hasScript ? "none" : "grid"

  els.frameCaption.textContent =
    `${profile.width}×${profile.height} ${profile.shape} · text box ` +
    `${Math.round(layout.viewport.width)}px · ${layout.viewport.charsPerLine} chars/line · preview ${settings.zoom}×`

  els.badge.textContent = hasScript ? layout.verdict : "—"
  els.badge.dataset.v = hasScript ? layout.verdict : ""
  els.note.textContent = hasScript ? VERDICT_NOTE[layout.verdict] : "Load a script to get a verdict."

  els.wpl.textContent = hasScript ? layout.avgWordsPerLine.toFixed(1) : "—"
  els.cpl.textContent = hasScript ? String(layout.viewport.charsPerLine) : "—"
  els.lines.textContent = hasScript ? String(layout.lines.length) : "—"
  els.words.textContent = hasScript ? String(layout.totalWords) : "—"
  els.runtime.textContent = hasScript ? formatDuration(estimateDurationSec(layout.totalWords, state.wpm)) : "—"

  state.offset = Math.min(state.offset, layout.lines.length * layout.lineHeightPx)
  render()
}

function render() {
  els.script.style.transform = `translateY(${-state.offset}px)`
  els.toggle.textContent = state.running ? "Stop" : "Start"
  els.wpmReadout.textContent = String(state.wpm)
  els.wpmOut.textContent = String(state.wpm)
  els.wpm.value = String(state.wpm)

  const linesLeft = Math.max(0, layout.lines.length - state.offset / layout.lineHeightPx)
  const wordsLeft = linesLeft * layout.avgWordsPerLine
  els.remaining.textContent = layout.lines.length
    ? formatDuration(estimateDurationSec(wordsLeft, state.wpm))
    : "—"
  els.runtime.textContent = layout.lines.length
    ? formatDuration(estimateDurationSec(layout.totalWords, state.wpm))
    : "—"
}

let lastFrame = performance.now()
function tick(now: number) {
  const dt = Math.min(0.25, (now - lastFrame) / 1000)
  lastFrame = now
  if (state.running) {
    state = advance(state, dt, layout)
    render()
  }
  requestAnimationFrame(tick)
}

function fireRing(key: string, label: string) {
  const action = resolveRingAction(key)
  if (!action) return false
  state = applyRingAction(state, action, layout)
  els.lastKey.textContent = `Ring: ${label} → ${action}`
  render()
  return true
}

// ---- wiring ----
els.profile.innerHTML = DISPLAY_PROFILES.map((p) => `<option value="${p.id}">${p.label}</option>`).join("")
els.profile.value = settings.profileId
els.font.value = String(settings.fontPx)
els.linesCtl.value = String(settings.visibleLines)
els.zoom.value = String(settings.zoom)
els.wpm.value = String(state.wpm)
els.fontOut.textContent = String(settings.fontPx)
els.linesOut.textContent = String(settings.visibleLines)
els.zoomOut.textContent = String(settings.zoom)

els.input.addEventListener("input", relayout)
els.sample.addEventListener("click", () => { els.input.value = SAMPLE; relayout() })
els.file.addEventListener("change", async () => {
  const file = els.file.files?.[0]
  if (!file) return
  els.input.value = await file.text()
  relayout()
})

els.profile.addEventListener("change", () => { settings.profileId = els.profile.value; relayout() })
els.font.addEventListener("input", () => {
  settings.fontPx = Number(els.font.value); els.fontOut.textContent = els.font.value; relayout()
})
els.linesCtl.addEventListener("input", () => {
  settings.visibleLines = Number(els.linesCtl.value); els.linesOut.textContent = els.linesCtl.value; relayout()
})
els.zoom.addEventListener("input", () => {
  settings.zoom = Number(els.zoom.value); els.zoomOut.textContent = els.zoom.value; relayout()
})
els.wpm.addEventListener("input", () => { state.wpm = clampWpm(Number(els.wpm.value)); render() })

els.toggle.addEventListener("click", () => { state = { ...state, running: !state.running }; render() })
els.restart.addEventListener("click", () => { state = { ...state, offset: 0, running: false }; render() })

window.addEventListener("keydown", (e) => {
  // Never swallow keystrokes meant for the script box or a slider.
  const target = e.target as HTMLElement | null
  if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
  if (fireRing(e.key, e.key === " " ? "Space" : e.key)) e.preventDefault()
})

els.input.value = SAMPLE
relayout()
requestAnimationFrame(tick)
