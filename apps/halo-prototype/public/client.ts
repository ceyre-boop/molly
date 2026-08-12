// SILENT BY DESIGN. This prototype never calls SpeechSynthesis or plays audio.
// On real Halo hardware, `text` from /api/describe can optionally be piped to
// Noha's TTS pipeline later — that integration is out of scope here.

// ═════════════════════════════════════════════════════════════════════════════
// DOM Helpers
// ═════════════════════════════════════════════════════════════════════════════

function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing element #${id}`)
  return el
}

// ═════════════════════════════════════════════════════════════════════════════
// Graphics System (Tactical AR Overlays)
// ═════════════════════════════════════════════════════════════════════════════

class TacticalGraphics {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private width: number = 0
  private height: number = 0
  private animationTime: number = 0
  private isAnalyzing: boolean = false
  private mode: "idle" | "ambient" | "read" = "idle"
  private scanLinePosition: number = 0
  private analysisBoxes: Array<{ x: number; y: number; w: number; h: number; pulse: number }> = []
  private confidence: number = 0

  constructor() {
    this.canvas = $("graphics") as HTMLCanvasElement
    const ctx = this.canvas.getContext("2d")
    if (!ctx) throw new Error("Failed to initialize graphics context")
    this.ctx = ctx
    this.resizeCanvas()
    window.addEventListener("resize", () => this.resizeCanvas())
    this.startRenderLoop()
  }

  private resizeCanvas() {
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.canvas.width = this.width
    this.canvas.height = this.height
  }

  private startRenderLoop() {
    const render = () => {
      this.animationTime += 1
      this.ctx.clearRect(0, 0, this.width, this.height)

      if (this.isAnalyzing) {
        this.drawScanLines()
        this.drawDepthLines()
        this.drawAnalysisBoxes()
      }

      if (this.mode !== "idle") {
        this.drawCornerBrackets()
        this.drawConfidenceMeter()
        if (this.mode === "read") {
          this.drawReadModeBorder()
        }
      }

      requestAnimationFrame(render)
    }
    requestAnimationFrame(render)
  }

  private drawScanLines() {
    const lineColor = "rgba(57, 255, 20, 0.15)"
    const lineHeight = 2
    const lineSpacing = 12
    const speed = 2

    this.scanLinePosition = (this.animationTime * speed) % this.height

    this.ctx.fillStyle = lineColor
    for (let y = this.scanLinePosition; y < this.height; y += lineSpacing) {
      this.ctx.fillRect(0, y, this.width, lineHeight)
    }
  }

  private drawCornerBrackets() {
    const bracketSize = 40
    const lineWidth = 2.5
    const color = "rgba(57, 255, 20, 0.8)"

    this.ctx.strokeStyle = color
    this.ctx.lineWidth = lineWidth
    this.ctx.lineCap = "square"

    // Top-left corner
    this.ctx.beginPath()
    this.ctx.moveTo(20, 20 + bracketSize)
    this.ctx.lineTo(20, 20)
    this.ctx.lineTo(20 + bracketSize, 20)
    this.ctx.stroke()

    // Top-right corner
    this.ctx.beginPath()
    this.ctx.moveTo(this.width - 20 - bracketSize, 20)
    this.ctx.lineTo(this.width - 20, 20)
    this.ctx.lineTo(this.width - 20, 20 + bracketSize)
    this.ctx.stroke()

    // Bottom-left corner
    this.ctx.beginPath()
    this.ctx.moveTo(20, this.height - 20 - bracketSize)
    this.ctx.lineTo(20, this.height - 20)
    this.ctx.lineTo(20 + bracketSize, this.height - 20)
    this.ctx.stroke()

    // Bottom-right corner
    this.ctx.beginPath()
    this.ctx.moveTo(this.width - 20 - bracketSize, this.height - 20)
    this.ctx.lineTo(this.width - 20, this.height - 20)
    this.ctx.lineTo(this.width - 20, this.height - 20 - bracketSize)
    this.ctx.stroke()
  }

