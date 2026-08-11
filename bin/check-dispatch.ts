#!/usr/bin/env bun
/**
 * Check dispatch queue — list pending tasks waiting for Claude execution.
 * Used by Claude session to fetch and execute tasks immediately.
 *
 * Usage:
 *   bun bin/check-dispatch.ts                 # List pending tasks
 *   bun bin/check-dispatch.ts --execute <id>   # Mark task as executed
 */

import { join } from "path"
import { mkdir } from "fs/promises"

interface DispatchTask {
  id: string
  title: string
  text: string
  repo: string
  timestamp: number
  url?: string
}

const QUEUE_DIR = join(process.env.HOME!, ".molly-dispatch-queue")

async function listTasks(): Promise<DispatchTask[]> {
  try {
    const proc = Bun.spawnSync(["ls", "-1", QUEUE_DIR], {
      stdout: "pipe",
      stderr: "pipe",
    })

    if (proc.exitCode !== 0) return []

    const files = proc.stdout!.toString().split("\n").filter((f) => f.trim().endsWith(".json"))
    const tasks: DispatchTask[] = []

    for (const file of files) {
      if (!file.trim()) continue
      try {
        const path = join(QUEUE_DIR, file.trim())
        const content = await Bun.file(path).text()
        tasks.push(JSON.parse(content))
      } catch (e) {
        // Skip invalid files
      }
    }

    return tasks.sort((a, b) => a.timestamp - b.timestamp)
  } catch {
    return []
  }
}

async function archiveTask(id: string): Promise<boolean> {
  try {
    const archiveDir = join(QUEUE_DIR, ".archive")
    await mkdir(archiveDir, { recursive: true })

    const source = join(QUEUE_DIR, `${id}.json`)
    const dest = join(archiveDir, `${id}.json`)

    // Copy to archive
    const content = await Bun.file(source).text()
    await Bun.write(dest, content)

    // Remove from queue
    Bun.spawnSync(["rm", source])
    return true
  } catch {
    return false
  }
}

async function main() {
  const args = process.argv.slice(2)

  if (args[0] === "--execute" && args[1]) {
    const id = args[1]
    const ok = await archiveTask(id)
    if (ok) {
      console.log(`✓ Completed: ${id}`)
    } else {
      console.log(`✗ Failed to complete: ${id}`)
      process.exit(1)
    }
    return
  }

  const tasks = await listTasks()
  if (tasks.length === 0) {
    console.log("No pending tasks.")
    return
  }

  console.log(`\n📋 Dispatch Queue — ${tasks.length} pending task(s):\n`)
  for (const task of tasks) {
    const time = new Date(task.timestamp).toLocaleTimeString()
    console.log(`  [${time}] ${task.title}`)
    console.log(`         ID: ${task.id}`)
    console.log(`         Repo: ${task.repo}`)
    if (task.url) console.log(`         Issue: ${task.url}`)
    console.log()
  }

  console.log(`To execute a task: bun bin/check-dispatch.ts --execute <id>`)
}

main().catch(console.error)
