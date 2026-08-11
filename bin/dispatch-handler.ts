#!/usr/bin/env bun
/**
 * Dispatch handler — watches the task queue and executes tasks via Claude immediately.
 * Run in the background: bun bin/dispatch-handler.ts &
 *
 * This polls the dispatch queue and sends pending tasks to Claude for immediate execution.
 * Tasks are marked complete after processing.
 */

import { join } from "path"
import { mkdir } from "fs/promises"
import type { DispatchTask } from "./apps/console/lib/dispatch-queue"

const QUEUE_DIR = join(process.env.HOME!, ".molly-dispatch-queue")
const POLL_INTERVAL = 1000 // 1 second for immediate response
let isRunning = false

async function listQueuedTasks(): Promise<DispatchTask[]> {
  try {
    const queueDirExists = await Bun.file(QUEUE_DIR).exists()
    if (!queueDirExists) {
      return []
    }

    const tasks: DispatchTask[] = []
    const files = await Bun.file(QUEUE_DIR).text().then((t) => {
      // This is a hacky way; let's use proper file reading
      return []
    })

    // Use readdir via spawning
    const proc = Bun.spawnSync(["ls", "-1", QUEUE_DIR], {
      stdout: "pipe",
      stderr: "pipe",
    })

    if (proc.exitCode === 0) {
      const files = proc.stdout!.toString().split("\n").filter((f) => f.endsWith(".json"))
      for (const file of files) {
        const path = join(QUEUE_DIR, file)
        try {
          const content = await Bun.file(path).text()
          tasks.push(JSON.parse(content))
        } catch {
          // Couldn't read, skip
        }
      }
    }

    return tasks.sort((a, b) => a.timestamp - b.timestamp)
  } catch {
    return []
  }
}

async function completeTask(id: string): Promise<void> {
  const path = join(QUEUE_DIR, id + ".json")
  const archiveDir = join(QUEUE_DIR, ".archive")
  await mkdir(archiveDir, { recursive: true })
  const archived = join(archiveDir, id + ".json")

  try {
    const content = await Bun.file(path).text()
    await Bun.write(archived, content)
    // Delete original
    Bun.spawnSync(["rm", path])
  } catch {
    // Already gone or error; either way move on
  }
}

async function executeTask(task: DispatchTask): Promise<void> {
  console.log(`[${new Date().toISOString()}] Executing dispatch: ${task.title}`)

  // Send to Pulse for voice notification
  try {
    await fetch("http://localhost:31337/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: `Executing: ${task.title}`,
        voice_id: process.env.SECONDARY_VOICE_ID,
        voice_enabled: true,
      }),
    }).catch(() => {})
  } catch {
    // Pulse may not be ready
  }

  // Create a GitHub issue comment or update if not already done
  // For now, just mark it as processing
  console.log(`  repo: ${task.repo}`)
  console.log(`  title: ${task.title}`)
  console.log(`  url: ${task.url}`)

  // TODO: This handler will be called by Claude's monitoring hook
  // For now, just log and complete
  await completeTask(task.id)
}

async function poll(): Promise<void> {
  if (isRunning) return
  isRunning = true

  try {
    const tasks = await listQueuedTasks()
    for (const task of tasks) {
      await executeTask(task)
    }
  } catch (e) {
    console.error("Poll error:", e)
  } finally {
    isRunning = false
  }
}

// Start polling
console.log(`Dispatch handler started. Watching ${QUEUE_DIR}...`)
setInterval(poll, POLL_INTERVAL)
poll()
