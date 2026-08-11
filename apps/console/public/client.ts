/**
 * Molly Console — client.
 *
 * Push-to-talk (hold spacebar or press the orb) drives the Web Speech API
 * for live transcription, then hands the transcript to the server for
 * routing. UI/DOM logic only — routing itself lives server-side in lib/.
 */

type OrbState = "idle" | "listening" | "thinking" | "speaking"

interface SubmitResponse {
  ok: boolean
  kind: "dispatch" | "inbox"
  message: string
  title?: string
  repo?: string
  url?: string | null
}

const orb = document.getElementById("orb") as HTMLButtonElement
const transcriptEl = document.getElementById("transcript") as HTMLParagraphElement
const resultEl = document.getElementById("result") as HTMLParagraphElement

function setState(state: OrbState) {
  orb.dataset.state = state
}

const SpeechRecognitionCtor: any =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition

let recognition: any = null
let finalTranscript = ""
let holding = false

function initRecognition() {
  const r = new SpeechRecognitionCtor()
  r.continuous = true
  r.interimResults = true
  r.lang = "en-US"
  r.onresult = (event: any) => {
    let interim = ""
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const chunk = event.results[i][0].transcript
      if (event.results[i].isFinal) finalTranscript += chunk
      else interim += chunk
    }
    transcriptEl.textContent = (finalTranscript + interim).trim()
  }
  r.onerror = () => {
    // Swallow — stopListening() decides what to do with whatever we have.
  }
  return r
}

function startListening() {
  if (holding) return
  holding = true
  finalTranscript = ""
  transcriptEl.textContent = ""
  resultEl.textContent = ""
  setState("listening")

  if (!SpeechRecognitionCtor) {
    transcriptEl.textContent = "Speech recognition isn't supported in this browser."
    setState("idle")
    holding = false
    return
  }
  if (!recognition) recognition = initRecognition()
  try {
    recognition.start()
  } catch {
    // Already running — ignore.
  }
}

async function stopListening() {
  if (!holding) return
  holding = false
  if (recognition) {
    try {
      recognition.stop()
    } catch {
      // Not running — ignore.
    }
  }

  const text = (finalTranscript || transcriptEl.textContent || "").trim()
  if (!text) {
    setState("idle")
    return
  }

  setState("thinking")
  await submit(text)
}

async function submit(text: string) {
  try {
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    })
    const data = (await res.json()) as SubmitResponse
    setState("speaking")
    if (data.kind === "dispatch" && data.url) {
      resultEl.innerHTML = `Dispatched → <a href="${data.url}" target="_blank" rel="noopener">${data.url}</a>`
    } else {
      resultEl.textContent = data.message
    }
  } catch {
    setState("speaking")
    resultEl.textContent = "Couldn't reach Molly Console's server."
  } finally {
    setTimeout(() => setState("idle"), 1800)
  }
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !e.repeat) {
    e.preventDefault()
    startListening()
  }
})
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    e.preventDefault()
    void stopListening()
  }
})

orb.addEventListener("mousedown", startListening)
orb.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault()
    startListening()
  },
  { passive: false }
)
window.addEventListener("mouseup", () => void stopListening())
window.addEventListener("touchend", () => void stopListening())

setState("idle")
