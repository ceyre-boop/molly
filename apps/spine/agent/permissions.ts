// Three-tier authority for the Molly agent.
//
//   Tier 1 — auto-allow: scoped read-only allowlist. Logged, never prompted.
//   Tier 2 — confirm-required: writes/sends/merges. Round-trips the voice
//            transport (canUseTool-style gate). Fails closed on no/timeout.
//   Tier 3 — hard deny: PreToolUse-style guard, evaluated FIRST and
//            unconditionally. Holds even if the Tier-2 gate is bypassed,
//            misconfigured, or replaced. Denials, not prompts. Not overridable
//            by prompt engineering, session history, or repeated requests.
//
// Session scope (declaredRepos, allowDestructiveGit) is fixed at session
// start and never mutated mid-session — the repo-scope confirm gate is
// load-bearing from this phase.

import type { VoiceTransport } from "./voice-transport"
import { auditLog } from "./audit"

export type Tier = 1 | 2 | 3

export interface AgentSession {
  id: string
  /** Repos this session may target. Fixed at session start. Empty = none. */
  declaredRepos: readonly string[]
  /** Destructive-git override. Only settable at session start, never mid-session. */
  allowDestructiveGit: boolean
  transport: VoiceTransport
  /** Dry-run: governed tools simulate instead of executing side effects. */
  dryRun: boolean
}

export function createSession(opts: {
  id: string
  transport: VoiceTransport
  declaredRepos?: string[]
  allowDestructiveGit?: boolean
  dryRun?: boolean
}): AgentSession {
  // Freeze scope at creation — nothing downstream can widen it.
  return Object.freeze({
    id: opts.id,
    declaredRepos: Object.freeze([...(opts.declaredRepos ?? [])]),
    allowDestructiveGit: opts.allowDestructiveGit ?? false,
    transport: opts.transport,
    dryRun: opts.dryRun ?? true,
  })
}

// ── Tier 1 allowlist ────────────────────────────────────────────────────────

const TIER1_ALLOWLIST = new Set([
  "people_lookup", // identity graph lookups
  "recall", // memory recall
  "status_check", // spine health / status reads
  "dashboard_read", // TABOOST dashboard reads
  "calendar_read", // Google Calendar, read-only scope — pure observation
])

// ── Tier 3 hardcoded denial patterns ────────────────────────────────────────

// Live trading / capital movement on Sovereign/Alta
const TRADING_TERMS = /\b(trade|trading|execute|execution|order|position|capital|buy|sell)\b/i
const TRADING_TARGETS = /\b(sovereign|alta)\b/i

// Financial transfer / wire / account-linking
const FINANCIAL = /\b(wire|transfer\s+(funds|money)|withdraw|deposit|account[-\s]?link(ing)?|routing\s+number|iban|swift\s+code|send\s+money)\b/i

// Destructive git — force pushes to protected branches, history rewrites
const DESTRUCTIVE_GIT = /\b(push\s+[^\n]*(-f\b|--force)|force[-\s]?push|filter-branch|filter-repo|git\s+reset\s+--hard\s+origin|rewrite\s+history|history\s+rewrite)\b/i
const PROTECTED_BRANCHES = /\b(main|molly-spine)\b/i

export interface GuardResult {
  denied: boolean
  reason?: string
}

/**
 * Tier-3 guard. PreToolUse semantics: called first, always, in the execution
 * path. Its verdict cannot be reversed by any confirm gate.
 */
