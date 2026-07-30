#!/usr/bin/env bun
/**
 * molly — the write-side of the Molly Dashboard.
 *
 * The dashboard (index.html) is read-only: it polls state/agent-state.json every
 * 5s and reads config/tasks.json as the board seed. This CLI is the only thing
 * that writes them, so the agent never hand-authors JSON.
 *
 * Usage:
 *   bun molly.ts status <idle|thinking|working|spawning> ["message"]
 *   bun molly.ts heartbeat
 *   bun molly.ts subagents <name...>            # empty list clears
 *   bun molly.ts add <todo|progress|done|archived> "title" [--tag Alta]
 *   bun molly.ts move <id-or-title-substring> <todo|progress|done|archived>
 *   bun molly.ts done <id-or-title-substring>
 *   bun molly.ts rm <id-or-title-substring>
 *   bun molly.ts log "what happened"
 *   bun molly.ts deliverable "title" [--icon 📊] [--tag Folder]
 *   bun molly.ts show
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join, dirname } from "path"

const ROOT = dirname(Bun.fileURLToPath(import.meta.url))
const TASKS = join(ROOT, "config", "tasks.json")
const STATE = join(ROOT, "state", "agent-state.json")
const LOG_CAP = 60
const COLUMNS = ["todo", "progress", "done", "archived"] as const
type Column = (typeof COLUMNS)[number]

const STATUSES = ["idle", "thinking", "working", "spawning"] as const
type Status = (typeof STATUSES)[number]

interface Card { id: string; column: string; title: string; date: string; tag?: string }
interface Deliverable { icon: string; title: string; date: string; tag: string }
interface LogEntry { ts: string; text: string }
interface Board {
  version: number
  updated: string
  columns: { id: string; title: string; icon: string }[]
  cards: Card[]
  deliverables: Deliverable[]
  notes: string
  log: LogEntry[]
}
interface AgentState {
  name: string
  avatar: string
  status: Status
  message: string
  heartbeat: string
  currentTask: string | null
  subagents: string[]
}

// ── io ─────────────────────────────────────────────────────────────

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T
  } catch (err) {
    die(`${path} is not valid JSON — refusing to overwrite it.\n  ${String(err)}`)
  }
}

/** Write via a temp file + rename so the dashboard never polls a half-written file. */
function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n")
  Bun.spawnSync(["mv", tmp, path])
}

const nowISO = () => new Date().toISOString()
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function die(msg: string): never {
  console.error(`molly: ${msg}`)
  process.exit(1)
}

// ── board ──────────────────────────────────────────────────────────

const emptyBoard: Board = {
  version: 1,
  updated: today(),
  columns: [
    { id: "todo", title: "To Do", icon: "📋" },
    { id: "progress", title: "In Progress", icon: "⚡" },
    { id: "done", title: "Done", icon: "✅" },
    { id: "archived", title: "Archived", icon: "📦" },
  ],
  cards: [],
  deliverables: [],
  notes: "",
  log: [],
}

const loadBoard = () => readJson<Board>(TASKS, emptyBoard)

function saveBoard(board: Board, entry?: string): void {
  if (entry) {
    board.log.unshift({ ts: nowISO(), text: entry })
    if (board.log.length > LOG_CAP) board.log.length = LOG_CAP
  }
  board.updated = today()
  writeJson(TASKS, board)
  if (entry) console.log(entry)
}

const columnTitle = (board: Board, id: string) =>
  board.columns.find((c) => c.id === id)?.title ?? id

/** Resolve a card by exact id, else by unique case-insensitive title substring. */
function findCard(board: Board, needle: string): Card {
  const byId = board.cards.find((c) => c.id === needle)
  if (byId) return byId
  const q = needle.toLowerCase()
  const hits = board.cards.filter((c) => c.title.toLowerCase().includes(q))
  if (hits.length === 0) die(`no card matches "${needle}"`)
  if (hits.length > 1) {
    die(
      `"${needle}" matches ${hits.length} cards — be more specific:\n` +
        hits.map((c) => `  ${c.id}  ${c.title}`).join("\n"),
    )
  }
  return hits[0]!
}

function assertColumn(value: string): Column {
  if (!COLUMNS.includes(value as Column)) die(`unknown column "${value}" — use ${COLUMNS.join(" | ")}`)
  return value as Column
}

