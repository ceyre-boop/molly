# Hand Gesture Recognition — Phase 3.5

## What It Does

**Local hand pose detection** (no API calls, zero cost) using MediaPipe. Detects 21 hand landmarks in real-time, draws connected skeleton on screen, and maps detected hand poses to keyboard triggers (q, w, e, r, t).

Each gesture triggers voice input capture (same as spacebar-hold or mic button).

## 5 Default Gestures

| Gesture | Key | Description |
|---------|-----|-------------|
| **Thumbs Up** | `q` | Thumb up, other fingers down |
| **Peace Sign** | `w` | Index + middle up, ring + pinky down |
| **OK Sign** | `e` | Thumb + index forming circle, others up |
| **Open Hand** | `r` | All 5 fingers spread wide |
| **Fist** | `t` | All fingers closed |

Each detection triggers **voice input mode** (you hear "● LISTENING", can speak a question, gesture release ends capture).

## How to Test

### 1. Start the server
```bash
cd /Users/taboost/molly/apps/halo-prototype
export ANTHROPIC_API_KEY=sk-...
bun run server.ts
```

### 2. Open browser
```
http://localhost:3000
```

### 3. Allow camera + microphone permissions

### 4. Perform a hand gesture

Hold your hand in front of the camera:
- Make a **thumbs up** (or other pose) and hold for 300ms
- The gesture is detected → voice input activates
- You'll see the hand skeleton drawn in cyan + magenta dots
- Speak your question
- Gesture release ends voice capture
- EDITH responds (text + spoken)

### 5. Watch the canvas

- **Cyan lines + magenta dots** = hand skeleton (21 landmarks)
- **Text "GESTURE_NAME"** appears when detected
- Skeleton overlays on top of EDITH panels (doesn't interfere)

## Customization

To change which gesture maps to which key, edit `public/gestures.ts`:

```ts
const gestureDefinitions: Record<string, { key: string; description: string }> = {
  thumbsup: { key: "q", description: "Thumbs Up" },    // change 'q' to something else
  peace: { key: "w", description: "Peace Sign" },
  ok: { key: "e", description: "OK Sign" },
  openhand: { key: "r", description: "Open Hand" },
  fist: { key: "t", description: "Fist" },
}
```

Or add new gestures by:
1. Define gesture name + key in `gestureDefinitions`
2. Add detection logic in `detectGesture()` function
3. Add corresponding keyboard handler in `client.ts`

## Performance

- **Runs locally in browser** — no network, no API cost
- **~60 FPS** on modern devices
- **Latency: ~100-200ms** from gesture to detection
- **Zero API calls** (MediaPipe model is ~6MB, downloaded once)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **No skeleton showing** | Check camera permission in browser settings |
| **Gestures not detected** | Hold pose steady for 300ms minimum; ensure lighting is good |
| **False positives** | Adjust `minDetectionConfidence` in gestures.ts (line ~53) — higher = stricter |
| **Mobile doesn't work** | Camera access requires HTTPS; use Render deployment URL instead |

## Architecture

```
Camera feed
    ↓
MediaPipe HandLandmarker (local model, ~100ms)
    ↓
detectGesture() → hand landmarks + finger positions
    ↓
Map gesture → keyboard event (q, w, e, r, t)
    ↓
Existing voice/trigger system
    ↓
Claude answers
```

No API calls in this flow — MediaPipe model runs entirely in your browser.
