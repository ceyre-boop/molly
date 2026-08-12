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
// EDITH System (Tactical AR Display OS)
// Backend: Molly (conversational AI)
// Frontend: EDITH (visual tactical interface)
// ═════════════════════════════════════════════════════════════════════════════

interface EDITHPanel {
  id: string
  title: string
  x: number
  y: number
  width: number
  height: number
  data: Record<string, unknown>
  visible: boolean
  alpha: number
}

class EDITHSystem {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private width: number = 0
  private height: number = 0
  private animationTime: number = 0
  private isAnalyzing: boolean = false
  private mode: "idle" | "ambient" | "read" = "idle"
  private panels: Map<string, EDITHPanel> = new Map()
  private activePanel: string | null = null

  // Color palette (blue/cyan tactical theme)
  private colors = {
    primary: "#00D9FF",    // Cyan
    secondary: "#0099FF",  // Blue
    accent: "#FF006E",     // Magenta (alerts)
    background: "rgba(10, 20, 40, 0.85)",
    border: "rgba(0, 217, 255, 0.3)",
    text: "#00D9FF",
    grid: "rgba(0, 217, 255, 0.05)",
  }

  constructor() {
    this.canvas = $("graphics") as HTMLCanvasElement
    const ctx = this.canvas.getContext("2d")
    if (!ctx) throw new Error("Failed to initialize graphics context")
    this.ctx = ctx
    this.resizeCanvas()
    window.addEventListener("resize", () => this.resizeCanvas())
    this.initializePanels()
    this.startRenderLoop()
  }

  private resizeCanvas() {
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.canvas.width = this.width
    this.canvas.height = this.height
  }

  private initializePanels() {
    const panelW = 320
    const panelH = 240
    const gap = 16

    // Panel layout: 3 columns x 2 rows
    const positions = [
      { id: "identity", x: gap, y: gap, title: "IDENTITY" },
      { id: "status", x: gap + panelW + gap, y: gap, title: "STATUS" },
      { id: "location", x: gap + (panelW + gap) * 2, y: gap, title: "LOCATION" },
      { id: "memory", x: gap, y: gap + panelH + gap, title: "MEMORY" },
      { id: "translation", x: gap + panelW + gap, y: gap + panelH + gap, title: "TRANSLATION" },
      { id: "analysis", x: gap + (panelW + gap) * 2, y: gap + panelH + gap, title: "ANALYSIS" },
    ]

    for (const pos of positions) {
      this.panels.set(pos.id, {
        id: pos.id,
        title: pos.title,
        x: pos.x,
        y: pos.y,
        width: panelW,
        height: panelH,
        data: {},
        visible: false,
        alpha: 0,
      })
    }
  }

  private startRenderLoop() {
    const render = () => {
      this.animationTime += 1
      this.ctx.clearRect(0, 0, this.width, this.height)

      // Draw background grid
      this.drawBackgroundGrid()

      // Draw EDITH header
      this.drawEDITHHeader()

      // Draw panels
      this.drawPanels()

      // Draw connecting lines when analyzing
      if (this.isAnalyzing) {
        this.drawDataConnections()
      }

      requestAnimationFrame(render)
    }
    requestAnimationFrame(render)
  }

  private drawBackgroundGrid() {
    this.ctx.strokeStyle = this.colors.grid
    this.ctx.lineWidth = 0.5
    const gridSize = 40

    for (let x = 0; x < this.width; x += gridSize) {
      this.ctx.beginPath()
      this.ctx.moveTo(x, 0)
      this.ctx.lineTo(x, this.height)
      this.ctx.stroke()
    }

    for (let y = 0; y < this.height; y += gridSize) {
      this.ctx.beginPath()
      this.ctx.moveTo(0, y)
      this.ctx.lineTo(this.width, y)
      this.ctx.stroke()
    }
  }

  private drawEDITHHeader() {
    const headerH = 50
    this.ctx.fillStyle = "rgba(0, 20, 50, 0.6)"
    this.ctx.fillRect(0, 0, this.width, headerH)

    this.ctx.strokeStyle = this.colors.border
    this.ctx.lineWidth = 1.5
    this.ctx.strokeRect(0, 0, this.width, headerH)

    // EDITH title
    this.ctx.fillStyle = this.colors.primary
    this.ctx.font = "bold 24px 'SF Mono', monospace"
    this.ctx.fillText("— E.D.I.T.H. —", this.width / 2 - 85, 32)

    // Version and status
    this.ctx.font = "11px 'SF Mono', monospace"
    this.ctx.fillStyle = `rgba(${0}, ${217}, ${255}, 0.5)`
    this.ctx.fillText("v0.1 | MOLLY ACTIVE", 16, 32)
    this.ctx.fillText(`${this.isAnalyzing ? "● ANALYZING" : "● STANDBY"}`, this.width - 160, 32)
  }

