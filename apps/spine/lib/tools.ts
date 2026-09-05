// Tool registry — what the agent can do locally, at zero API cost per execution.
// Google connectors land here in Phase C as gmail_search / calendar_read.
import { addFactIndexed, recallFacts } from "./memory"
import { addPerson, searchPeople } from "./people"

export interface ToolDef {
  name: string
  description: string
  input_schema: {
    type: "object"
    properties: Record<string, { type: string; description: string }>
    required: string[]
  }
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "people_lookup",
    description:
      "Search Colin's identity graph for a person by name, role, org, or notes. Returns real people with real history.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name or keyword to search for" },
      },
      required: ["query"],
    },
  },
  {
    name: "people_add",
    description: "Add a person to the identity graph with their real name and context.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Person's real name" },
        role: { type: "string", description: "Their role, e.g. 'engineer'" },
        org: { type: "string", description: "Organization, e.g. 'TABOOST'" },
        notes: { type: "string", description: "Any context worth keeping" },
      },
      required: ["name"],
    },
  },
  {
    name: "remember",
    description: "Store a durable fact so future conversations can recall it.",
    input_schema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "What the fact is about" },
        fact: { type: "string", description: "The fact itself" },
      },
      required: ["subject", "fact"],
    },
  },
  {
    name: "recall",
    description: "Search stored facts from previous conversations.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keyword to search facts for" },
      },
      required: ["query"],
    },
  },
]

// Async because recall and remember now go through the embedding server.
// governedExecute and the MCP dispatch already await their executor, so this
// costs the callers nothing.
export async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "people_lookup": {
      const results = searchPeople(String(input.query ?? ""))
      if (results.length === 0) return "No matches in the identity graph."
      return JSON.stringify(
        results.map((p) => ({ name: p.name, role: p.role, org: p.org, notes: p.notes }))
      )
    }
    case "people_add": {
      const p = addPerson(
        String(input.name ?? ""),
        String(input.role ?? ""),
        String(input.org ?? ""),
        String(input.notes ?? "")
      )
      return `Added ${p.name} to the identity graph (id ${p.id}).`
    }
    case "remember": {
      const r = await addFactIndexed(String(input.subject ?? ""), String(input.fact ?? ""), "agent")
      // Report the verdict rather than claiming a write that did not happen.
      // "Remembered" for something the store already knew is a small lie that
      // makes the agent re-tell Colin things it never actually saved.
      const verb = { store: "Remembered", merge: "Updated", drop: "Already knew" }[r.verdict]
      return `${verb}: [${r.fact.subject}] ${r.fact.fact}${r.verdict === "store" ? "" : ` — ${r.reason}`}`
    }
    case "recall": {
      // Hybrid: exact substring UNION vector neighbours. Literal-only is why
      // "when is my math exam" used to miss a fact about a calculus final.
      const results = await recallFacts(String(input.query ?? ""))
      if (results.length === 0) return "No stored facts match."
      return JSON.stringify(results.map((f) => ({ subject: f.subject, fact: f.fact, via: f.via })))
    }
    default:
      return `Unknown tool: ${name}`
  }
}
