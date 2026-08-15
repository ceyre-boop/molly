#!/usr/bin/env bun
// End-to-end proof of the spine's core loop, run against a live deployment.
//
//   bun run verify.ts                                  # local server
//   bun run verify.ts --url https://molly-gz19.onrender.com
//
// Safe by design: if reasoning is offline ($0 budget), it reports that and
// exits without spending anything. When reasoning is live, the full run costs
// a few cents (3 Haiku calls with tools).

export {} // module marker — enables top-level await under tsc

const args = process.argv.slice(2)
const urlFlag = args.indexOf("--url")
const BASE = urlFlag >= 0 ? args[urlFlag + 1] : "http://localhost:3000"
const SECRET = process.env.SPINE_SHARED_SECRET

const headers: Record<string, string> = { "content-type": "application/json" }
if (SECRET) headers.authorization = `Bearer ${SECRET}`

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

async function api(path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

console.log(`\nSpine end-to-end verification → ${BASE}\n`)

// 0. Governance dry run — in-process, $0-safe, runs BEFORE anything paid.
// Simulates a tier-1 / tier-2 / tier-3 sequence through the real permission
// pipeline with the mock voice transport, then asserts the audit log is
// complete and well-formed.
console.log("— Governance dry run ($0-safe) —")
{
  const { createSession, governedExecute } = await import("./agent/permissions")
  const { MockVoiceTransport } = await import("./agent/voice-transport")
  const { sessionLog } = await import("./agent/audit")
  const { runClaudeCode } = await import("./agent/claude-code-tool")

  const transport = new MockVoiceTransport(["yes"])
  const gsession = createSession({
    id: `verify-gov-${Date.now().toString(36)}`,
    transport,
    declaredRepos: ["ceyre-boop/molly"],
    dryRun: true,
  })

  const t1 = await governedExecute("people_lookup", { query: "governance probe" }, gsession, () => "t1-ok")
  check("tier 1 executes with zero prompts", t1 === "t1-ok" && transport.spoken.length === 0)

  const t2 = await governedExecute("remember", { subject: "gov", fact: "tier2 probe" }, gsession, () => "t2-ok")
  check("tier 2 executed after mock voice confirm", t2 === "t2-ok" && transport.spoken.length === 1)

  const t3 = await governedExecute(
    "run_claude_code",
    { task: "probe", repo: "ceyre-boop/NOT-DECLARED" },
    gsession,
    () => "t3-should-never-run"
  )
  check("tier 3 hard-denied (undeclared repo)", t3.includes("DENIED"))

  const cc = await runClaudeCode({ task: "governance probe", repo: "ceyre-boop/molly" }, gsession)
  check("run_claude_code dry-run spawns nothing", cc.includes("dry-run") && cc.includes("unpushed"))

  const log = sessionLog(gsession.id)
  const wellFormed =
    log.length >= 3 &&
    log.every((e) => e.ts > 0 && e.tool.length > 0 && [1, 2, 3].includes(e.tier) && e.outcome.length > 0 && e.summary.length > 0)
  check("audit log complete and well-formed", wellFormed, `rows: ${log.length}`)
  console.log(`    log: ${log.map((e) => `T${e.tier}:${e.outcome}`).join(" | ")}`)
}
console.log("")

// 1. Health
const health = await api("/api/health")
check("health endpoint responds", health.ok === true)
console.log(`    reasoning: ${health.reasoning} | people: ${health.people} | facts: ${health.facts}`)

if (health.reasoning !== "ready") {
  console.log("\n⏸  Reasoning is offline — raise the API budget, then re-run.")
  console.log("   (No API spend occurred. Local storage checks still ran.)\n")
  process.exit(0)
}

// 2. Seed identity graph + memory via direct API (free, local)
const stamp = Date.now().toString(36)
const personName = `Vera Probe ${stamp}`
const { person } = await api("/api/people", {
  name: personName,
  role: "e2e verification probe",
  org: "Spine QA",
})
check("person added to identity graph", person?.name === personName)

// 3. Agent grounds an answer in the identity graph
const convId = `e2e-${stamp}`
const q1 = await api("/api/chat", {
  message: `Who is ${personName}? Check the identity graph.`,
  conversationId: convId,
})
check(
  "agent used people_lookup tool",
  (q1.toolCalls ?? []).includes("people_lookup"),
  `tools fired: ${JSON.stringify(q1.toolCalls)}`
)
check(
  "answer grounded in real graph data",
  typeof q1.text === "string" && q1.text.toLowerCase().includes("probe"),
  `got: ${q1.text?.slice(0, 100)}`
)

// 4. Agent stores a fact on request
const q2 = await api("/api/chat", {
  message: `Remember that the verification color for run ${stamp} is cobalt.`,
  conversationId: convId,
})
check(
  "agent used remember tool",
  (q2.toolCalls ?? []).includes("remember"),
  `tools fired: ${JSON.stringify(q2.toolCalls)}`
)

// 5. Agent recalls it (memory round-trip through a real question)
const q3 = await api("/api/chat", {
  message: `What is the verification color for run ${stamp}?`,
  conversationId: convId,
})
check(
  "recall round-trip returns the stored fact",
  typeof q3.text === "string" && q3.text.toLowerCase().includes("cobalt"),
  `got: ${q3.text?.slice(0, 100)}`
)

// 6. Spend visibility
const totalTokens = [q1, q2, q3].reduce(
  (n, q) => n + (q.tokens ? q.tokens.input + q.tokens.output : 0),
  0
)
console.log(`\n  tokens spent: ~${totalTokens} (≈ $${((totalTokens / 1000) * 0.002).toFixed(4)})`)

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
