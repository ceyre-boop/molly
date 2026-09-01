// Teleprompter layout + scroll engine.
//
// Everything here is pure so the readability question — "is a script legible
// on a 256px circular monocular display while you're speaking to a room?" —
// can be answered by tests and by the browser prototype using the same code.

export type DisplayProfile = {
  id: string
  label: string
  /** Physical display width in device pixels. */
  width: number
  height: number
  /** Circular displays lose usable width at the top and bottom of the frame. */
  shape: "circle" | "rect"
}

/** Halo's exact panel geometry is unconfirmed until the hardware lands, so the
 *  256px circle from the halo-prototype HUD notes is the pessimistic default
 *  and the wider profiles bracket the plausible range. */
export const DISPLAY_PROFILES: DisplayProfile[] = [
  { id: "halo-256", label: "Halo 256×256 circular (assumed)", width: 256, height: 256, shape: "circle" },
  { id: "halo-400", label: "Halo 400×400 circular (optimistic)", width: 400, height: 400, shape: "circle" },
  { id: "frame-640", label: "Frame 640×400 rectangular", width: 640, height: 400, shape: "rect" },
]

export function profileById(id: string): DisplayProfile {
  return DISPLAY_PROFILES.find((p) => p.id === id) ?? DISPLAY_PROFILES[0]
}

/**
 * Usable horizontal width for a text line occupying the vertical band
 * [yTop, yBottom] measured in pixels from the top of the display.
 *
 * On a circle the chord narrows away from the centre, so a line's capacity is
 * set by whichever of its two edges sits furthest from the vertical centre.
 */
export function usableWidthAt(profile: DisplayProfile, yTop: number, yBottom: number): number {
  if (profile.shape === "rect") return profile.width

  const r = Math.min(profile.width, profile.height) / 2
  const cy = profile.height / 2
  const worstOffset = Math.max(Math.abs(yTop - cy), Math.abs(yBottom - cy))
  if (worstOffset >= r) return 0
  return 2 * Math.sqrt(r * r - worstOffset * worstOffset)
}

/** Mean advance width of a character, as a fraction of font size. ~0.55 for a
 *  condensed sans at HUD weights; measured in the browser and passed in there. */
export const DEFAULT_CHAR_RATIO = 0.55

export function charsPerLine(usableWidth: number, fontPx: number, charRatio = DEFAULT_CHAR_RATIO): number {
  return Math.max(0, Math.floor(usableWidth / (fontPx * charRatio)))
}

export function tokenize(script: string): string[] {
  return script.trim().split(/\s+/).filter(Boolean)
}

/**
 * Greedy word wrap where each line may have a different capacity — required for
 * circular displays, where line 0 is far narrower than the line at the centre.
 *
 * `capacityFor(lineIndex)` returns the character budget for that line. Words
 * longer than their line's budget are hard-broken rather than silently dropped.
 */
export function wrapScript(script: string, capacityFor: (lineIndex: number) => number): string[] {
  const words = tokenize(script)
  const lines: string[] = []
  let current = ""
  let guard = 0

  for (let i = 0; i < words.length; ) {
    const cap = Math.max(1, capacityFor(lines.length))
    const word = words[i]

    if (word.length > cap) {
      // Hard-break an over-long token across lines rather than losing it.
      if (current) { lines.push(current); current = ""; continue }
      lines.push(word.slice(0, cap))
      words[i] = word.slice(cap)
      if (++guard > 100000) break
      continue
    }

    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= cap) { current = candidate; i++; continue }

    lines.push(current)
    current = ""
  }

  if (current) lines.push(current)
  return lines
}

export type TextViewport = {
  /** Width available to text, after padding, in device pixels. */
  width: number
  height: number
  visibleLines: number
  charsPerLine: number
}

/**
 * The text box a circular display can actually hold.
 *
 * A circle has no usable width at its very top and bottom, so text lives in a
 * centred rectangle inscribed in the disc. Showing more lines at once forces
 * that rectangle taller, which forces it narrower — the core trade the
 * prototype exists to make visible.
 */
export function textViewport(
  profile: DisplayProfile,
  lineHeightPx: number,
  visibleLines: number,
  opts: { padding?: number; fontPx: number; charRatio?: number },
): TextViewport {
  const padding = opts.padding ?? 4
  const lines = Math.max(1, Math.floor(visibleLines))
  const height = Math.min(profile.height - padding * 2, lines * lineHeightPx)
  const cy = profile.height / 2
  const width = Math.max(0, usableWidthAt(profile, cy - height / 2, cy + height / 2) - padding * 2)

  return {
    width,
    height,
    visibleLines: lines,
    charsPerLine: charsPerLine(width, opts.fontPx, opts.charRatio),
  }
}

export type Layout = {
  lines: string[]
  totalWords: number
  avgWordsPerLine: number
  /** How many wrapped lines are on the display at once. */
  linesVisible: number
  lineHeightPx: number
  viewport: TextViewport
  verdict: Verdict
}

