#!/usr/bin/env bun
/**
 * Molly Console — server.
 *
 * Serves the orb UI and routes voice commands:
 *   POST /api/submit  { text }  → Queue for Claude (this session) to respond
 *
 * Dispatch keywords (dispatch, build, file) → GitHub issue + immediate queue
 * Everything else → Queued for conversational response via Claude Max subscription
 *
 * Binds to localhost only. Pulse responses sent server-side (localhost:31337).
 */

import { join } from "path"
import { appendInboxEntry } from "./lib/inbox"
import { sendPulse } from "./lib/pulse"
import { classify, extractIssueTitle, resolveRepo } from "./lib/routing"
import { enqueueTask } from "./lib/dispatch-queue"

const PUBLIC_DIR = join(import.meta.dir, "public")
const PORT = Number(process.env.CONSOLE_PORT ?? 31340)

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
  const isDispatch = decision.kind === "dispatch"

  if (isDispatch) {
    // Dispatch: file issue and queue for immediate execution
    const repo = resolveRepo(body?.repo)
    const title = extractIssueTitle(text)
    const result = await fileIssue(repo, title, text)

    if (result.ok) {
      await enqueueTask({ title, text, repo, url: result.url })
      await sendPulse("Queued for execution.")
      return Response.json({
        ok: true,
        kind: "dispatch",
        title,
        repo,
        url: result.url,
        message: "Queued for execution.",
        issue: result.url,
      })
    }
    await sendPulse(`Failed to file issue: ${result.error}`)
    return Response.json({ ok: false, error: result.error }, { status: 500 })
  }

  // Regular question: queue for Claude to respond
  appendInboxEntry(text)
  await enqueueTask({
    title: text.slice(0, 50),
    text,
    repo: "question",
    url: undefined,
  })

  return Response.json({
    ok: true,
    kind: "response",
    message: "I'm thinking...",
  })
}

async function getQueueStatus(): Promise<any[]> {
  const queueDir = join(process.env.HOME!, ".molly-dispatch-queue")
  try {
    const proc = Bun.spawnSync(["ls", "-1", queueDir], {
      stdout: "pipe",
      stderr: "pipe",
    })

    if (proc.exitCode !== 0) return []

    const files = proc.stdout!.toString().split("\n").filter((f) => f.trim().endsWith(".json"))
    const tasks: any[] = []

    for (const file of files) {
      if (!file.trim()) continue
      try {
        const path = join(queueDir, file.trim())
        const content = await Bun.file(path).text()
        const task = JSON.parse(content)
        tasks.push({
          id: task.id,
          title: task.title,
          text: task.text,
          repo: task.repo,
          timestamp: task.timestamp,
          url: task.url,
        })
      } catch {
        // Skip invalid files
      }
    }

    return tasks.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10) // Show last 10
  } catch {
    return []
  }
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === "/api/submit" && req.method === "POST") {
      return handleSubmit(req)
    }

    if (url.pathname === "/api/status" && req.method === "GET") {
      const tasks = await getQueueStatus()
      return Response.json({ tasks })
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
