#!/usr/bin/env bun
/**
 * Monitor dispatch queue — watches for new tasks and alerts via Pulse.
 * Run in background: bun bin/monitor-dispatch.ts &
 *
 * When a new task arrives in the queue, sends a notification to Pulse
 * so Colin hears about it immediately. Tasks remain in queue until
 * explicitly marked complete (by Claude execution or check-dispatch.ts).
 */

import { join } from "path"

interface DispatchTask {
  id: string
  title: string
  text: string
  repo: string
  timestamp: number
  url?: string
}

const QUEUE_DIR = join(process.env.HOME!, ".molly-dispatch-queue")
const POLL_INTERVAL = 500 // Check every 500ms for immediate response
const NOTIFY_COOLDOWN = 1000 // Don't re-notify for 1 second

let lastNotified: { [id: string]: number } = {}
let lastFileCount = 0

async function listTaskIds(): Promise<string[]> {
  try {
    const proc = Bun.spawnSync(["ls", "-1", QUEUE_DIR], {
      stdout: "pipe",
      stderr: "pipe",
    })

    if (proc.exitCode !== 0) return []
    return proc.stdout!.toString()
      .split("\n")
      .filter((f) => f.trim().endsWith(".json"))
      .map((f) => f.trim())
  } catch {
    return []
  }
}

async function getTask(filename: string): Promise<DispatchTask | null> {
  try {
    const path = join(QUEUE_DIR, filename)
    const content = await Bun.file(path).text()
    return JSON.parse(content)
  } catch {
    return null
  }
}

async function notifyPulse(task: DispatchTask): Promise<void> {
  try {
    await fetch("http://localhost:31337/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: `Task ready: ${task.title}`,
        voice_id: process.env.PRIMARY_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
        voice_enabled: true,
      }),
    })
  } catch {
    // Pulse might not be available
  }
}

async function poll(): Promise<void> {
  try {
    const files = await listTaskIds()
    if (files.length !== lastFileCount) {
      console.log(`[${new Date().toISOString()}] Queue changed: ${files.length} tasks`)
      lastFileCount = files.length
    }

    for (const filename of files) {
      const task = await getTask(filename)
      if (!task) continue

      const lastNotifyTime = lastNotified[task.id] || 0
      const now = Date.now()
      const sinceLastNotify = now - lastNotifyTime

      // Only notify if cooldown has passed
      if (sinceLastNotify > NOTIFY_COOLDOWN) {
        console.log(`✓ New task: ${task.title}`)
        await notifyPulse(task)
        lastNotified[task.id] = now
      }
    }
  } catch (e) {
    console.error("Poll error:", e)
  }
}

console.log(`📡 Dispatch monitor started (checking ${QUEUE_DIR})`)
setInterval(poll, POLL_INTERVAL)
poll()
