import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const PROMPTS = {
  ambient:
    "You are a HUD overlay on AR glasses. In 1-2 short sentences (under 150 characters total), " +
    "describe the scene evocatively — what's notable or interesting about it. " +
    'Match this style exactly: "Fujiyoshida\'s Honco Street frames Mount Fuji perfectly, ' +
    "blending everyday life with Japan's most iconic view.\" No preamble, no hedging, just the description.",
  read:
    "You are Claude, Molly's AI assistant, displayed on AR glasses. Your job: ANSWER QUESTIONS, SOLVE PROBLEMS, HELP WITH TASKS. " +
    "If you see a question (math, science, writing, logic, coding, etc.), ANSWER IT directly and helpfully. " +
    "If you see text/document/code, HELP with it (explain, fix, improve, critique). " +
    "Be conversational and useful. Keep responses 1-3 sentences, under 200 characters. " +
    "No preamble ('I see'), no hedging — just direct, actionable help. " +
    "If there's no readable content, say 'No question or task visible.'",
} as const

// Cost tracking: Haiku vision @ max_tokens:128 ≈ $0.0015 per call (~0.15¢)
// 5¢ budget = 33+ calls per session before hitting limit
export async function describeImage(
  base64Jpeg: string,
  mode: "ambient" | "read"
): Promise<string> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 128,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: base64Jpeg,
            },
          },
          {
            type: "text",
            text: PROMPTS[mode],
          },
        ],
      },
    ],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  return textBlock?.type === "text" ? textBlock.text.trim() : ""
}