  private drawAnalysisBoxes() {
    // Generate tactical boxes for different analysis regions (center, sides)
    if (this.analysisBoxes.length === 0) {
      this.analysisBoxes = [
        { x: this.width * 0.1, y: this.height * 0.2, w: this.width * 0.3, h: this.height * 0.3, pulse: 0 },
        { x: this.width * 0.6, y: this.height * 0.2, w: this.width * 0.3, h: this.height * 0.3, pulse: 0.3 },
        { x: this.width * 0.35, y: this.height * 0.55, w: this.width * 0.3, h: this.height * 0.35, pulse: 0.6 },
      ]
    }

    for (const box of this.analysisBoxes) {
      box.pulse = (box.pulse + 0.02) % 1

      const pulse = Math.sin(box.pulse * Math.PI * 2) * 0.3 + 0.7
      const alpha = pulse * 0.5
      const boxColor = `rgba(57, 255, 20, ${alpha})`

      this.ctx.strokeStyle = boxColor
      this.ctx.lineWidth = 2
      this.ctx.strokeRect(box.x, box.y, box.w, box.h)

      // Draw corner indicators
      const cornerSize = 8
      this.ctx.strokeStyle = `rgba(57, 255, 20, ${pulse})`
      this.ctx.lineWidth = 2

      // Top-left
      this.ctx.beginPath()
      this.ctx.moveTo(box.x, box.y + cornerSize)
      this.ctx.lineTo(box.x, box.y)
      this.ctx.lineTo(box.x + cornerSize, box.y)
      this.ctx.stroke()

      // Top-right
      this.ctx.beginPath()
      this.ctx.moveTo(box.x + box.w - cornerSize, box.y)
      this.ctx.lineTo(box.x + box.w, box.y)
      this.ctx.lineTo(box.x + box.w, box.y + cornerSize)
      this.ctx.stroke()

      // Bottom-left
      this.ctx.beginPath()
      this.ctx.moveTo(box.x, box.y + box.h - cornerSize)
      this.ctx.lineTo(box.x, box.y + box.h)
      this.ctx.lineTo(box.x + cornerSize, box.y + box.h)
      this.ctx.stroke()

      // Bottom-right
      this.ctx.beginPath()
      this.ctx.moveTo(box.x + box.w - cornerSize, box.y + box.h)
      this.ctx.lineTo(box.x + box.w, box.y + box.h)
      this.ctx.lineTo(box.x + box.w, box.y + box.h - cornerSize)
      this.ctx.stroke()
    }
  }

  private drawConfidenceMeter() {
    const meterWidth = 200
    const meterHeight = 8
    const x = this.width - 240
    const y = 40

    // Background
    this.ctx.fillStyle = "rgba(57, 255, 20, 0.1)"
    this.ctx.fillRect(x, y, meterWidth, meterHeight)

    // Confidence fill (animated)
    const confValue = 0.75 + Math.sin(this.animationTime * 0.05) * 0.2
    this.ctx.fillStyle = `rgba(57, 255, 20, ${0.5 + confValue * 0.5})`
    this.ctx.fillRect(x, y, meterWidth * confValue, meterHeight)

    // Border
    this.ctx.strokeStyle = "rgba(57, 255, 20, 0.8)"
    this.ctx.lineWidth = 1.5
    this.ctx.strokeRect(x, y, meterWidth, meterHeight)

    // Label
    this.ctx.fillStyle = "rgba(57, 255, 20, 0.9)"
    this.ctx.font = "11px ui-monospace, 'SF Mono', monospace"
    this.ctx.fillText("CONFIDENCE", x - 95, y + 12)
  }

  private drawDepthLines() {
    if (this.analysisBoxes.length < 2) return

    const phase = (this.animationTime * 0.03) % 1
    this.ctx.strokeStyle = `rgba(57, 255, 20, ${0.3 + Math.sin(phase * Math.PI * 2) * 0.2})`
    this.ctx.lineWidth = 1.5
    this.ctx.setLineDash([8, 4])

    // Draw connecting lines between boxes
    for (let i = 0; i < this.analysisBoxes.length - 1; i++) {
      const box1 = this.analysisBoxes[i]
      const box2 = this.analysisBoxes[i + 1]

      const x1 = box1.x + box1.w / 2
      const y1 = box1.y + box1.h / 2
      const x2 = box2.x + box2.w / 2
      const y2 = box2.y + box2.h / 2

      this.ctx.beginPath()
      this.ctx.moveTo(x1, y1)
      this.ctx.lineTo(x2, y2)
      this.ctx.stroke()

      // Draw connection points
      this.ctx.fillStyle = `rgba(57, 255, 20, 0.6)`
      this.ctx.beginPath()
      this.ctx.arc(x1, y1, 3, 0, Math.PI * 2)
      this.ctx.fill()
    }

    this.ctx.setLineDash([])
  }

  private drawReadModeBorder() {
    // Animated border for read/help mode
    const borderGap = 4
    const borderLength = 20
    const offset = (this.animationTime * 2) % (borderGap + borderLength)

    this.ctx.strokeStyle = "rgba(57, 255, 20, 0.4)"
    this.ctx.lineWidth = 2
    this.ctx.setLineDash([borderLength, borderGap])
    this.ctx.lineDashOffset = -offset

    this.ctx.strokeRect(40, 40, this.width - 80, this.height - 80)

    this.ctx.setLineDash([])

    // "READ MODE" label
    this.ctx.fillStyle = "rgba(57, 255, 20, 0.6)"
    this.ctx.font = "bold 12px ui-monospace, 'SF Mono', monospace"
    this.ctx.fillText("◇ READ MODE ◇", 50, 30)
  }

  setConfidence(value: number) {
    this.confidence = Math.max(0, Math.min(1, value))
  }

  setMode(mode: "idle" | "ambient" | "read") {
    this.mode = mode
    if (mode === "idle") {
      this.analysisBoxes = []
    }
  }

