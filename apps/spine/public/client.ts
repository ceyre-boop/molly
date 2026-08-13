// Spine console client — health-driven spine rail, identity graph, memory, chat.

function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing element #${id}`)
  return el
}

const conversationId = `web-${Date.now()}`

// ── Health → spine rail ─────────────────────────────────────────

interface Health {
  ok: boolean
  reasoning: "ready" | "offline"
  people: number
  facts: number
  conversations: number
  messages: number
}

function setVertebra(id: string, state: "live" | "warn" | "idle", status: string) {
  $(`v-${id}`).setAttribute("data-state", state)
  $(`s-${id}`).textContent = status
}

async function refreshHealth() {
  try {
    const res = await fetch("/api/health")
    const h = (await res.json()) as Health

    setVertebra("identity", h.people > 0 ? "live" : "warn", `${h.people} ${h.people === 1 ? "person" : "people"}`)
    setVertebra("memory", h.facts > 0 ? "live" : "warn", `${h.facts} facts · ${h.messages} msgs`)
    setVertebra("reasoning", h.reasoning === "ready" ? "live" : "warn", h.reasoning === "ready" ? "ready" : "offline · $0 mode")
    setVertebra("connectors", "warn", "0 connected")
    setVertebra("surfaces", "live", "web live")

    $("rail-foot").textContent = `spine ok · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`

    const chip = $("chat-chip")
    if (h.reasoning === "ready") {
      chip.textContent = "reasoning ready"
      chip.setAttribute("data-tone", "ready")
    } else {
      chip.textContent = "offline — $0 mode"
      chip.setAttribute("data-tone", "offline")
    }
  } catch {
    $("rail-foot").textContent = "spine unreachable"
  }
}

// ── Identity graph ──────────────────────────────────────────────

interface Person {
  id: number
  name: string
  role: string
  org: string
  last_seen: number
}

async function refreshPeople() {
  const res = await fetch("/api/people")
  const { people } = (await res.json()) as { people: Person[] }
  $("people-count").textContent = String(people.length)
  const list = $("people-list")
  if (people.length === 0) {
    list.innerHTML = `<li class="list-empty">No one yet. Add the first person.</li>`
    return
  }
  list.innerHTML = people
    .map(
      (p) =>
        `<li><span class="who">${escapeHtml(p.name)}</span><span class="meta">${escapeHtml(
          [p.role, p.org].filter(Boolean).join(" · ")
        )}</span></li>`
    )
    .join("")
}

$("person-form").addEventListener("submit", async (e) => {
  e.preventDefault()
  const name = ($("person-name") as HTMLInputElement).value.trim()
  if (!name) return
  await fetch("/api/people", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      role: ($("person-role") as HTMLInputElement).value.trim(),
      org: ($("person-org") as HTMLInputElement).value.trim(),
    }),
  })
  ;($("person-form") as HTMLFormElement).reset()
  refreshPeople()
  refreshHealth()
})

// ── Memory ──────────────────────────────────────────────────────

interface Fact {
  id: number
  subject: string
  fact: string
}

async function refreshFacts() {
  const res = await fetch("/api/facts")
  const { facts } = (await res.json()) as { facts: Fact[] }
  $("facts-count").textContent = String(facts.length)
  const list = $("facts-list")
  if (facts.length === 0) {
    list.innerHTML = `<li class="list-empty">No facts stored yet.</li>`
    return
  }
  list.innerHTML = facts
    .map(
      (f) =>
        `<li><span class="who">${escapeHtml(f.subject)}</span><span class="meta">${escapeHtml(f.fact)}</span></li>`
    )
    .join("")
}

$("fact-form").addEventListener("submit", async (e) => {
  e.preventDefault()
  const subject = ($("fact-subject") as HTMLInputElement).value.trim()
  const fact = ($("fact-text") as HTMLInputElement).value.trim()
  if (!subject || !fact) return
  await fetch("/api/facts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subject, fact }),
  })
  ;($("fact-form") as HTMLFormElement).reset()
  refreshFacts()
  refreshHealth()
})

// ── Chat ────────────────────────────────────────────────────────

function appendMessage(role: "user" | "molly", text: string, meta?: string, offline?: boolean) {
  const empty = document.getElementById("chat-empty")
  if (empty) empty.remove()

  const log = $("chat-log")
  const div = document.createElement("div")
  div.className = `msg msg-${role}${offline ? " msg-offline" : ""}`
  div.textContent = text
  if (meta) {
    const m = document.createElement("span")
    m.className = "msg-meta"
    m.textContent = meta
    div.appendChild(m)
  }
  log.appendChild(div)
  log.scrollTop = log.scrollHeight
}

$("chat-form").addEventListener("submit", async (e) => {
  e.preventDefault()
  const input = $("chat-input") as HTMLInputElement
  const message = input.value.trim()
  if (!message) return

  input.value = ""
  appendMessage("user", message)
  const send = $("chat-send") as HTMLButtonElement
  send.disabled = true

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, conversationId }),
    })
    const data = (await res.json()) as {
      text?: string
      offline?: boolean
      toolCalls?: string[]
      tokens?: { input: number; output: number }
      error?: string
    }
    if (data.error) {
      appendMessage("molly", `[${data.error}]`, undefined, true)
    } else {
      const meta =
        data.toolCalls && data.toolCalls.length > 0
          ? `tools: ${data.toolCalls.join(", ")}${data.tokens ? ` · ${data.tokens.input + data.tokens.output} tok` : ""}`
          : data.tokens
            ? `${data.tokens.input + data.tokens.output} tok`
            : undefined
      appendMessage("molly", data.text ?? "(no reply)", meta, data.offline)
    }
  } catch {
    appendMessage("molly", "[connection error — is the spine up?]", undefined, true)
  } finally {
    send.disabled = false
    refreshHealth()
    refreshFacts()
    refreshPeople()
  }
})

// ── Utils / init ────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

refreshHealth()
refreshPeople()
refreshFacts()
setInterval(refreshHealth, 30_000)
