#!/usr/bin/env bun
/**
 * Molly Console — server.
 *
 * Serves the orb UI and a small API:
 *   POST /api/submit  { text, repo? }  → dispatch to gh issue create, or
 *                                        append to the desk inbox.
 *
 * Binds to localhost only. Never exposes Pulse (localhost:31337) beyond
 * this machine — voice replies are sent server-side, not proxied.
 */

import { join } from "path"
import { appendInboxEntry } from "./lib/inbox"
import { sendPulse } from "./lib/pulse"
import { classify, extractIssueTitle, resolveRepo } from "./lib/routing"

const PUBLIC_DIR = join(import.meta.dir, "public")
const PORT = Number(process.env.CONSOLE_PORT ?? 4173)

const build = await Bun.build({
  entrypoints: [join(PUBLIC_DIR, "client.ts")],
  target: "browser",
})
if (!build.success) {
  for (const log of build.logs) console.error(log)
  throw new Error("Molly Console: client build failed")
}
const clientJs = await build.outputs[0].text()

async function fileIssue(
  repo: string,
  title: string,
  transcript: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const proc = Bun.spawnSync([
    "gh",
    "issue",
    "create",
    "--repo",
    `ceyre-boop/${repo}`,
    "--label",
    "claude",
    "--title",
    title,
    "--body",
    `${transcript}\n\n@claude\n\n_Dispatched via Molly Console._`,
  ])
  if (proc.exitCode !== 0) {
    return { ok: false, error: proc.stderr.toString().trim() || "gh issue create failed" }
  }
  return { ok: true, url: proc.stdout.toString().trim() }
}

async function handleSubmit(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null)
  const text = typeof body?.text === "string" ? body.text.trim() : ""
  if (!text) return Response.json({ ok: false, error: "empty transcript" }, { status: 400 })

  const decision = classify(text)

  if (decision.kind === "dispatch") {
    const repo = resolveRepo(body?.repo)
    const title = extractIssueTitle(text)
    const result = await fileIssue(repo, title, text)
    const message = result.ok
      ? `Filed on ${repo}: ${title}`
      : `Couldn't file that one — ${result.error}`
    await sendPulse(message)
    return Response.json({
      ok: result.ok,
      kind: "dispatch",
      title,
      repo,
      url: result.ok ? result.url : null,
      message,
    })
  }

  appendInboxEntry(text)
  const message = "Got it — noted on your desk."
  await sendPulse(message)
  return Response.json({ ok: true, kind: "inbox", message })
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === "/api/submit" && req.method === "POST") {
      return handleSubmit(req)
    }

    if (url.pathname === "/client.js") {
      return new Response(clientJs, { headers: { "content-type": "text/javascript" } })
    }
    if (url.pathname === "/styles.css") {
      return new Response(Bun.file(join(PUBLIC_DIR, "styles.css")))
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(Bun.file(join(PUBLIC_DIR, "index.html")))
    }

    return new Response("Not found", { status: 404 })
  },
})

console.log(`Molly Console → http://${server.hostname}:${server.port} (localhost only)`)