export function preToolUseGuard(
  toolName: string,
  input: Record<string, unknown>,
  session: AgentSession
): GuardResult {
  const blob = `${toolName} ${JSON.stringify(input)}`

  if (TRADING_TARGETS.test(blob) && TRADING_TERMS.test(blob)) {
    return { denied: true, reason: "Tier 3: touches Sovereign/Alta live trading or capital movement" }
  }

  if (FINANCIAL.test(blob)) {
    return { denied: true, reason: "Tier 3: matches financial transfer / wire / account-linking" }
  }

  if (DESTRUCTIVE_GIT.test(blob) && PROTECTED_BRANCHES.test(blob) && !session.allowDestructiveGit) {
    return {
      denied: true,
      reason: "Tier 3: destructive git on protected branch (override only at session start)",
    }
  }

  // Repo scope: any repo-targeting input must name a declared repo.
  const repo = typeof input.repo === "string" ? input.repo : null
  if (repo !== null && !session.declaredRepos.includes(repo)) {
    return {
      denied: true,
      reason: `Tier 3: repo "${repo}" not in this session's declared scope [${session.declaredRepos.join(", ") || "none"}]`,
    }
  }
  if (toolName === "run_claude_code" && repo === null) {
    return { denied: true, reason: "Tier 3: run_claude_code requires an explicitly declared target repo" }
  }

  return { denied: false }
}

export function classifyTier(
  toolName: string,
  input: Record<string, unknown>,
  session: AgentSession
): Tier {
  if (preToolUseGuard(toolName, input, session).denied) return 3
  if (TIER1_ALLOWLIST.has(toolName)) return 1
  return 2
}

// ── Tier 2 confirm gate (canUseTool semantics) ──────────────────────────────

const CONFIRM_TIMEOUT_MS = 20_000

export async function canUseTool(
  toolName: string,
  input: Record<string, unknown>,
  session: AgentSession
): Promise<{ allowed: boolean; outcome: "confirmed-yes" | "confirmed-no" | "confirm-timeout" }> {
  const description = summarizeCall(toolName, input)
  await session.transport.speak(`Confirm: ${description}. Yes or no?`)
  const answer = await session.transport.listenForConfirm(CONFIRM_TIMEOUT_MS)
  if (answer === "yes") return { allowed: true, outcome: "confirmed-yes" }
  return { allowed: false, outcome: answer === "no" ? "confirmed-no" : "confirm-timeout" }
}

// ── Governed execution pipeline ─────────────────────────────────────────────

export type ToolExecutor = (
  toolName: string,
  input: Record<string, unknown>,
  session: AgentSession
) => Promise<string> | string

/**
 * The single choke point every agent tool call goes through:
 *   guard (tier 3) → classify → tier-2 confirm if needed → execute → audit.
 */
export async function governedExecute(
  toolName: string,
  input: Record<string, unknown>,
  session: AgentSession,
  executor: ToolExecutor
): Promise<string> {
  // Tier 3 first, unconditionally. Not reversible downstream.
  const guard = preToolUseGuard(toolName, input, session)
  if (guard.denied) {
    auditLog({
      session_id: session.id,
      tool: toolName,
      tier: 3,
      outcome: "denied-tier3",
      tokens: 0,
      summary: guard.reason ?? "tier-3 denial",
    })
    return `[DENIED] ${guard.reason}`
  }

  const tier = classifyTier(toolName, input, session)

  if (tier === 2) {
    const verdict = await canUseTool(toolName, input, session)
    if (!verdict.allowed) {
      auditLog({
        session_id: session.id,
        tool: toolName,
        tier: 2,
        outcome: verdict.outcome,
        tokens: 0,
        summary: `blocked: ${summarizeCall(toolName, input)}`,
      })
      return `[NOT CONFIRMED] ${toolName} was not approved (${verdict.outcome}).`
    }
    const result = await executor(toolName, input, session)
    auditLog({
      session_id: session.id,
      tool: toolName,
      tier: 2,
      outcome: "confirmed-yes",
      tokens: 0,
      summary: summarizeCall(toolName, input),
    })
    return result
  }

  // Tier 1 — execute, log, no prompt.
  const result = await executor(toolName, input, session)
  auditLog({
    session_id: session.id,
    tool: toolName,
    tier: 1,
    outcome: "allowed",
    tokens: 0,
    summary: summarizeCall(toolName, input),
  })
  return result
}

export function summarizeCall(toolName: string, input: Record<string, unknown>): string {
  const parts = Object.entries(input)
    .filter(([, v]) => typeof v === "string" && (v as string).length > 0)
    .map(([k, v]) => `${k}=${String(v).slice(0, 60)}`)
    .join(", ")
  return `${toolName}(${parts})`
}