  private drawPanels() {
    for (const panel of this.panels.values()) {
      if (panel.visible) {
        panel.alpha = Math.min(1, panel.alpha + 0.1)
      } else {
        panel.alpha = Math.max(0, panel.alpha - 0.05)
      }

      if (panel.alpha > 0.01) {
        this.drawPanel(panel)
      }
    }
  }

  private drawPanel(panel: EDITHPanel) {
    this.ctx.globalAlpha = panel.alpha

    // Background
    this.ctx.fillStyle = this.colors.background
    this.ctx.fillRect(panel.x, panel.y, panel.width, panel.height)

    // Border
    this.ctx.strokeStyle = this.colors.border
    this.ctx.lineWidth = 2
    this.ctx.strokeRect(panel.x, panel.y, panel.width, panel.height)

    // Corner brackets
    const bracketSize = 12
    this.ctx.strokeStyle = this.colors.primary
    this.ctx.lineWidth = 2

    // Top-left
    this.ctx.beginPath()
    this.ctx.moveTo(panel.x, panel.y + bracketSize)
    this.ctx.lineTo(panel.x, panel.y)
    this.ctx.lineTo(panel.x + bracketSize, panel.y)
    this.ctx.stroke()

    // Top-right
    this.ctx.beginPath()
    this.ctx.moveTo(panel.x + panel.width - bracketSize, panel.y)
    this.ctx.lineTo(panel.x + panel.width, panel.y)
    this.ctx.lineTo(panel.x + panel.width, panel.y + bracketSize)
    this.ctx.stroke()

    // Bottom-left
    this.ctx.beginPath()
    this.ctx.moveTo(panel.x, panel.y + panel.height - bracketSize)
    this.ctx.lineTo(panel.x, panel.y + panel.height)
    this.ctx.lineTo(panel.x + bracketSize, panel.y + panel.height)
    this.ctx.stroke()

    // Bottom-right
    this.ctx.beginPath()
    this.ctx.moveTo(panel.x + panel.width - bracketSize, panel.y + panel.height)
    this.ctx.lineTo(panel.x + panel.width, panel.y + panel.height)
    this.ctx.lineTo(panel.x + panel.width, panel.y + panel.height - bracketSize)
    this.ctx.stroke()

    // Title
    this.ctx.fillStyle = this.colors.primary
    this.ctx.font = "bold 12px 'SF Mono', monospace"
    this.ctx.fillText(panel.title, panel.x + 12, panel.y + 24)

    // Divider
    this.ctx.strokeStyle = `rgba(0, 217, 255, 0.2)`
    this.ctx.lineWidth = 1
    this.ctx.beginPath()
    this.ctx.moveTo(panel.x + 8, panel.y + 30)
    this.ctx.lineTo(panel.x + panel.width - 8, panel.y + 30)
    this.ctx.stroke()

    // Panel content based on ID
    this.drawPanelContent(panel)

    this.ctx.globalAlpha = 1
  }

