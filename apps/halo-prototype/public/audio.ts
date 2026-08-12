// Web Speech API wrapper — STT (SpeechRecognition) + TTS (SpeechSynthesis)
// Isolated module: the entire seam that gets replaced by Halo's real mic/speaker later.

export interface VoiceCapabilities {
  sttSupported: boolean
  ttsSupported: boolean
}

export function getVoiceCapabilities(): VoiceCapabilities {
  const sttSupported = Boolean(getRecognitionCtor())
  const ttsSupported = "speechSynthesis" in window
  return { sttSupported, ttsSupported }
}

type SpeechRecognitionCtor = {
  new (): SpeechRecognition
  prototype: SpeechRecognition
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  length: number
  isFinal: boolean
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as any
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  return Ctor ?? null
}

let recognition: SpeechRecognition | null = null
let listening = false

export function startPushToTalk(
  onResult: (transcript: string) => void,
  onError?: (err: string) => void,
  onListeningChange?: (isListening: boolean) => void
): void {
  const Ctor = getRecognitionCtor()
  if (!Ctor) {
    onError?.("Speech recognition not supported in this browser")
    return
  }
  if (listening) return

  recognition = new Ctor()
  recognition.continuous = false
  recognition.interimResults = false
  recognition.lang = "en-US"

  recognition.onresult = (e: SpeechRecognitionEvent) => {
    const transcript = e.results[0]?.[0]?.transcript ?? ""
    onResult(transcript.trim())
  }
  recognition.onerror = (e: SpeechRecognitionErrorEvent) => onError?.(e.error)
  recognition.onend = () => {
    listening = false
    onListeningChange?.(false)
  }

  recognition.start()
  listening = true
  onListeningChange?.(true)
}

export function stopPushToTalk(): void {
  if (recognition && listening) {
    recognition.stop()
  }
}

export function isListening(): boolean {
  return listening
}

// ─── TTS ───

let currentUtterance: SpeechSynthesisUtterance | null = null

export function speak(text: string): void {
  if (!("speechSynthesis" in window)) return
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.rate = 1.05
  utter.pitch = 1.0
  currentUtterance = utter
  window.speechSynthesis.speak(utter)
}

export function stopSpeaking(): void {
  window.speechSynthesis.cancel()
}
