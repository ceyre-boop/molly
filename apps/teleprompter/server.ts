#!/usr/bin/env bun
// Static host for the teleprompter rig. No API keys, no network calls — the
// readability question is answered entirely in the browser.
import { join } from "path"

const PUBLIC_DIR = join(import.meta.dir, "public")
const PORT = Number(process.env.PORT ?? 3100)

const build = await Bun.build({
  entrypoints: [join(PUBLIC_DIR, "client.ts")],
  target: "browser",
})

if (!build.success) {
  for (const log of build.logs) console.error(log)
  throw new Error("Teleprompter: client build failed")
}

const clientJs = await build.outputs[0].text()

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const { pathname } = new URL(req.url)

    if (pathname === "/client.js")
      return new Response(clientJs, { headers: { "content-type": "text/javascript" } })

    if (pathname === "/styles.css")
      return new Response(Bun.file(join(PUBLIC_DIR, "styles.css")))

    if (pathname === "/" || pathname === "/index.html")
      return new Response(Bun.file(join(PUBLIC_DIR, "index.html")))

    return new Response("Not found", { status: 404 })
  },
})

console.log(`Teleprompter → http://localhost:${server.port}`)
