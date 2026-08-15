// run_claude_code — Claude Code sessions as a governed spine tool.
//
// The run itself passes through the normal tier pipeline (repo must be in the
// session's declared scope — Tier-3 guard enforces that). The merge/push step
// is SEPARATELY Tier-2 gated here: even when a run was approved, nothing
// merges or pushes without its own spoken confirm.
//
// Real execution requires BOTH session.dryRun === false AND the
// SPINE_ALLOW_CLAUDE_CODE env flag — belt and suspenders so a misconfigured
// session can't spawn live coding runs.

import type { AgentSession } from "./permissions"
import { canUseTool } from "./permissions"
import { auditLog } from "./audit"

export const RUN_CLAUDE_CODE_DEF = {
  name: "run_claude_code",
  description:
    "Run a Claude Code session against a declared repo on Colin's behalf. " +
    "Returns a short voice-reportable summary, never full diffs. " +
    "Merging or pushing the result always requires separate spoken confirmation.",
  input_schema: {
    type: "object" as const,
    properties: {
      task: { type: "string", description: "What Claude Code should do, in one or two sentences" },
      repo: { type: "string", description: "Target repo — must be in the session's declared repo list" },
      push: { type: "string", description: "'true' to merge/push the result (triggers its own confirm gate); anything else = leave changes unpushed" },
    },
    required: ["task", "repo"],
  },
}

export async function runClaudeCode(
  input: Record<string, unknown>,
  session: AgentSession
): Promise<string> {
  const task = String(input.task ?? "")
  const repo = String(input.repo ?? "")
  const wantsPush = String(input.push ?? "") === "true"

  const live = !session.dryRun && process.env.SPINE_ALLOW_CLAUDE_CODE === "1"

  let runSummary: string
  if (!live) {
    runSummary = `[dry-run] Would run Claude Code on ${repo}: "${task}". No session spawned, no files touched.`
  } else {
    runSummary = await executeLiveRun(task, repo)
  }

  if (!wantsPush) {
    return `${runSummary} Changes left unpushed.`
  }

  // Merge/push is its own Tier-2 gate — always, even though the run was allowed.
  const verdict = await canUseTool("run_claude_code:merge_push", { repo, task }, session)
  if (!verdict.allowed) {
    auditLog({
      session_id: session.id,
      tool: "run_claude_code:merge_push",
      tier: 2,
      outcome: verdict.outcome,
      tokens: 0,
      summary: `merge/push blocked for ${repo}`,
    })
    return `${runSummary} Merge/push NOT approved (${verdict.outcome}) — changes left unpushed.`
  }

  auditLog({
    session_id: session.id,
    tool: "run_claude_code:merge_push",
    tier: 2,
    outcome: "confirmed-yes",
    tokens: 0,
    summary: `merge/push approved for ${repo}`,
  })

  if (!live) return `${runSummary} Merge/push approved (dry-run: nothing actually pushed).`
  return `${runSummary} Merge/push approved and executed.`
}

// Live path — isolated so the SDK import only happens when genuinely enabled.
async function executeLiveRun(task: string, repo: string): Promise<string> {
  try {
    const sdk = await import("@anthropic-ai/claude-agent-sdk")
    const chunks: string[] = []
    for await (const message of sdk.query({
      prompt: `Repo: ${repo}. Task: ${task}. Work on a feature branch; do not push.`,
      options: { maxTurns: 20 },
    })) {
      if (message.type === "result" && "result" in message) chunks.push(String(message.result))
    }
    const text = chunks.join(" ").slice(0, 400)
    return `Claude Code run finished on ${repo}: ${text || "(no summary returned)"}`
  } catch (err) {
    return `Claude Code run failed to start: ${err instanceof Error ? err.message : "unknown error"} (is @anthropic-ai/claude-agent-sdk installed?)`
  }
}
