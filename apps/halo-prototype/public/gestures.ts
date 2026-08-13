// Hand gesture recognition via MediaPipe Tasks (local, no API calls)
// Detects hand pose, draws skeleton, maps to trigger keys (q,w,e,r,t)

import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision"

export interface HandGesture {
  name: string
  key: string
  detected: boolean
  confidence: number
}

let handLandmarker: HandLandmarker | null = null
let detectionCallback: ((gesture: HandGesture) => void) | null = null
let lastGesture: string | null = null
let gestureHoldTime = 0
const HOLD_THRESHOLD = 300 // ms to confirm gesture

let canvasCtx: CanvasRenderingContext2D | null = null
let videoElement: HTMLVideoElement | null = null
let animationFrameId: number | null = null

// Gesture definitions (customizable)
const gestureDefinitions: Record<string, { key: string; description: string }> = {
  thumbsup: { key: "q", description: "Thumbs Up" },
  peace: { key: "w", description: "Peace Sign" },
  ok: { key: "e", description: "OK Sign" },
  openhand: { key: "r", description: "Open Hand" },
  fist: { key: "t", description: "Fist" },
}

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // thumb
  [5, 6], [6, 7], [7, 8],               // index
  [9, 10], [10, 11], [11, 12],          // middle
  [13, 14], [14, 15], [15, 16],         // ring
  [17, 18], [18, 19], [19, 20],         // pinky
  [0, 5], [5, 9], [9, 13], [13, 17],   // palm connections
]

export async function initGestureDetection(videoElementId: string, canvasElementId: string): Promise<void> {
  videoElement = document.getElementById(videoElementId) as HTMLVideoElement
  const canvas = document.getElementById(canvasElementId) as HTMLCanvasElement
  canvasCtx = canvas.getContext("2d")

  if (!videoElement || !canvasCtx) {
    console.error("Video or canvas element not found for gesture detection")
    return
  }

  try {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm")
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" },
      runningMode: "VIDEO",
      numHands: 1,
    })

    startDetection()
  } catch (err) {
    console.error("Failed to initialize hand gesture detection:", err)
  }
}

function startDetection() {
  if (!videoElement || !handLandmarker) return

  function detectFrame() {
    try {
      const results = handLandmarker!.detectForVideo(videoElement!, performance.now())
      onHandsResults(results)
    } catch (err) {
      console.warn("Hand detection error:", err)
    }
    animationFrameId = requestAnimationFrame(detectFrame)
  }

  animationFrameId = requestAnimationFrame(detectFrame)
}

function onHandsResults(results: any) {
  if (!canvasCtx || !videoElement) return

  if (!results.landmarks || results.landmarks.length === 0) {
    lastGesture = null
    return
  }

  const landmarks = results.landmarks[0]

  // Draw hand skeleton on canvas (overlay on top of EDITH panels)
  canvasCtx.strokeStyle = "#00D9FF"
  canvasCtx.lineWidth = 2
  for (const [start, end] of HAND_CONNECTIONS) {
    const p1 = landmarks[start]
    const p2 = landmarks[end]
    if (p1 && p2) {
      canvasCtx.beginPath()
      canvasCtx.moveTo(p1.x * videoElement.videoWidth, p1.y * videoElement.videoHeight)
      canvasCtx.lineTo(p2.x * videoElement.videoWidth, p2.y * videoElement.videoHeight)
      canvasCtx.stroke()
    }
  }

  // Draw hand joints (dots on fingers + palm)
  canvasCtx.fillStyle = "#FF006E"
  for (const landmark of landmarks) {
    if (landmark) {
      canvasCtx.beginPath()
      canvasCtx.arc(landmark.x * videoElement.videoWidth, landmark.y * videoElement.videoHeight, 3, 0, Math.PI * 2)
      canvasCtx.fill()
    }
  }

  // Detect gesture
  const detected = detectGesture(landmarks)
  if (detected) {
    gestureHoldTime += 16 // ~60fps
    if (gestureHoldTime > HOLD_THRESHOLD && detected !== lastGesture) {
      lastGesture = detected
      fireGestureSignal(detected)
      gestureHoldTime = 0
    }
  } else {
    gestureHoldTime = 0
  }

  // Draw gesture name on canvas if detected
  if (detected) {
    canvasCtx.font = "bold 16px monospace"
    canvasCtx.fillStyle = "#00D9FF"
    canvasCtx.fillText(`🖐️ ${detected.toUpperCase()}`, 20, 40)
  }
}

function detectGesture(landmarks: Array<{ x: number; y: number; z: number }>): string | null {
  // Landmarks: 0=wrist, 1-4=thumb, 5-8=index, 9-12=middle, 13-16=ring, 17-20=pinky
  // Each finger: base, middle, pip, tip

  const wrist = landmarks[0]
  const thumbTip = landmarks[4]
  const indexTip = landmarks[8]
  const middleTip = landmarks[12]
  const ringTip = landmarks[16]
  const pinkyTip = landmarks[20]

  const thumbBase = landmarks[2]
  const indexBase = landmarks[5]
  const middleBase = landmarks[9]
  const ringBase = landmarks[13]
  const pinkyBase = landmarks[17]

  // Distances from wrist (y-axis up is negative in image space)
  const thumbUp = thumbTip.y < thumbBase.y
  const indexUp = indexTip.y < indexBase.y
  const middleUp = middleTip.y < middleBase.y
  const ringUp = ringTip.y < ringBase.y
  const pinkyUp = pinkyTip.y < pinkyBase.y

  // Spread (horizontal distance)
  const indexSpread = Math.abs(indexTip.x - wrist.x)
  const pinkySpread = Math.abs(pinkyTip.x - wrist.x)
  const spread = pinkySpread - indexSpread

  // Thumb-finger distance (OK sign)
  const thumbIndexDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y)

  // Gestures
  if (thumbUp && !indexUp && !middleUp && !ringUp && !pinkyUp) {
    return "thumbsup" // q
  }
  if (!thumbUp && indexUp && middleUp && !ringUp && !pinkyUp) {
    return "peace" // w
  }
  if (thumbIndexDist < 0.05 && middleUp && ringUp && pinkyUp) {
    return "ok" // e
  }
  if (indexUp && middleUp && ringUp && pinkyUp && spread > 0.1) {
    return "openhand" // r
  }
  if (!thumbUp && !indexUp && !middleUp && !ringUp && !pinkyUp) {
    return "fist" // t
  }

  return null
}

function fireGestureSignal(gestureName: string) {
  const gesture = gestureDefinitions[gestureName]
  if (!gesture) return

  const event = new KeyboardEvent("keydown", {
    code: gesture.key.toUpperCase(),
    key: gesture.key,
    bubbles: true,
  })
  document.dispatchEvent(event)

  if (detectionCallback) {
    detectionCallback({
      name: gestureName,
      key: gesture.key,
      detected: true,
      confidence: 0.8,
    })
  }
}

export function setGestureCallback(callback: (gesture: HandGesture) => void) {
  detectionCallback = callback
}

export function stopGestureDetection() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  if (handLandmarker) {
    handLandmarker.close()
    handLandmarker = null
  }
}

export function getGestureDefinitions() {
  return gestureDefinitions
}

export function setGestureDefinition(gestureName: string, keyCode: string) {
  if (gestureDefinitions[gestureName]) {
    gestureDefinitions[gestureName].key = keyCode
  }
}
