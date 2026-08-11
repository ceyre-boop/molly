/**
 * Dispatch queue — file-based task queue for immediate agent execution.
 * Written to by the console server when voice commands trigger dispatch tasks.
 * Read by a monitoring daemon that executes tasks immediately via Claude.
 */

import { mkdir } from "fs/promises"
import { join } from "path"

export interface DispatchTask {
  id: string
  title: string
  text: string
  repo: string
  timestamp: number
  url?: string // GitHub issue URL, if filed
}

const QUEUE_DIR = join(process.env.HOME!, ".molly-dispatch-queue")

export async function enqueueTask(task: Omit<DispatchTask, "id" | "timestamp">): Promise<string> {
  await mkdir(QUEUE_DIR, { recursive: true })
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const queueTask: DispatchTask = { ...task, id, timestamp: Date.now() }
  const path = join(QUEUE_DIR, `${id}.json`)
  await Bun.write(path, JSON.stringify(queueTask, null, 2))
  return id
}

export async function getPendingTasks(): Promise<DispatchTask[]> {
  try {
    const dir = await Bun.file(QUEUE_DIR).exists() ? Bun.file(QUEUE_DIR) : null
    if (!dir) return []
    const files = (await new Response(await Bun.file(QUEUE_DIR).arrayBuffer()).json()) as string[]
    const tasks: DispatchTask[] = []
    for (const file of files) {
      if (file.endsWith(".json")) {
        const task = JSON.parse(await Bun.file(join(QUEUE_DIR, file)).text())
        tasks.push(task)
      }
    }
    return tasks.sort((a, b) => a.timestamp - b.timestamp)
  } catch {
    return []
  }
}

export async function completeTask(id: string): Promise<void> {
  const path = join(QUEUE_DIR, `${id}.json`)
  const archived = join(QUEUE_DIR, ".archive", `${id}.json`)
  await mkdir(join(QUEUE_DIR, ".archive"), { recursive: true })
  try {
    await Bun.write(archived, await Bun.file(path).text())
    await Bun.file(path).text().then(() => {
      // File exists, delete it
      return new Promise<void>((resolve) => {
        import("fs").then(({ unlink }) => {
          unlink(path, () => resolve())
        })
      })
    })
  } catch {
    // Already deleted or doesn't exist
  }
}