const newId = () =>
  `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

// ── agent state ────────────────────────────────────────────────────

const defaultState: AgentState = {
  name: "Molly",
  avatar: "⚡",
  status: "idle",
  message: "Ready for tasks",
  heartbeat: nowISO(),
  currentTask: null,
  subagents: [],
}

const loadState = () => readJson<AgentState>(STATE, defaultState)

function saveState(patch: Partial<AgentState>): AgentState {
  const next: AgentState = { ...loadState(), ...patch, heartbeat: nowISO() }
  writeJson(STATE, next)
  return next
}

/** Pull a `--flag value` pair out of argv, returning the value. */
function takeFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag)
  if (i === -1) return undefined
  const [, value] = args.splice(i, 2)
  return value
}

// ── commands ───────────────────────────────────────────────────────

const [cmd, ...rest] = process.argv.slice(2)

switch (cmd) {
  case "status": {
    const status = rest[0]
    if (!status || !STATUSES.includes(status as Status)) {
      die(`status needs one of: ${STATUSES.join(" | ")}`)
    }
    const message =
      rest.slice(1).join(" ") || (status === "idle" ? "Ready for tasks" : "Working…")
    const s = saveState({
      status: status as Status,
      message,
      currentTask: status === "idle" ? null : message,
    })
    console.log(`${s.name} → ${s.status}: ${s.message}`)
    break
  }

  case "heartbeat": {
    const s = saveState({})
    console.log(`heartbeat ${s.heartbeat} (${s.status})`)
    break
  }

  case "subagents": {
    const s = saveState({
      subagents: rest,
      status: rest.length ? "spawning" : loadState().status,
    })
    console.log(rest.length ? `spawned: ${s.subagents.join(", ")}` : "sub-agents cleared")
    break
  }

  case "add": {
    const column = assertColumn(rest[0] ?? "")
    const tag = takeFlag(rest, "--tag")
    const title = rest.slice(1).join(" ").trim()
    if (!title) die('add needs a title — molly.ts add todo "Fix the thing"')
    const board = loadBoard()
    board.cards.push({ id: newId(), column, title, date: today(), ...(tag ? { tag } : {}) })
    saveBoard(board, `Added “${title}” to ${columnTitle(board, column)}`)
    break
  }

  case "move": {
    const column = assertColumn(rest[1] ?? "")
    const board = loadBoard()
    const card = findCard(board, rest[0] ?? "")
    const from = columnTitle(board, card.column)
    if (card.column === column) die(`“${card.title}” is already in ${from}`)
    card.column = column
    saveBoard(board, `Moved “${card.title}” from ${from} → ${columnTitle(board, column)}`)
    break
  }

  case "done": {
    const board = loadBoard()
    const card = findCard(board, rest[0] ?? "")
    const from = columnTitle(board, card.column)
    card.column = "done"
    card.date = today()
    saveBoard(board, `Completed “${card.title}” (was ${from})`)
    break
  }

  case "rm": {
    const board = loadBoard()
    const card = findCard(board, rest[0] ?? "")
    board.cards = board.cards.filter((c) => c.id !== card.id)
    saveBoard(board, `Deleted “${card.title}”`)
    break
  }

  case "log": {
    const text = rest.join(" ").trim()
    if (!text) die("log needs something to say")
    saveBoard(loadBoard(), text)
    break
  }

  case "deliverable": {
    const icon = takeFlag(rest, "--icon") ?? "📄"
    const tag = takeFlag(rest, "--tag") ?? "Folder"
    const title = rest.join(" ").trim()
    if (!title) die("deliverable needs a title")
    const board = loadBoard()
    board.deliverables.unshift({ icon, title, date: today(), tag })
    saveBoard(board, `Delivered “${title}”`)
    break
  }

  case "show": {
    const board = loadBoard()
    const state = loadState()
    const ageSec = Math.round((Date.now() - new Date(state.heartbeat).getTime()) / 1000)
    console.log(`${state.avatar}  ${state.name} — ${state.status}: ${state.message}`)
    console.log(`   heartbeat ${ageSec}s ago${ageSec > 120 ? "  ⚠️  dashboard will show Local" : ""}`)
    if (state.subagents.length) console.log(`   sub-agents: ${state.subagents.join(", ")}`)
    console.log()
    for (const col of board.columns) {
      const cards = board.cards.filter((c) => c.column === col.id)
      console.log(`${col.icon} ${col.title} (${cards.length})`)
      for (const c of cards) console.log(`   ${c.id}  ${c.title}${c.tag ? `  [${c.tag}]` : ""}`)
    }
    break
  }

  default:
    console.log(readFileSync(import.meta.url.replace("file://", ""), "utf8").split("\n").slice(2, 21).join("\n").replace(/^ \* ?/gm, ""))
    process.exit(cmd ? 1 : 0)
}
