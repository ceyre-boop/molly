// HaloVoiceTransport — Phase 4 seam, intentionally unimplemented.
//
// Halo's full BLE SDK is not published yet. When the iOS bridge exists
// (see apps/halo-prototype/NOA_GAP_PROTOCOL.md and SPINE.md "Glasses lane"),
// this class fills in with:
//   speak()            → bone-conduction speakers via the phone relay
//   listenForConfirm() → glasses mics + on-device wake/yes-no detection
//
// The permission engine only sees the VoiceTransport interface — implementing
// this file is the ENTIRE integration surface for spoken confirms on-glasses.
// Do not add BLE logic anywhere else.

import type { VoiceTransport, ConfirmResult } from "./voice-transport"

export class HaloVoiceTransport implements VoiceTransport {
  async speak(_text: string): Promise<void> {
    throw new Error(
      "NOT_IMPLEMENTED: Halo BLE SDK unpublished — this is the Phase 4 iOS-bridge seam. See NOA_GAP_PROTOCOL.md"
    )
  }

  async listenForConfirm(_timeoutMs: number): Promise<ConfirmResult> {
    throw new Error(
      "NOT_IMPLEMENTED: Halo BLE SDK unpublished — this is the Phase 4 iOS-bridge seam. See NOA_GAP_PROTOCOL.md"
    )
  }
}
