#!/usr/bin/env bun
/**
 * Respond to Molly questions — check queue and respond via Pulse.
 * Questions are queued when user asks something that isn't a dispatch task.
 *
 * Usage:
 *   bun bin/respond.ts                    # List pending questions
 *   bun bin/respond.ts <id> "response"    # Respond to a question
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
        const task = JSON.parse(content)
        // Only show questions (repo: "question")
        if (task.repo === "question") {
          tasks.push(task)
        }
      } catch {
        // Skip invalid files
      }
    }

    return tasks.sort((a, b) => a.timestamp - b.timestamp)
  } catch {
    return []
  }
}

async function sendResponse(taskId: string, response: string): Promise<void> {
  // Send response via Pulse
  try {
    await fetch("http://localhost:31337/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: response,
        voice_id: process.env.PRIMARY_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
        voice_enabled: true,
      }),
    })
    console.log("✓ Response sent via Pulse")
  } catch (e) {
    console.error("✗ Failed to send response:", e)
  }

  // Mark task complete
  const path = join(QUEUE_DIR, `${taskId}.json`)
  const archiveDir = join(QUEUE_DIR, ".archive")

  try {
    // Ensure archive dir exists
    Bun.spawnSync(["mkdir", "-p", archiveDir])

    const content = await Bun.file(path).text()
    await Bun.write(join(archiveDir, `${taskId}.json`), content)
    Bun.spawnSync(["rm", path])
    console.log("✓ Task marked complete")
  } catch (e) {
    console.error("✗ Failed to archive:", e)
  }
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length >= 2 && args[0] !== "--help") {
    const taskId = args[0]
    const response = args.slice(1).join(" ")
    await sendResponse(taskId, response)
    return
  }

  // List pending questions
  const questions = await listTasks()

  if (questions.length === 0) {
    console.log("No pending questions.")
    return
  }

  console.log(`\n💬 Pending Questions — ${questions.length} to respond to:\n`)
  for (const q of questions) {
    const time = new Date(q.timestamp).toLocaleTimeString()
    console.log(`  [${time}] ${q.text}`)
    console.log(`         ID: ${q.id}`)
    console.log()
  }

  console.log(`To respond: bun bin/respond.ts <id> "your answer"`)
  console.log(`Example:    bun bin/respond.ts ${questions[0].id} "Nvidia is trading at $120"`)
}

main().catch(console.error)
