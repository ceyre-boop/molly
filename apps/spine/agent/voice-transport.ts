// Voice-confirm transport — the human-in-the-loop channel for Tier 2 approvals.
// Interface-first: the permission logic never knows which transport it's talking
// to, so swapping the mock for Halo's real mic/speaker (Phase 4 iOS bridge)
// touches zero permission code.

export type ConfirmResult = "yes" | "no" | "timeout"

export interface VoiceTransport {
  speak(text: string): Promise<void>
  listenForConfirm(timeoutMs: number): Promise<ConfirmResult>
}

// Deterministic mock — logs what WOULD have been spoken, answers from a script.
// Default answer when the script runs dry is "no": an unconfigured confirm
// channel must fail closed, never silently approve.
export class MockVoiceTransport implements VoiceTransport {
  spoken: string[] = []
  private script: ConfirmResult[]

  constructor(script: ConfirmResult[] = []) {
    this.script = [...script]
  }

  async speak(text: string): Promise<void> {
    this.spoken.push(text)
    console.log(`[voice-mock] would speak: "${text}"`)
  }

  async listenForConfirm(_timeoutMs: number): Promise<ConfirmResult> {
    const answer = this.script.shift() ?? "no"
    console.log(`[voice-mock] confirm → ${answer}`)
    return answer
  }
}

// Dev transport — speaks to the terminal, listens on stdin. Used when running
// the spine interactively on a machine with a human at the keyboard.
export class CliVoiceTransport implements VoiceTransport {
  async speak(text: string): Promise<void> {
    console.log(`\n🗣  Molly asks: ${text}`)
  }

  async listenForConfirm(timeoutMs: number): Promise<ConfirmResult> {
    process.stdout.write(`   confirm? [yes/no] (${Math.round(timeoutMs / 1000)}s timeout): `)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cleanup()
        console.log("(timeout)")
        resolve("timeout")
      }, timeoutMs)

      const onData = (chunk: Buffer) => {
        cleanup()
        const answer = chunk.toString().trim().toLowerCase()
        resolve(answer === "yes" || answer === "y" ? "yes" : "no")
      }

      const cleanup = () => {
        clearTimeout(timer)
        process.stdin.off("data", onData)
        process.stdin.pause()
      }

      process.stdin.resume()
      process.stdin.once("data", onData)
    })
  }
}
