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
  kind: "dispatch" | "response"
  message: string
  title?: string
  repo?: string
  url?: string | null
  issue?: string
}

const orb = document.getElementById("orb") as HTMLButtonElement
const transcriptEl = document.getElementById("transcript") as HTMLParagraphElement
const resultEl = document.getElementById("result") as HTMLParagraphElement
const activityLogEl = document.getElementById("activity-log") as HTMLDivElement

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
    if (data.kind === "dispatch" && data.issue) {
      resultEl.innerHTML = `✓ ${data.title}<br><small><a href="${data.issue}" target="_blank" rel="noopener">View issue</a></small>`
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

// Activity log polling — smooth updates without jank
let lastTasks: any[] = []
let updatePending = false

async function updateActivityLog() {
  if (updatePending) return
  updatePending = true

  try {
    const res = await fetch("/api/status")
    const data = (await res.json()) as any

    if (!data.tasks || data.tasks.length === 0) {
      if (lastTasks.length !== 0) {
        activityLogEl.innerHTML = '<div class="activity-log__empty">No tasks</div>'
        lastTasks = []
      }
      updatePending = false
      return
    }

    // Only update if tasks actually changed (avoid DOM thrashing)
    const newTasksJson = JSON.stringify(data.tasks)
    const oldTasksJson = JSON.stringify(lastTasks)
    if (newTasksJson === oldTasksJson) {
      updatePending = false
      return
    }

    lastTasks = data.tasks

    // Use requestAnimationFrame for smooth rendering
    requestAnimationFrame(() => {
      activityLogEl.innerHTML = data.tasks
        .map((task: any) => {
          const time = new Date(task.timestamp).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          })
          const icon =
            task.repo === "question" ? "❓" : task.repo === "outreach-builder" ? "✓" : "📋"
          const typeLabel = task.repo === "question" ? "Question" : "Dispatch"
          const className =
            task.repo === "question" ? "activity-log__item--question" : "activity-log__item--dispatch"

          return `
            <div class="activity-log__item ${className}">
              <span class="activity-log__time">${time}</span>
              <span class="activity-log__label">${icon} ${typeLabel}</span>
              <div class="activity-log__text">${escapeHtml(task.title)}</div>
            </div>
          `
        })
        .join("")
      updatePending = false
    })
  } catch (e) {
    // Silently fail if server not ready
    updatePending = false
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div")
  div.textContent = text
  return div.innerHTML
}

setState("idle")

// Poll activity log every 2 seconds with smart caching
updateActivityLog()
setInterval(updateActivityLog, 2000)
