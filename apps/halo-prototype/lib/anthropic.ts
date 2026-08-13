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
  voiceQuestion:
    "You are Claude, Molly's AI assistant on AR glasses, being asked a question aloud. " +
    "Answer directly, helpfully, and concisely using the camera's view if relevant, otherwise from general knowledge. " +
    "1-3 sentences, under 200 characters. No preamble, no 'I see' — spoken-style, short, natural. " +
    "If the question is unclear or needs context, ask briefly.",
  faces:
    "Analyze this image for faces. For EACH visible person, provide: " +
    "1) Distinctive features (gender-neutral: hair color/style, distinctive marks, clothing, etc.) " +
    "2) Approximate age range (teens, 20s, 30s, etc.) " +
    "3) Confidence (HIGH/MEDIUM/LOW). " +
    "Format: 'Person 1: [features] | [age] | [confidence]\\nPerson 2: [features]...' " +
    "If no faces visible, reply 'NO_FACES'. " +
    "Be concise. No preamble.",
} as const

// Cost tracking: Haiku vision @ max_tokens:128 ≈ $0.0015 per call (~0.15¢)
// 5¢ budget = 33+ calls per session before hitting limit
export async function describeImage(
  base64Jpeg: string,
  mode: "ambient" | "read",
  question?: string
): Promise<string> {
  const content: (Anthropic.ImageBlockParam | Anthropic.TextBlockParam)[] = [
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
      text: question
        ? `${PROMPTS.voiceQuestion}\n\nThe user asked: "${question}"`
        : PROMPTS[mode],
    },
  ]

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 128,
    messages: [
      {
        role: "user",
        content,
      },
    ],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  return textBlock?.type === "text" ? textBlock.text.trim() : ""
}

export interface FaceRecord {
  id: string
  name?: string
  features: string
  ageRange: string
  confidence: "HIGH" | "MEDIUM" | "LOW"
  lastSeen: number
  seenCount: number
}

// Detect faces in image using Claude vision
export async function detectFaces(base64Jpeg: string): Promise<FaceRecord[]> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
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
            text: PROMPTS.faces,
          },
        ],
      },
    ],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  const text = textBlock?.type === "text" ? textBlock.text.trim() : ""

  if (text === "NO_FACES" || !text) return []

  // Parse face descriptions and create records
  const faces: FaceRecord[] = []
  const lines = text.split("\n").filter((l) => l.trim())

  for (const line of lines) {
    if (!line.includes("|")) continue

    const parts = line.split("|").map((p) => p.trim())
    if (parts.length < 3) continue

    const [featurePart, agePart, confPart] = parts
    const personLabel = line.split(":")[0].trim() // "Person 1", "Person 2", etc.

    faces.push({
      id: `face-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: undefined, // To be populated by user if desired
      features: featurePart.replace(/^Person \d+:\s*/, "").trim(),
      ageRange: agePart.trim(),
      confidence: (confPart.toUpperCase() as "HIGH" | "MEDIUM" | "LOW") || "MEDIUM",
      lastSeen: Date.now(),
      seenCount: 1,
    })
  }

  return faces
}