export type Verdict = "unusable" | "ticker" | "workable" | "comfortable"

/** The whole point of the prototype: turn words-per-line into a go/no-go call. */
export function readabilityVerdict(avgWordsPerLine: number): Verdict {
  if (avgWordsPerLine < 2) return "unusable"
  if (avgWordsPerLine < 3.5) return "ticker"
  if (avgWordsPerLine < 6) return "workable"
  return "comfortable"
}

export const VERDICT_NOTE: Record<Verdict, string> = {
  unusable: "Fewer than 2 words a line. You are reading one word at a time — no phrasing survives.",
  ticker: "2-3 words a line. A word ticker, not a script. Usable for cue words only.",
  workable: "3-6 words a line. Readable in short phrases; expect a choppy delivery.",
  comfortable: "6+ words a line. Full phrases land - this reads like a real teleprompter.",
}

export function layoutScript(
  script: string,
  profile: DisplayProfile,
  opts: { fontPx: number; lineSpacing?: number; padding?: number; charRatio?: number; visibleLines?: number },
): Layout {
  const lineSpacing = opts.lineSpacing ?? 1.25
  const lineHeightPx = opts.fontPx * lineSpacing
  const viewport = textViewport(profile, lineHeightPx, opts.visibleLines ?? 3, opts)

  const cap = Math.max(1, viewport.charsPerLine)
  const lines = wrapScript(script, () => cap)
  const totalWords = tokenize(script).length
  const avgWordsPerLine = lines.length ? totalWords / lines.length : 0

  return {
    lines,
    totalWords,
    avgWordsPerLine,
    linesVisible: viewport.visibleLines,
    lineHeightPx,
    viewport,
    verdict: readabilityVerdict(avgWordsPerLine),
  }
}

export const MIN_WPM = 60
export const MAX_WPM = 240
export const WPM_STEP = 10

export function clampWpm(wpm: number): number {
  return Math.min(MAX_WPM, Math.max(MIN_WPM, Math.round(wpm)))
}

/** Continuous scroll rate. Line-stepping reads worse than a smooth crawl. */
export function pixelsPerSecond(wpm: number, avgWordsPerLine: number, lineHeightPx: number): number {
  if (avgWordsPerLine <= 0) return 0
  const linesPerSecond = wpm / 60 / avgWordsPerLine
  return linesPerSecond * lineHeightPx
}

export function estimateDurationSec(totalWords: number, wpm: number): number {
  if (wpm <= 0) return 0
  return (totalWords / wpm) * 60
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export type RingAction = "faster" | "slower" | "toggle" | "back" | "forward" | "restart"

/**
 * BLE HID "page turner" rings enumerate as keyboards. The cheap ones emit arrow
 * keys, page up/down, space or enter — media keys never reach the page, so they
 * are deliberately absent here. Every binding below is a key a browser sees.
 */
export const RING_BINDINGS: Record<string, RingAction> = {
  ArrowUp: "faster",
  PageUp: "faster",
  "+": "faster",
  "=": "faster",
  ArrowDown: "slower",
  PageDown: "slower",
  "-": "slower",
  " ": "toggle",
  Enter: "toggle",
  k: "toggle",
  ArrowLeft: "back",
  ArrowRight: "forward",
  Home: "restart",
  r: "restart",
}

export function resolveRingAction(key: string): RingAction | null {
  return RING_BINDINGS[key] ?? RING_BINDINGS[key.toLowerCase()] ?? null
}

export type PrompterState = {
  wpm: number
  running: boolean
  /** Scroll offset in pixels from the top of the wrapped script. */
  offset: number
}

export function applyRingAction(
  state: PrompterState,
  action: RingAction,
  layout: Pick<Layout, "lineHeightPx" | "lines">,
): PrompterState {
  const maxOffset = Math.max(0, layout.lines.length * layout.lineHeightPx)
  switch (action) {
    case "faster":
      return { ...state, wpm: clampWpm(state.wpm + WPM_STEP) }
    case "slower":
      return { ...state, wpm: clampWpm(state.wpm - WPM_STEP) }
    case "toggle":
      return { ...state, running: !state.running }
    case "back":
      return { ...state, offset: Math.max(0, state.offset - layout.lineHeightPx) }
    case "forward":
      return { ...state, offset: Math.min(maxOffset, state.offset + layout.lineHeightPx) }
    case "restart":
      return { ...state, offset: 0, running: false }
  }
}

export function advance(
  state: PrompterState,
  deltaSeconds: number,
  layout: Pick<Layout, "lineHeightPx" | "lines" | "avgWordsPerLine">,
): PrompterState {
  if (!state.running) return state
  const maxOffset = Math.max(0, layout.lines.length * layout.lineHeightPx)
  const next = state.offset + pixelsPerSecond(state.wpm, layout.avgWordsPerLine, layout.lineHeightPx) * deltaSeconds
  if (next >= maxOffset) return { ...state, offset: maxOffset, running: false }
  return { ...state, offset: next }
}
