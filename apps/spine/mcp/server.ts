#!/usr/bin/env bun
// Molly spine — MCP server (stdio).
//
// Registers with Claude Code via .mcp.json at the repo root. Claude Code holds
// the subscription and runs the loop; this process contributes Molly's
// identity graph, memory, calendar and brief as tools.
//
// Read-only by default. Set SPINE_MCP_ALLOW_WRITES=1 to expose the two tools
// that mutate the identity graph.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { activeTools, createMcpSession, dispatch, writesEnabled } from "./registry"

// stdout is the JSON-RPC channel. Any library that console.logs would corrupt
// the stream and the server would fail in a way that looks like a client bug,
// so every console channel is rerouted to stderr before anything else runs.
for (const level of ["log", "info", "debug", "warn"] as const) {
  console[level] = (...args: unknown[]) => process.stderr.write(args.map(String).join(" ") + "\n")
}

const session = createMcpSession()
const server = new McpServer(
  { name: "molly-spine", version: "1.0.0" },
  {
    instructions:
      "Molly's spine: Colin's identity graph, durable memory, calendar and morning brief. " +
      "Use people_lookup and recall before asking Colin something he has already told you.",
  }
)

for (const tool of activeTools()) {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.shape,
      annotations: { readOnlyHint: tool.tier === 1 },
    },
    async (args: Record<string, unknown>) => {
      const result = await dispatch(tool.name, args ?? {}, session)
      return { content: [{ type: "text" as const, text: result.text }], isError: result.isError }
    }
  )
}

const transport = new StdioServerTransport()
await server.connect(transport)

console.error(
  `molly-spine MCP ready — ${activeTools().length} tools, writes ${writesEnabled() ? "ENABLED" : "disabled"}`
)
