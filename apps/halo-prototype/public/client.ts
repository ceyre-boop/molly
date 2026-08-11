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

async function triggerCapture(mode: "ambient" | "read") {
  showThinking(true)
  const image = captureFrameBase64()

  try {
    const res = await fetch("/api/describe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image, mode }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      $("hud-desc").textContent = `Error: ${err.error ?? "request failed"}`
      showThinking(false)
      return
    }

    const data = (await res.json()) as { text?: string }
    $("hud-desc").textContent = data.text ?? "(no response)"
  } catch (err) {
    console.error("Describe fetch failed:", err)
    $("hud-desc").textContent = "(connection error)"
  } finally {
    showThinking(false)
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
