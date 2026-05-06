# Features Planned for Native Swift App

This document tracks features that were intentionally removed from the Holy Grails PWA
in preparation for a native Swift iOS app, where they will be re-implemented using
native platform APIs.

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
- Feed screen: medium haptic on Recent / Hunt / Depths / Following Activity / Purge Eval card taps
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
