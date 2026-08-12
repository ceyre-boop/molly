// EDITH Phase 3: Voice Loop integration via Web Speech API.
// Desktop/mobile push-to-talk: mic button or spacebar-hold.
// On real Halo hardware, this audio.ts module is replaced by a BLE mic/bone-conduction wrapper.

import { startPushToTalk, stopPushToTalk, speak, stopSpeaking, getVoiceCapabilities } from "./audio"

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
// Trigger Logic: Spacebar Count (tap-based) + Hold (voice)
// ═════════════════════════════════════════════════════════════════════════════

let pressCount = 0
let pressTimer: number | undefined
let spaceDownAt: number | null = null
let holdTimer: number | undefined
let holdConfirmed = false
const HOLD_THRESHOLD_MS = 500 // must exceed the 450ms tap debounce

let voiceBusy = false

window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat) return
  e.preventDefault()
  spaceDownAt = performance.now()
  holdConfirmed = false

  // Start a hold-timer; if still down when it fires, commit to voice mode
  holdTimer = window.setTimeout(() => {
    holdConfirmed = true
    pressCount = 0 // cancel any in-flight tap sequence
    if (pressTimer) {
      clearTimeout(pressTimer)
      pressTimer = undefined
    }
    beginVoiceCapture()
  }, HOLD_THRESHOLD_MS)
})

window.addEventListener("keyup", (e) => {
  if (e.code !== "Space") return
  e.preventDefault()

  if (holdTimer) {
    clearTimeout(holdTimer)
    holdTimer = undefined
  }

  if (holdConfirmed) {
    // Was a hold: end voice, don't feed into tap counter
    endVoiceCapture()
    spaceDownAt = null
    return
  }

  // Was a tap: existing debounce-based tap-counter logic
  spaceDownAt = null
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
// Voice Capture (Phase 3: Web Speech API)
// ═════════════════════════════════════════════════════════════════════════════

function beginVoiceCapture() {
  if (voiceBusy) return
  voiceBusy = true
  const micBtn = $("mic-btn") as HTMLButtonElement
  micBtn.setAttribute("data-listening", "true")
  $("voice-indicator").style.display = "block"

  startPushToTalk(
    async (transcript) => {
      $("voice-indicator").style.display = "none"
      micBtn.setAttribute("data-listening", "false")
      if (!transcript) {
        voiceBusy = false
        return
      }
      await triggerVoiceQuestion(transcript)
      voiceBusy = false
    },
    (err) => {
      showToast(`Voice error: ${err}`)
      micBtn.setAttribute("data-listening", "false")
      $("voice-indicator").style.display = "none"
      voiceBusy = false
    },
    (isListening) => micBtn.setAttribute("data-listening", String(isListening))
  )
}

function endVoiceCapture() {
  stopPushToTalk() // triggers final onresult callback
}

async function triggerVoiceQuestion(question: string) {
  showThinking(true)
  spawnParticles(4)
  $("hud").setAttribute("data-mode", "read")
  edith.setMode("read")
  edith.setAnalyzing(true)

  const image = captureFrameBase64()

  try {
    const res = await fetch("/api/describe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image, mode: "read", question }),
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as Record<string, string>
      const msg = `[error] ${err.error ?? "request failed"}`
      $("hud-desc").textContent = msg
      return
    }
    const data = (await res.json()) as { text?: string }
    const responseText = data.text ?? "(no response)"

    animateTextReveal($("hud-desc"), responseText, 20) // text panel
    speak(responseText) // spoken reply, in parallel
  } catch (err) {
    console.error("Voice question failed:", err)
    $("hud-desc").textContent = "[connection error]"
  } finally {
    showThinking(false)
    edith.setAnalyzing(false)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Mic Button Setup (Phase 3: Voice)
// ═════════════════════════════════════════════════════════════════════════════

const capabilities = getVoiceCapabilities()
if (!capabilities.sttSupported) {
  ($("mic-btn") as HTMLElement).style.display = "none"
}

const micBtn = $("mic-btn") as HTMLButtonElement
micBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault()
  beginVoiceCapture()
})
micBtn.addEventListener("pointerup", () => endVoiceCapture())
micBtn.addEventListener("pointercancel", () => endVoiceCapture())

// ═════════════════════════════════════════════════════════════════════════════
// Init
// ═════════════════════════════════════════════════════════════════════════════

initCamera()
