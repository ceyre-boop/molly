// Spec coverage:
//   1. circular displays narrow away from centre — top band < centre band
//   2. wrapping never drops or duplicates a word, even for over-long tokens
//   3. the 256px circle really does land in "ticker" territory (the go/no-go)
//   4. ring keys map to actions and mutate state within clamps
//   5. scroll advances at the requested WPM and stops at the end
import { describe, test, expect } from "bun:test"
import {
  DISPLAY_PROFILES,
  profileById,
  usableWidthAt,
  charsPerLine,
  textViewport,
  tokenize,
  wrapScript,
  layoutScript,
  readabilityVerdict,
  clampWpm,
  pixelsPerSecond,
  estimateDurationSec,
  formatDuration,
  resolveRingAction,
  applyRingAction,
  advance,
  MIN_WPM,
  MAX_WPM,
  type PrompterState,
} from "./prompter"

const halo = profileById("halo-256")
const frame = profileById("frame-640")

const SCRIPT =
  "Good morning. Today I want to talk about why the smallest client wins, " +
  "and why we should not rebuild what already ships in the box."

describe("display geometry", () => {
  test("circle narrows away from the vertical centre", () => {
    const centre = usableWidthAt(halo, 124, 132)
    const top = usableWidthAt(halo, 0, 16)
    expect(centre).toBeGreaterThan(top)
    expect(centre).toBeCloseTo(256, 0)
  })

  test("circle yields zero width outside the disc", () => {
    expect(usableWidthAt(halo, -40, -20)).toBe(0)
  })

  test("rectangular displays keep full width at every band", () => {
    expect(usableWidthAt(frame, 0, 16)).toBe(640)
    expect(usableWidthAt(frame, 190, 206)).toBe(640)
  })

  test("charsPerLine floors and never goes negative", () => {
    expect(charsPerLine(100, 20, 0.5)).toBe(10)
    expect(charsPerLine(0, 20, 0.5)).toBe(0)
  })

  test("every shipped profile resolves, unknown ids fall back to the pessimistic one", () => {
    for (const p of DISPLAY_PROFILES) expect(profileById(p.id).id).toBe(p.id)
    expect(profileById("nope").id).toBe("halo-256")
  })
})

describe("wrapping", () => {
  test("preserves every word in order", () => {
    const lines = wrapScript(SCRIPT, () => 18)
    expect(lines.join(" ").split(/\s+/)).toEqual(tokenize(SCRIPT))
  })

  test("respects the per-line capacity", () => {
    const lines = wrapScript(SCRIPT, () => 18)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(18)
  })

  test("honours a varying capacity function", () => {
    const lines = wrapScript("aaa bbb ccc ddd eee fff", (i) => (i === 0 ? 3 : 11))
    expect(lines[0]).toBe("aaa")
    expect(lines[1].length).toBeLessThanOrEqual(11)
  })

  test("hard-breaks a token longer than the line rather than dropping it", () => {
    const lines = wrapScript("supercalifragilistic ok", () => 6)
    expect(lines.join("")).toContain("supercalifragilistic")
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(6)
  })

  test("empty script produces no lines", () => {
    expect(wrapScript("   ", () => 10)).toEqual([])
  })
})

describe("layout and the readability verdict", () => {
  test("a 256px circle at a legible font size is a word ticker, not a script", () => {
    const layout = layoutScript(SCRIPT, halo, { fontPx: 22 })
    expect(layout.totalWords).toBe(tokenize(SCRIPT).length)
    expect(layout.avgWordsPerLine).toBeLessThan(3.5)
    expect(layout.verdict).toBe("ticker")
  })

  test("the same script on a 640px rectangle reads comfortably", () => {
    const layout = layoutScript(SCRIPT, frame, { fontPx: 22 })
    expect(layout.avgWordsPerLine).toBeGreaterThan(layoutScript(SCRIPT, halo, { fontPx: 22 }).avgWordsPerLine)
    expect(layout.verdict).toBe("comfortable")
  })

  test("verdict thresholds", () => {
    expect(readabilityVerdict(1.4)).toBe("unusable")
    expect(readabilityVerdict(3)).toBe("ticker")
    expect(readabilityVerdict(4.5)).toBe("workable")
    expect(readabilityVerdict(7)).toBe("comfortable")
  })

  test("linesVisible reflects the requested viewport and fits the display", () => {
    const layout = layoutScript(SCRIPT, halo, { fontPx: 22, visibleLines: 3 })
    expect(layout.linesVisible).toBe(3)
    expect(layout.linesVisible * layout.lineHeightPx).toBeLessThanOrEqual(halo.height)
  })

  test("showing more lines at once narrows the circular viewport", () => {
    const three = layoutScript(SCRIPT, halo, { fontPx: 22, visibleLines: 3 })
    const seven = layoutScript(SCRIPT, halo, { fontPx: 22, visibleLines: 7 })
    expect(seven.viewport.charsPerLine).toBeLessThan(three.viewport.charsPerLine)
  })

  test("a rectangular display keeps full width no matter how many lines show", () => {
    const three = layoutScript(SCRIPT, frame, { fontPx: 22, visibleLines: 3 })
    const seven = layoutScript(SCRIPT, frame, { fontPx: 22, visibleLines: 7 })
    expect(seven.viewport.charsPerLine).toBe(three.viewport.charsPerLine)
  })
})