  private drawPanelContent(panel: EDITHPanel) {
    const contentX = panel.x + 12
    const contentY = panel.y + 42
    const lineHeight = 16

    this.ctx.font = "11px 'SF Mono', monospace"
    this.ctx.fillStyle = this.colors.text

    if (panel.id === "identity" && panel.data.person) {
      // Identity card content
      this.ctx.fillText(`NAME: ${panel.data.person}`, contentX, contentY)
      this.ctx.fillText(`CONFIDENCE: ${panel.data.confidence}`, contentX, contentY + lineHeight)

      // Confidence bar
      const confMap: Record<string, number> = { HIGH: 1, MEDIUM: 0.6, LOW: 0.3 }
      const confValue = confMap[panel.data.confidence as string] || 0.5
      const barW = panel.width - 24
      this.ctx.fillStyle = `rgba(0, 217, 255, 0.2)`
      this.ctx.fillRect(contentX, contentY + lineHeight * 2 + 2, barW, 4)
      this.ctx.fillStyle = this.colors.primary
      this.ctx.fillRect(contentX, contentY + lineHeight * 2 + 2, barW * confValue, 4)

      this.ctx.fillStyle = this.colors.text
      this.ctx.fillText(`SEEN: 1x`, contentX, contentY + lineHeight * 4)
    } else if (panel.id === "status" && panel.data.mode) {
      // Status panel content
      this.ctx.fillText(`MODE: ${panel.data.mode}`, contentX, contentY)
      this.ctx.fillText(`UPTIME: ${panel.data.mode}`, contentX, contentY + lineHeight)
      this.ctx.fillText(`MEMORY: ${Math.round(Math.random() * 100)}%`, contentX, contentY + lineHeight * 2)
    } else if (panel.id === "analysis" && panel.data.anomalies) {
      // Analysis panel content
      this.ctx.fillText(`ANOMALIES: ${panel.data.anomalies}`, contentX, contentY)
      this.ctx.fillStyle = panel.data.anomalies === "MINIMAL" ? this.colors.primary : this.colors.accent
      this.ctx.fillText(`STATUS: ${panel.data.anomalies === "MINIMAL" ? "CLEAR" : "DETECTED"}`, contentX, contentY + lineHeight)
    }
  }

  private drawDataConnections() {
    // Draw subtle connecting lines between active panels
    const activePanels = Array.from(this.panels.values()).filter(p => p.visible && p.alpha > 0.5)

    if (activePanels.length < 2) return

    this.ctx.strokeStyle = `rgba(0, 217, 255, 0.2)`
    this.ctx.lineWidth = 1.5
    this.ctx.setLineDash([5, 3])

    for (let i = 0; i < activePanels.length - 1; i++) {
      const p1 = activePanels[i]
      const p2 = activePanels[i + 1]

      const x1 = p1.x + p1.width / 2
      const y1 = p1.y + p1.height / 2
      const x2 = p2.x + p2.width / 2
      const y2 = p2.y + p2.height / 2

      this.ctx.beginPath()
      this.ctx.moveTo(x1, y1)
      this.ctx.lineTo(x2, y2)
      this.ctx.stroke()
    }

    this.ctx.setLineDash([])
  }

  showPanel(panelId: string, data?: Record<string, unknown>) {
    const panel = this.panels.get(panelId)
    if (panel) {
      panel.visible = true
      if (data) panel.data = data
    }
  }

  hidePanel(panelId: string) {
    const panel = this.panels.get(panelId)
    if (panel) panel.visible = false
  }

  showAnalysisPanels() {
    // Show relevant panels based on mode
    if (this.mode === "ambient") {
      this.showPanel("status", { mode: "SCENE ANALYSIS", confidence: 0.87 })
      this.showPanel("analysis", { anomalies: "MINIMAL" })
    } else if (this.mode === "read") {
      this.showPanel("identity")
      this.showPanel("translation")
      this.showPanel("memory")
    }
  }

  hideAllPanels() {
    for (const panel of this.panels.values()) {
      panel.visible = false
    }
  }

  setMode(mode: "idle" | "ambient" | "read") {
    this.mode = mode
    if (mode === "idle") {
      this.hideAllPanels()
    }
  }

