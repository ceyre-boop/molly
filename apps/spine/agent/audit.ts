// Audit trail — every governed tool call lands here, tier and outcome included.
// This is the record that makes the authority system inspectable after the fact.
import { db } from "../lib/memory"

db.run(`
  CREATE TABLE IF NOT EXISTS agent_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    ts INTEGER NOT NULL,
    tool TEXT NOT NULL,
    tier INTEGER NOT NULL,
    outcome TEXT NOT NULL,
    tokens INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL
  );
`)

export type Outcome =
  | "allowed" // tier 1, no confirm needed
  | "confirmed-yes" // tier 2, human said yes
  | "confirmed-no" // tier 2, human said no
  | "confirm-timeout" // tier 2, no answer in time — treated as no
  | "denied-tier3" // hard deny, hook-enforced
  | "session-summary" // end-of-session token accounting row

export interface AuditEntry {
  session_id: string
  ts: number
  tool: string
  tier: 1 | 2 | 3
  outcome: Outcome
  tokens: number
  summary: string
}

export function auditLog(entry: Omit<AuditEntry, "ts"> & { ts?: number }): void {
  db.query(
    "INSERT INTO agent_log (session_id, ts, tool, tier, outcome, tokens, summary) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    entry.session_id,
    entry.ts ?? Date.now(),
    entry.tool,
    entry.tier,
    entry.outcome,
    entry.tokens,
    entry.summary
  )
}

export function sessionLog(sessionId: string): AuditEntry[] {
  return db
    .query("SELECT session_id, ts, tool, tier, outcome, tokens, summary FROM agent_log WHERE session_id = ? ORDER BY id ASC")
    .all(sessionId) as AuditEntry[]
}

export function recentLog(limit = 50): AuditEntry[] {
  return db
    .query("SELECT session_id, ts, tool, tier, outcome, tokens, summary FROM agent_log ORDER BY id DESC LIMIT ?")
    .all(limit) as AuditEntry[]
}
