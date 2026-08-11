#!/usr/bin/env bun
/**
 * Render.com server — serves dashboard + Halo API
 * Start command: bun bin/server.ts
 * PORT defaults to 3000, override with PORT env var
 */

import { join } from "path"

const PORT = parseInt(process.env.PORT || "3000")
const MOLLY_DIR = process.env.PWD || process.cwd()

const haloRouter = async (req: Request): Promise<Response> => {
  const url = new URL(req.url)
  const pathname = url.pathname

  // Route /api/halo
  if (pathname === "/api/halo") {
    if (req.method === "POST") {
      const body = await req.json() as any
      const id = `halo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      return new Response(
        JSON.stringify({
          routing: "local-queued",
          id,
          pollUrl: `/api/halo?id=${id}`,
          displayText: "Question queued locally"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }
    if (req.method === "GET") {
      const id = url.searchParams.get("id")
      return new Response(
        JSON.stringify({
          id,
          status: "pending",
          queuedAt: new Date().toISOString()
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }
  }

  // Route /api/heartbeat
  if (pathname === "/api/heartbeat" && req.method === "POST") {
    return new Response(
      JSON.stringify({ ok: true, ts: Date.now() }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  }

  // Route /api/health
  if (pathname === "/api/health" && req.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        heartbeat: { fresh: true, ageMs: 0 },
        budget: { spentCents: 0, capCents: 200, remainingCents: 200, month: new Date().toISOString().slice(0, 7) }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  }

  return new Response("Not found", { status: 404 })
}

const serveStatic = async (pathname: string): Promise<Response | null> => {
  try {
    let filePath = pathname === "/" ? "/index.html" : pathname

    // Security: prevent directory traversal
    if (filePath.includes("..")) {
      return new Response("Forbidden", { status: 403 })
    }

    const fullPath = join(MOLLY_DIR, filePath)
    const file = Bun.file(fullPath)

    if (await file.exists()) {
      const mimeTypes: Record<string, string> = {
        ".html": "text/html",
        ".json": "application/json",
        ".js": "application/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".svg": "image/svg+xml"
      }

      const ext = filePath.slice(filePath.lastIndexOf("."))
      const contentType = mimeTypes[ext] || "application/octet-stream"

      return new Response(file, {
        status: 200,
        headers: { "Content-Type": contentType }
      })
    }
  } catch (e) {
    // Ignore file errors, fall through to 404
  }

  return null
}

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request) {
    const url = new URL(req.url)

    // API routes
    if (url.pathname.startsWith("/api/")) {
      return haloRouter(req)
    }

    // Static files
    const staticResponse = await serveStatic(url.pathname)
    if (staticResponse) {
      return staticResponse
    }

    // Default to index.html for SPA routing
    const indexResponse = await serveStatic("/")
    return indexResponse || new Response("Not found", { status: 404 })
  }
})

console.log(`✓ Dashboard running at http://localhost:${PORT}`)
console.log(`  Dashboard: http://localhost:${PORT}/`)
console.log(`  API: http://localhost:${PORT}/api/halo`)