  setAnalyzing(active: boolean) {
    this.isAnalyzing = active
    if (!active) {
      this.analysisBoxes = []
    }
  }
}

const graphics = new TacticalGraphics()

// ═════════════════════════════════════════════════════════════════════════════
// Camera Setup
// ═════════════════════════════════════════════════════════════════════════════

const video = $("camera") as HTMLVideoElement

async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    })
    video.srcObject = stream
  } catch (err) {
    console.error("Camera access denied:", err)
    $("hud-desc").textContent = "Camera access required"
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Clock & Weather (Stat Line)
// ═════════════════════════════════════════════════════════════════════════════

let clockPart = ""
let tempPart = ""

function updateClock() {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, "0")
  const mm = String(now.getMinutes()).padStart(2, "0")
  clockPart = `${hh}:${mm}`
  renderStat()
}

function renderStat() {
  const stat = [clockPart, tempPart].filter(Boolean).join("  ")
  $("hud-stat").textContent = stat || "(waiting for location...)"
}

function showThinking(active: boolean) {
  const thinking = $("hud-thinking") as HTMLElement
  thinking.style.display = active ? "block" : "none"
}

setInterval(updateClock, 30_000)
updateClock()

// Fetch temperature from Open-Meteo (free, no API key)
navigator.geolocation.getCurrentPosition(
  async (pos) => {
    const { latitude, longitude } = pos.coords
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`
      const res = await fetch(url)
      const data = await res.json()
      const temp = Math.round(data.current.temperature_2m)
      tempPart = `${temp}°C`
      renderStat()
    } catch (err) {
      console.error("Weather fetch failed:", err)
    }
  },
  (err) => console.warn("Geolocation denied:", err)
)

// ═════════════════════════════════════════════════════════════════════════════
// Frame Capture & Describe
// ═════════════════════════════════════════════════════════════════════════════

function captureFrameBase64(): string {
  const canvas = document.createElement("canvas")
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas context failed")
  ctx.drawImage(video, 0, 0)
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85)
  // Strip "data:image/jpeg;base64," prefix — backend expects raw base64
  return dataUrl.split(",")[1]
}

function spawnParticles(count: number) {
  const hud = $("hud")
  const rect = hud.getBoundingClientRect()

  for (let i = 0; i < count; i++) {
    const particle = document.createElement("div")
    particle.className = "particle"
    particle.textContent = ["◆", "◇", "▸", "▪"].at(i % 4) || "◆"
    particle.style.left = (rect.left + Math.random() * rect.width) + "px"
    particle.style.top = (rect.top + Math.random() * rect.height) + "px"
    document.body.appendChild(particle)

    setTimeout(() => particle.remove(), 2000)
  }
}

function animateTextReveal(element: HTMLElement, text: string, speed: number = 30) {
  let index = 0
  element.textContent = ""

  const interval = setInterval(() => {
    if (index >= text.length) {
      clearInterval(interval)
      return
    }
    element.textContent += text[index]
    index++
  }, speed)
}

async function triggerCapture(mode: "ambient" | "read") {
  showThinking(true)
  spawnParticles(4)

  $("hud").setAttribute("data-mode", mode)
  graphics.setMode(mode)
  graphics.setAnalyzing(true)
  const image = captureFrameBase64()

  try {
    const res = await fetch("/api/describe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image, mode }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      $("hud-desc").textContent = `[error] ${err.error ?? "request failed"}`
      showThinking(false)
      return
    }

    const data = (await res.json()) as { text?: string }
    const responseText = data.text ?? "(no response)"

    // Animate the text reveal
    animateTextReveal($("hud-desc"), responseText, 20)
  } catch (err) {
    console.error("Describe fetch failed:", err)
    $("hud-desc").textContent = "[connection error]"
  } finally {
    showThinking(false)
    graphics.setAnalyzing(false)
  }
}

function showToast(message: string) {
  const toast = $("toast") as HTMLElement
  toast.textContent = message
  toast.style.display = "block"
  setTimeout(() => {
    toast.style.display = "none"
  }, 2000)
}

// ═════════════════════════════════════════════════════════════════════════════
// Trigger Logic: Spacebar Count
// ═════════════════════════════════════════════════════════════════════════════

let pressCount = 0
let pressTimer: number | undefined

window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat) return
  e.preventDefault()

  pressCount++

  if (pressTimer) clearTimeout(pressTimer)

  pressTimer = window.setTimeout(() => {
    const count = pressCount
    pressCount = 0

    if (count === 1) {
      triggerCapture("ambient")
    } else if (count === 2) {
      triggerCapture("read")
    } else if (count >= 3) {
      showToast("Coming soon — face recognition & maps reserved for future protocols")
    }
  }, 450) // debounce window
})

// ═════════════════════════════════════════════════════════════════════════════
// Init
// ═════════════════════════════════════════════════════════════════════════════

initCamera()
