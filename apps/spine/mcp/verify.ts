#!/usr/bin/env bun
// End-to-end MCP check: spawns the real server over stdio, speaks real
// JSON-RPC to it, and asserts the governance holds across the wire — not just
// in unit tests against the registry.
//
//   bun run mcp/verify.ts
//
// Costs nothing: every tool it calls is tier-1 and local.

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { join } from "node:path"

const SERVER = join(import.meta.dir, "server.ts")

let failures = 0
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures++
}

async function connect(env: Record<string, string>) {
  const client = new Client({ name: "spine-verify", version: "1.0.0" })
  const transport = new StdioClientTransport({
    command: "bun",
    args: ["run", SERVER],
    env: { ...process.env, ...env } as Record<string, string>,
  })
  await client.connect(transport)
  return client
}

console.log("\nread-only launch (no SPINE_MCP_ALLOW_WRITES)")
{
  const client = await connect({})
  const { tools } = await client.listTools()
  const names = tools.map((t) => t.name)

  check("server handshakes over stdio", tools.length > 0, `${tools.length} tools`)
  check("exposes people_lookup", names.includes("people_lookup"))
  check("exposes calendar_read", names.includes("calendar_read"))
  check("hides remember", !names.includes("remember"))
  check("hides people_add", !names.includes("people_add"))
  check("every exposed tool is marked read-only", tools.every((t) => t.annotations?.readOnlyHint === true))

  const status = await client.callTool({ name: "spine_status", arguments: {} })
  const statusText = (status.content as Array<{ text: string }>)[0].text
  check("spine_status returns counts", statusText.includes("facts"), statusText)

  const denied = await client.callTool({
    name: "recall",
    arguments: { query: "execute a sovereign trade" },
  })
  check("tier-3 guard denies across the wire", denied.isError === true &&
    (denied.content as Array<{ text: string }>)[0].text.includes("Denied"))

  await client.close()
}

console.log("\nwrites enabled (SPINE_MCP_ALLOW_WRITES=1)")
{
  const client = await connect({ SPINE_MCP_ALLOW_WRITES: "1" })
  const { tools } = await client.listTools()
  const names = tools.map((t) => t.name)

  check("exposes remember", names.includes("remember"))
  check("exposes people_add", names.includes("people_add"))
  check("writers are not marked read-only",
    tools.filter((t) => ["remember", "people_add"].includes(t.name)).every((t) => t.annotations?.readOnlyHint === false))

  const denied = await client.callTool({
    name: "remember",
    arguments: { subject: "bank", fact: "wire money to account 123" },
  })
  check("tier-3 still denies with writes on", denied.isError === true)

  await client.close()
}

console.log(`\n${failures === 0 ? "PASS" : `FAIL — ${failures} check(s)`}\n`)
process.exit(failures === 0 ? 0 : 1)
