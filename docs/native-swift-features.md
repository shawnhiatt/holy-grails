# Features Planned for Native Swift App

This document tracks features that were intentionally removed from the Holy Grails PWA
in preparation for a native Swift iOS app, where they will be re-implemented using
native platform APIs. The overall plan, architecture, and sequencing for that app live
in `native-app-plan.md` — keep logging PWA platform walls here as they're hit.

---

## Haptics

**Removed in:** v0.5.6
**Reason:** The PWA implementation was a workaround using WebKit-specific behavior
and is best handled natively.

### PWA Implementation (Removed)

The hook (`useHaptic()`, formerly at `src/hooks/useHaptic.ts`) triggered feedback via
hidden `<input type="checkbox" switch>` / `<label>` pairs created imperatively and
appended to `document.body`. This exploited iOS 18+ WebKit behavior that fires a haptic
when a switch input is toggled. A `navigator.vibrate()` call served as a fallback for
non-WebKit browsers (primarily Android).

The hook supported three styles — `'light'`, `'medium'`, `'heavy'` — which mapped to
distinct vibration patterns on Android:
- `light` → 10ms
- `medium` → 30ms
- `heavy` → `[50, 20, 50]` pattern

**Key constraint:** The hook had to be called synchronously as the very first line of a
user gesture handler — never after an `await`, inside a `setTimeout`, or across any
async gap. This made it brittle and prone to regressions when handlers were refactored.

**Where it was wired up:**
- Bottom tab bar (mobile nav): light haptic on each tab press
- Mobile header buttons (back, unfollow, new session, add followed user, following, settings): light haptic
- Alphabet sidebar: light haptic fired on each letter change during scroll
- Album grid / artwork grid / list cards: medium haptic on card tap
- Crate flip (swiper view): medium haptic on card tap
- Feed screen: medium haptic on Recent / Hunt / Shuffle / Following Activity / Purge Eval card taps
- Following screen: medium haptic on user list card tap and feed item taps
- Wantlist: medium haptic on want item tap
- Reports / Insights screen: medium haptic on album tap
- Sessions screen: medium haptic on album tap, medium haptic on drag-to-reorder start
- Purge tracker: medium haptic on album row tap; light haptic on Keep / Maybe / Cut buttons
- Shake-to-Random gesture (App.tsx): inline `navigator.vibrate(40)` confirmation when a
  random album was selected via device shake

### Native Recommendation

Use `UIImpactFeedbackGenerator`, `UISelectionFeedbackGenerator`, and
`UINotificationFeedbackGenerator` from UIKit, or the SwiftUI `.sensoryFeedback()`
modifier (iOS 17+). These are the canonical, reliable haptics APIs on iOS and require
no workarounds.

Suggested mappings from PWA styles to native generators:
- `light` (nav, alpha index) → `UISelectionFeedbackGenerator.selectionChanged()` or
  SwiftUI `.selection`
- `medium` (card taps, drag start) → `UIImpactFeedbackGenerator(style: .medium).impactOccurred()`
  or SwiftUI `.impact(weight: .medium)`
- `heavy` (reserved, unused at removal time) → `.heavy` impact
- Shake-to-Random confirmation → `UINotificationFeedbackGenerator().notificationOccurred(.success)`

---

## Camera control (Look It Up scanner)

**Wall hit in:** v0.7.x, during the cover-scan work
**Status:** worked around in the PWA, not removed — the scanner ships and functions.
The workarounds are what a native port deletes.

A `getUserMedia` preview cannot reach the parts of the iPhone camera the scanner
actually needs. Three separate accommodations exist because of it:

1. **Ultra-wide is unreachable as a zoom level.** On iOS the 0.5× camera is a
   *separate device*, not a zoom value on the default one, so the PWA ships a
   `0.5× / 1×` toggle that swaps `deviceId` and therefore **restarts the stream** —
   visibly, and deliberately styled apart from the Barcode/Cover toggle (which only
   flips a ref) so the two don't read as the same kind of control. The toggle renders
   only when `enumerateDevices()` reports an ultra-wide, and enumeration has to run
   *after* the first `getUserMedia` because device labels are blank until permission
   is granted.
2. **No flash, no HDR.** The escape hatch is a photo button opening
   `<input type="file" accept="image/*">` with **no `capture` attribute** — omitting it
   is precisely what keeps the OS camera on the native sheet, and the OS camera has the
   controls the preview can't offer. A picked photo has no framing guide, so it falls
   back to the largest centered square.
3. **The framing-guide crop has to be computed by hand.** `captureGuideSquare` maps the
   on-screen guide rect back through the `object-cover` transform into source
   coordinates. This is load-bearing: iOS delivers landscape frames into a portrait
   element, so `min(w, h)` of the source is *much wider* than the visible slice, and the
   naive version shipped covers floating in a band of room the user never saw.

### Native recommendation

AVFoundation exposes all three directly. `AVCaptureDevice.DiscoverySession` with
`.builtInUltraWideCamera` (or a virtual `.builtInDualWideCamera` with a zoom factor)
replaces the device-swap toggle and its stream restart; `AVCapturePhotoSettings`
carries flash and HDR, which removes the reason for the photo-library escape hatch;
and a capture geometry expressed in the preview layer's own coordinate space
(`AVCaptureVideoPreviewLayer.metadataOutputRectConverted(fromLayerRect:)`) replaces the
hand-rolled `object-cover` inverse.

The barcode half is simpler still: `DataScannerViewController` replaces the
zxing-wasm decode loop outright.

**Do not port the workarounds.** The guide-to-source crop *intent* must survive —
the capture is what the guide shows, not the largest square of the frame — but the
arithmetic that implements it should not.
