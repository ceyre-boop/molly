// Signed confirm links — step 3 of the Donna sequencing. Kills the mock:
// a Tier-2 action parks a signed pending record; Colin taps Approve/Deny on
// the dashboard or the signed URL from any device; the waiting confirm gate
// sees the resolution and the pipeline proceeds (or fails closed).
//
// Same VoiceTransport seam as everything else — permission logic unchanged.
// Voice (Halo, Phase 4) layers on top later.
//
// Security notes:
// - Every pending action carries a random 32-hex token; resolving requires it.
// - pending_confirms is NOT exported by lib/backup.ts (backups are public).
// - The confirm page is a form POST, never a bare GET side effect — link
//   prefetchers must not be able to approve actions.
import { db } from "../lib/memory"
import type { VoiceTransport, ConfirmResult } from "./voice-transport"

db.run(`
  CREATE TABLE IF NOT EXISTS pending_confirms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    token TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    resolved_at INTEGER
  );
`)

const EXPIRY_MS = 30 * 60 * 1000

export interface PendingConfirm {
  id: number
  description: string
  token: string
  status: "pending" | "approved" | "denied" | "expired"
  created_at: number
  resolved_at: number | null
}

function publicUrl(): string {
  return process.env.SPINE_PUBLIC_URL ?? "https://molly-gz19.onrender.com"
}

export function createPending(description: string): PendingConfirm {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return db
    .query(
      "INSERT INTO pending_confirms (description, token, status, created_at) VALUES (?, ?, 'pending', ?) RETURNING *"
    )
    .get(description, token, Date.now()) as PendingConfirm
}

export function confirmUrl(p: PendingConfirm): string {
  return `${publicUrl()}/confirm?id=${p.id}&t=${p.token}`
}

function expireIfStale(row: PendingConfirm): PendingConfirm {
  if (row.status === "pending" && Date.now() - row.created_at > EXPIRY_MS) {
    db.query("UPDATE pending_confirms SET status = 'expired', resolved_at = ? WHERE id = ?").run(Date.now(), row.id)
    return { ...row, status: "expired" }
  }
  return row
}

export function getPending(id: number): PendingConfirm | null {
  const row = db.query("SELECT * FROM pending_confirms WHERE id = ?").get(id) as PendingConfirm | null
  return row ? expireIfStale(row) : null
}

export function listOpenConfirms(): PendingConfirm[] {
  const rows = db
    .query("SELECT * FROM pending_confirms WHERE status = 'pending' ORDER BY id DESC LIMIT 10")
    .all() as PendingConfirm[]
  return rows.map(expireIfStale).filter((r) => r.status === "pending")
}

export function resolveConfirm(
  id: number,
  token: string,
  decision: "approve" | "deny"
): { ok: boolean; error?: string } {
  const row = getPending(id)
  if (!row) return { ok: false, error: "unknown confirm" }
  if (row.status !== "pending") return { ok: false, error: `already ${row.status}` }
  if (row.token !== token) return { ok: false, error: "bad token" }

  db.query("UPDATE pending_confirms SET status = ?, resolved_at = ? WHERE id = ? AND status = 'pending'").run(
    decision === "approve" ? "approved" : "denied",
    Date.now(),
    id
  )
  return { ok: true }
}

// ── The transport ───────────────────────────────────────────────────────────

export class LinkConfirmTransport implements VoiceTransport {
  /** Longer than the voice default — a human has to notice and tap. */
  confirmTimeoutMs = 120_000
  private pendingId: number | null = null

  async speak(text: string): Promise<void> {
    const p = createPending(text)
    this.pendingId = p.id
    console.log(`[confirm-link] pending #${p.id}: ${text} → ${confirmUrl(p)}`)
  }

  async listenForConfirm(timeoutMs: number): Promise<ConfirmResult> {
    if (this.pendingId === null) return "no" // nothing was ever asked — fail closed
    const id = this.pendingId
    this.pendingId = null
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const row = getPending(id)
      if (!row) return "no"
      if (row.status === "approved") return "yes"
      if (row.status === "denied") return "no"
      if (row.status === "expired") return "timeout"
      await new Promise((r) => setTimeout(r, 2000))
    }
    // Window closed with no tap: expire the row so a later stray tap can't
    // approve an action whose request has already failed closed.
    db.query("UPDATE pending_confirms SET status = 'expired', resolved_at = ? WHERE id = ? AND status = 'pending'").run(
      Date.now(),
      id
    )
    return "timeout"
  }
}
