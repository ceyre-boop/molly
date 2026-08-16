#!/usr/bin/env bun
// The Molly Spine — persistent backbone serving every surface.
import { join } from "path"
import { chat, reasoningAvailable } from "./lib/agent"
import { counts, addFact, listFacts, ensureConversation, addMessage, kvGet, kvSet } from "./lib/memory"
import { addPerson, listPeople, peopleCount } from "./lib/people"
import { exportData, restoreOnBootIfEmpty } from "./lib/backup"
import { googleConfigured, googleConnected, getAuthUrl, exchangeCode } from "./lib/google"
import { getBrief, generateBrief } from "./lib/brief"

// Restore the bundled backup into an empty DB (fresh container after deploy)
await restoreOnBootIfEmpty()

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
    connectors: {
      google: googleConnected() ? "connected" : googleConfigured() ? "configured — visit /oauth/google/start" : "not configured",
    },
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

    // Morning brief: GET returns the latest, POST (cron) regenerates
    if (url.pathname === "/api/brief" && req.method === "GET")
      return Response.json({ brief: getBrief() })
    if (url.pathname === "/api/brief/generate" && req.method === "POST") {
      if (!checkAuth(req)) return Response.json({ error: "unauthorized" }, { status: 401 })
      const force = url.searchParams.get("force") === "1"
      const result = await generateBrief(force)
      return Response.json(result)
    }

    // Full data export for the scheduled backup workflow
    if (url.pathname === "/api/export") {
      if (!checkAuth(req)) return Response.json({ error: "unauthorized" }, { status: 401 })
      return Response.json(exportData())
    }

    // Google OAuth (read-only Calendar) — Colin's browser drives this flow
    if (url.pathname === "/oauth/google/start") {
      if (!googleConfigured())
        return new Response("Google OAuth not configured (GOOGLE_CLIENT_ID/SECRET missing). See SPINE.md.", { status: 503 })
      return Response.redirect(getAuthUrl(), 302)
    }
    if (url.pathname === "/oauth/google/callback") {
      const code = url.searchParams.get("code")
      const state = url.searchParams.get("state")
      if (!code || !state) return new Response("Missing code/state", { status: 400 })
      const result = await exchangeCode(code, state)
      if (!result.ok) return new Response(`Connection failed: ${result.error}`, { status: 400 })
      // Show the refresh token ONCE so Colin can seed GOOGLE_REFRESH_TOKEN in
      // Render's env — env vars survive redeploys, kv tokens don't (secret_*
      // is excluded from public-repo backups by design).
      return new Response(
        `<!doctype html><meta charset="utf-8"><title>Connected</title>
        <body style="font-family:monospace;background:#0a0e1a;color:#dbe4f3;padding:40px;max-width:720px">
        <h2 style="color:#3b82f6">✓ Google Calendar connected</h2>
        <p><strong>One more step to make this permanent:</strong> redeploys wipe this
        connection unless you store the refresh token in Render.</p>
        <p>Copy this value into Render → molly service → Environment as
        <code style="color:#4ade80">GOOGLE_REFRESH_TOKEN</code>:</p>
        <pre style="background:#111a2e;padding:14px;border-radius:8px;white-space:break-spaces">${result.refreshToken ?? "(not returned)"}</pre>
        <p>This page shows it once. <a style="color:#3b82f6" href="/">Back to the spine →</a></p>
        </body>`,
        { headers: { "content-type": "text/html" } }
      )
    }

    if (url.pathname === "/client.js")
      return new Response(clientJs, { headers: { "content-type": "text/javascript" } })
    if (url.pathname === "/styles.css")
      return new Response(Bun.file(join(PUBLIC_DIR, "styles.css")))
    // Visit stamping is client-side (POST /api/visit from client.ts) so bots
    // fetching raw HTML don't open keep-warm windows — only real browsers do.
    if (url.pathname === "/" || url.pathname === "/index.html")
      return new Response(Bun.file(join(PUBLIC_DIR, "index.html")))

    return new Response("Not found", { status: 404 })
  },
})

console.log(`Molly Spine → http://localhost:${server.port} | reasoning: ${reasoningAvailable() ? "ready" : "offline ($0 mode)"}`)
