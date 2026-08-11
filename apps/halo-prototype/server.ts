#!/usr/bin/env bun
import { join } from "path"
import { describeImage } from "./lib/anthropic"

const PUBLIC_DIR = join(import.meta.dir, "public")
const PORT = Number(process.env.PORT ?? 3000)

const build = await Bun.build({
  entrypoints: [join(PUBLIC_DIR, "client.ts")],
  target: "browser",
})

if (!build.success) {
  for (const log of build.logs) console.error(log)
  throw new Error("Halo prototype: client build failed")
}

const clientJs = await build.outputs[0].text()

function checkAuth(req: Request): boolean {
  const secret = process.env.HALO_SHARED_SECRET
  if (!secret) return true // permissive when unset (for solo testing)
  const auth = req.headers.get("authorization")
  return auth === `Bearer ${secret}`
}

async function handleDescribe(req: Request): Promise<Response> {
  if (!checkAuth(req))
    return Response.json({ error: "unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const image = typeof body?.image === "string" ? body.image : null
  const mode = body?.mode === "read" ? "read" : "ambient"

  if (!image)
    return Response.json({ error: "missing image" }, { status: 400 })

  try {
    const text = await describeImage(image, mode)
    return Response.json({ text })
  } catch (err) {
    console.error("describe failed:", err)
    return Response.json({ error: "describe failed" }, { status: 502 })
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === "/api/describe" && req.method === "POST")
      return handleDescribe(req)

    if (url.pathname === "/client.js")
      return new Response(clientJs, {
        headers: { "content-type": "text/javascript" },
      })

    if (url.pathname === "/styles.css")
      return new Response(Bun.file(join(PUBLIC_DIR, "styles.css")))

    if (url.pathname === "/" || url.pathname === "/index.html")
      return new Response(Bun.file(join(PUBLIC_DIR, "index.html")))

    return new Response("Not found", { status: 404 })
  },
})

console.log(`Halo prototype → http://localhost:${server.port}`)