describe("speed", () => {
  test("wpm clamps to the usable band", () => {
    expect(clampWpm(10)).toBe(MIN_WPM)
    expect(clampWpm(9000)).toBe(MAX_WPM)
    expect(clampWpm(137.4)).toBe(137)
  })

  test("pixelsPerSecond scales with wpm and inversely with words per line", () => {
    const fast = pixelsPerSecond(240, 3, 28)
    const slow = pixelsPerSecond(120, 3, 28)
    expect(fast).toBeCloseTo(slow * 2, 5)
    expect(pixelsPerSecond(120, 6, 28)).toBeCloseTo(slow / 2, 5)
    expect(pixelsPerSecond(120, 0, 28)).toBe(0)
  })

  test("duration estimate and formatting", () => {
    expect(estimateDurationSec(300, 150)).toBe(120)
    expect(formatDuration(120)).toBe("2:00")
    expect(formatDuration(65)).toBe("1:05")
  })
})

describe("ring control", () => {
  const layout = layoutScript(SCRIPT, halo, { fontPx: 22 })
  const base: PrompterState = { wpm: 140, running: false, offset: 0 }

  test("page-turner keys resolve; media keys do not reach the page", () => {
    expect(resolveRingAction("ArrowUp")).toBe("faster")
    expect(resolveRingAction("PageDown")).toBe("slower")
    expect(resolveRingAction(" ")).toBe("toggle")
    expect(resolveRingAction("K")).toBe("toggle")
    expect(resolveRingAction("AudioVolumeUp")).toBeNull()
  })

  test("faster and slower step the wpm within clamps", () => {
    expect(applyRingAction(base, "faster", layout).wpm).toBe(150)
    expect(applyRingAction({ ...base, wpm: MAX_WPM }, "faster", layout).wpm).toBe(MAX_WPM)
    expect(applyRingAction({ ...base, wpm: MIN_WPM }, "slower", layout).wpm).toBe(MIN_WPM)
  })

  test("toggle flips running; restart rewinds and stops", () => {
    expect(applyRingAction(base, "toggle", layout).running).toBe(true)
    const restarted = applyRingAction({ ...base, running: true, offset: 500 }, "restart", layout)
    expect(restarted).toMatchObject({ offset: 0, running: false })
  })

  test("back and forward step exactly one line and clamp at both ends", () => {
    const fwd = applyRingAction(base, "forward", layout)
    expect(fwd.offset).toBeCloseTo(layout.lineHeightPx, 5)
    expect(applyRingAction(base, "back", layout).offset).toBe(0)
  })
})

describe("scroll engine", () => {
  const layout = layoutScript(SCRIPT, halo, { fontPx: 22 })

  test("a paused prompter does not move", () => {
    const state: PrompterState = { wpm: 140, running: false, offset: 12 }
    expect(advance(state, 5, layout)).toEqual(state)
  })

  test("one second of scroll covers one second of speech", () => {
    const state: PrompterState = { wpm: 140, running: true, offset: 0 }
    const next = advance(state, 1, layout)
    expect(next.offset).toBeCloseTo(pixelsPerSecond(140, layout.avgWordsPerLine, layout.lineHeightPx), 5)
  })

  test("scrolling stops at the end of the script instead of running off", () => {
    const state: PrompterState = { wpm: MAX_WPM, running: true, offset: 0 }
    const next = advance(state, 10_000, layout)
    expect(next.running).toBe(false)
    expect(next.offset).toBeCloseTo(layout.lines.length * layout.lineHeightPx, 5)
  })
})

describe("textViewport", () => {
  test("a circle's text box narrows as it grows taller; a rectangle's does not", () => {
    const short = textViewport(halo, 27.5, 2, { fontPx: 22 })
    const tall = textViewport(halo, 27.5, 8, { fontPx: 22 })
    expect(tall.height).toBeGreaterThan(short.height)
    expect(tall.width).toBeLessThan(short.width)
    expect(textViewport(frame, 27.5, 8, { fontPx: 22 }).width).toBe(frame.width - 8)
  })

  test("the text box never exceeds the physical display", () => {
    const vp = textViewport(halo, 27.5, 40, { fontPx: 22 })
    expect(vp.height).toBeLessThanOrEqual(halo.height)
    expect(vp.width).toBeLessThanOrEqual(halo.width)
  })
})