  setAnalyzing(active: boolean) {
    this.isAnalyzing = active
    if (active) {
      this.showAnalysisPanels()
    } else {
      setTimeout(() => this.hideAllPanels(), 2000)
    }
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

    for (let i = 0; i < this.analysisBoxes.length; i++) {
      const box = this.analysisBoxes[i]
      box.pulse = (box.pulse + 0.02) % 1

      const pulse = Math.sin(box.pulse * Math.PI * 2) * 0.3 + 0.7
      const alpha = pulse * 0.5
      const boxColor = `rgba(57, 255, 20, ${alpha})`

      // Draw glow aura
      const gradient = this.ctx.createRadialGradient(box.x + box.w / 2, box.y + box.h / 2, box.w * 0.3, box.x + box.w / 2, box.y + box.h / 2, Math.max(box.w, box.h))
      gradient.addColorStop(0, `rgba(57, 255, 20, ${pulse * 0.3})`)
      gradient.addColorStop(1, "rgba(57, 255, 20, 0)")
      this.ctx.fillStyle = gradient
      this.ctx.fillRect(box.x - box.w * 0.2, box.y - box.h * 0.2, box.w * 1.4, box.h * 1.4)

      this.ctx.strokeStyle = boxColor
      this.ctx.lineWidth = 2
      this.ctx.strokeRect(box.x, box.y, box.w, box.h)

      // Draw corner indicators with energy pulse
      const cornerSize = 8
      this.ctx.strokeStyle = `rgba(57, 255, 20, ${pulse})`
      this.ctx.lineWidth = 2.5

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

      // Center pulse point
      this.ctx.fillStyle = `rgba(57, 255, 20, ${pulse * 0.8})`
      this.ctx.beginPath()
      this.ctx.arc(box.x + box.w / 2, box.y + box.h / 2, 4 + pulse * 3, 0, Math.PI * 2)
      this.ctx.fill()
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

const edith = new EDITHSystem()

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
// Face Memory System (EDITH Identity Recognition)
// ═════════════════════════════════════════════════════════════════════════════

interface FaceIdentity {
  id: string
  name?: string
  features: string
  ageRange: string
  confidence: "HIGH" | "MEDIUM" | "LOW"
  lastSeen: number
  seenCount: number
  notes?: string
}

class FaceMemory {
  private faces: Map<string, FaceIdentity> = new Map()
  private readonly STORAGE_KEY = "edith_face_memory"

  constructor() {
    this.load()
  }

  private load() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      if (stored) {
        const faces = JSON.parse(stored) as FaceIdentity[]
        for (const face of faces) {
          this.faces.set(face.id, face)
        }
      }
    } catch (e) {
      console.warn("Failed to load face memory:", e)
    }
  }

  private save() {
    try {
      localStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify(Array.from(this.faces.values()))
      )
    } catch (e) {
      console.warn("Failed to save face memory:", e)
    }
  }

  addFace(face: FaceIdentity) {
    this.faces.set(face.id, face)
    this.save()
  }

  // Find similar face from memory (simple string matching)
  findSimilar(features: string): FaceIdentity | undefined {
    let bestMatch: FaceIdentity | undefined
    let bestScore = 0

    for (const face of this.faces.values()) {
      const score = this.similarityScore(features, face.features)
      if (score > bestScore && score > 0.6) {
        bestScore = score
        bestMatch = face
      }
    }

    return bestMatch
  }

  private similarityScore(a: string, b: string): number {
    const aWords = a.toLowerCase().split(/\s+/)
    const bWords = b.toLowerCase().split(/\s+/)
    const matches = aWords.filter((w) => bWords.includes(w)).length
    return matches / Math.max(aWords.length, bWords.length)
  }

  getAllFaces(): FaceIdentity[] {
    return Array.from(this.faces.values())
  }

  getFace(id: string): FaceIdentity | undefined {
    return this.faces.get(id)
  }

  updateFace(id: string, updates: Partial<FaceIdentity>) {
    const face = this.faces.get(id)
    if (face) {
      this.faces.set(id, { ...face, ...updates })
      this.save()
    }
  }
}

const faceMemory = new FaceMemory()

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
  edith.setMode(mode)
  edith.setAnalyzing(true)
  const image = captureFrameBase64()

  // Detect faces in read mode
  if (mode === "read") {
    try {
      const faceRes = await fetch("/api/faces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image }),
      })

      if (faceRes.ok) {
        const faceData = (await faceRes.json()) as { faces?: Array<{ features: string; ageRange: string; confidence: string }> }
        if (faceData.faces && faceData.faces.length > 0) {
          // Match against known faces
          for (const detectedFace of faceData.faces) {
            const match = faceMemory.findSimilar(detectedFace.features)
            if (match) {
              match.seenCount++
              match.lastSeen = Date.now()
              faceMemory.updateFace(match.id, match)
              edith.showPanel("identity", { person: match.name || "Unknown", confidence: match.confidence })
            } else {
              // New face, store it
              const newFace: FaceIdentity = {
                id: `face-${Date.now()}`,
                features: detectedFace.features,
                ageRange: detectedFace.ageRange,
                confidence: detectedFace.confidence as "HIGH" | "MEDIUM" | "LOW",
                lastSeen: Date.now(),
                seenCount: 1,
              }
              faceMemory.addFace(newFace)
              edith.showPanel("identity", { person: "New Face", confidence: newFace.confidence })
            }
          }
        }
      }
    } catch (err) {
      console.warn("Face detection failed:", err)
    }
  }

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
    edith.setAnalyzing(false)
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
