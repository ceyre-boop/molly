#!/usr/bin/env bun
// The Molly Spine — persistent backbone serving every surface.
import { join } from "path"
import { chat, reasoningAvailable } from "./lib/agent"
import { counts, addFact, listFacts, ensureConversation, addMessage, kvGet, kvSet } from "./lib/memory"
import { addPerson, listPeople, peopleCount } from "./lib/people"

const PUBLIC_DIR = join(import.meta.dir, "public")
const PORT = Number(process.env.PORT ?? 3000)

const build = await Bun.build({
  entrypoints: [join(PUBLIC_DIR, "client.ts")],
  target: "browser",
})
if (!build.success) {
  for (const log of build.logs) console.error(log)
  throw new Error("spine: client build failed")
}
const clientJs = await build.outputs[0].text()

function checkAuth(req: Request): boolean {
  const secret = process.env.SPINE_SHARED_SECRET
  if (!secret) return true
  return req.headers.get("authorization") === `Bearer ${secret}`
}

async function handleChat(req: Request): Promise<Response> {
  if (!checkAuth(req)) return Response.json({ error: "unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => null)
  const message = typeof body?.message === "string" ? body.message.trim() : ""
  const convId = typeof body?.conversationId === "string" ? body.conversationId : `web-${Date.now()}`
  if (!message) return Response.json({ error: "missing message" }, { status: 400 })

  ensureConversation(convId)
  const reply = await chat(convId, message)
  addMessage(convId, "user", message)
  addMessage(convId, "assistant", reply.text)
  return Response.json({ ...reply, conversationId: convId })
}

async function handlePeople(req: Request): Promise<Response> {
  if (!checkAuth(req)) return Response.json({ error: "unauthorized" }, { status: 401 })
  if (req.method === "GET") return Response.json({ people: listPeople() })
  const body = await req.json().catch(() => null)
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  if (!name) return Response.json({ error: "missing name" }, { status: 400 })
  const person = addPerson(name, body?.role ?? "", body?.org ?? "", body?.notes ?? "")
  return Response.json({ person })
}

async function handleFacts(req: Request): Promise<Response> {
  if (!checkAuth(req)) return Response.json({ error: "unauthorized" }, { status: 401 })
  if (req.method === "GET") return Response.json({ facts: listFacts() })
  const body = await req.json().catch(() => null)
  const subject = typeof body?.subject === "string" ? body.subject.trim() : ""
  const fact = typeof body?.fact === "string" ? body.fact.trim() : ""
  if (!subject || !fact) return Response.json({ error: "missing subject or fact" }, { status: 400 })
  return Response.json({ fact: addFact(subject, fact, "manual") })
}

function handleHealth(): Response {
  const c = counts()
  return Response.json({
    ok: true,
    reasoning: reasoningAvailable() ? "ready" : "offline",
    people: peopleCount(),
    facts: c.facts,
    conversations: c.conversations,
    messages: c.messages,
    // Real page visits only (GET /), never health pings — feeds the keep-warm poller
    lastVisit: Number(kvGet("lastVisit") ?? 0),
    connectors: { google: "not connected" }, // Phase C
    surfaces: { web: "live", telegram: "planned", glasses: "awaiting hardware" },
  })
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === "/api/chat" && req.method === "POST") return handleChat(req)

    // Explicit warm-up hook: stamps a visit, opening the keep-warm poller's window
    if (url.pathname === "/api/visit" && req.method === "POST") {
      const now = Date.now()
      kvSet("lastVisit", String(now))
      return Response.json({ ok: true, lastVisit: now })
    }
    if (url.pathname === "/api/people") return handlePeople(req)
    if (url.pathname === "/api/facts") return handleFacts(req)
    if (url.pathname === "/api/health") return handleHealth()

    if (url.pathname === "/client.js")
      return new Response(clientJs, { headers: { "content-type": "text/javascript" } })
    if (url.pathname === "/styles.css")
      return new Response(Bun.file(join(PUBLIC_DIR, "styles.css")))
    if (url.pathname === "/" || url.pathname === "/index.html") {
      kvSet("lastVisit", String(Date.now()))
      return new Response(Bun.file(join(PUBLIC_DIR, "index.html")))
    }

    return new Response("Not found", { status: 404 })
  },
})

console.log(`Molly Spine → http://localhost:${server.port} | reasoning: ${reasoningAvailable() ? "ready" : "offline ($0 mode)"}`)
