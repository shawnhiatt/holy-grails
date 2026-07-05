# Holy Grails — Native iOS App Plan

**Status:** not started, by design. This is a post-1.0 project — see `BETA-PLAYBOOK.md` for what comes first. The PWA remains the product and the canonical Holy Grails until a native version reaches daily-use parity. This document exists so that starting the native app is a *decision*, not a research project.

**Method:** the same one that built the PWA — designer describes intent, Claude Code writes the implementation, one focused session at a time. (Reference: Kris Puckett's *Permissionless* — a designer shipping a real SwiftUI app to the App Store through conversation with Claude. That's the proof of feasibility; this plan is the Holy Grails-specific version.)

---

## Why native (the honest list)

Everything in this list is a documented PWA wall, not speculation:

- **Haptics** — the whole reason `native-swift-features.md` exists. The PWA implementation was a WebKit exploit and was removed; `UIImpactFeedbackGenerator` / `.sensoryFeedback()` are the real thing. The full re-wiring map (which taps get which style) is already written in that doc.
- **The Discogs deep-link problem, solved.** Outbound discogs.com links are banned in the PWA because the Discogs app's Universal Link hijacks them (three failed redirect strategies, see CLAUDE.md). A native app can open links properly — or link *into* the Discogs app deliberately.
- **Barcode scanning** — zxing-wasm + getUserMedia works, but VisionKit's `DataScannerViewController` is faster, more accurate, and free.
- **No more Safari fights** — the `100dvh`/standalone viewport saga, keyboard-chasing-input scroll hacks, 16px input zoom rule, `WebkitTextOverflow` — an entire class of workaround disappears.
- **Shake gesture without a permission prompt** — CoreMotion needs no `requestPermission()` dance.
- **App Store presence** — discoverability, TestFlight for betas, an icon people trust.
- Later possibilities: widgets (random album on the home screen), Live Activities, Siri/App Intents ("what should I spin?").

## What carries over untouched (the leverage)

This is why the project is weeks, not a year:

1. **The entire backend.** Every Convex function — auth sessions, the 25 Discogs proxy actions, server-side sync loops, purge tags, listening sessions, following, preferences — is client-agnostic. The native app is *another subscriber*, via Convex's official Swift client ([convex-swift](https://github.com/get-convex/convex-swift)). **Zero Discogs API code gets written in Swift.** No OAuth signing, no rate limiting, no pagination — all of it stays server-side where it already lives.
2. **The per-device session model.** `auth_sessions` was built for exactly this: the iPhone app is just another device row. Logging in on native never disturbs the PWA session, and all auth guards work unchanged.
3. **The design.** Screens, hierarchy, tokens, type scale, motion values, UX copy, product decisions — all settled. This is a port, not a redesign.
4. **The product judgment.** Vinyl-only filter, purge workflow semantics, wantlist conventions, the out-of-scope list — every decision transfers.

What gets rebuilt: the view layer, in SwiftUI. That's the whole project.

---

## Architecture sketch

```
SwiftUI views
   │  @Observable view models
   ▼
ConvexClient (convex-swift)  ──subscriptions──▶  same Convex deployment
   │                                              (queries/mutations/actions,
   │                                               sessionToken arg, unchanged)
   ▼
Keychain: hg_session_token   (never UserDefaults — tokens are secrets)
```

- **Auth flow:** `ASWebAuthenticationSession` opens the Discogs authorize URL → callback hits a custom scheme or universal link → app calls the existing `oauth.completeLogin` action → stores `sessionToken` in Keychain. Same handshake, same server-derived identity; only the browser sandbox differs. (Discogs app settings will need the additional callback URL registered.)
- **Data:** subscribe to the same `collection`/`wantlist`/`purge_tags`/`stacks` queries the PWA uses. Convex's reactivity model maps naturally onto SwiftUI state.
- **Images:** `thumb` (150px) / `cover` (500px) convention carries over verbatim; `AsyncImage` with a disk cache (or Nuke if needed — flag before adding, same dependency rule as the PWA).
- **Offline:** Convex Swift client handles reconnection; a lightweight local cache mirrors the PWA's cache-first boot feel. Don't over-engineer this in v1.

## v1 scope — ruthless

Ship the decision-making core, not the whole app:

| In v1 | Explicitly deferred |
|---|---|
| Login (OAuth via ASWebAuthenticationSession) | Following (screen, feeds, shareActivity) |
| Collection: grid + list, search, filter, alphabet index | Insights/Reports (charts) |
| Album detail: read-only + purge verdict + mark played | Instance editing, folder management |
| Purge tracker | Feed screen (identity block, spotlights) |
| Sessions: create, add/remove, reorder | Profile editing |
| Look It Up: search + native barcode scan + add to collection/wantlist | Widgets, App Intents, Live Activities |
| Sync (trigger `syncSelf`, subscribe to `sync_status`) | iPad/macOS layouts |
| Haptics per the map in `native-swift-features.md` | |
| Settings: theme, sign out, delete all data | |

Rationale: v1 must cover a full record-store trip and a full purge session — the two moments where native feel matters most. Everything deferred still works in the PWA, which stays installed and canonical.

## Design system port notes

- **Colors:** SwiftUI has no Oklab relative-color syntax — precompute the resolved values of the `oklab(from … calc(l ± X) a b)` tokens once (they're deterministic) and define them as asset-catalog colors with light/dark variants. The semantic token *names* carry over exactly (`surface`, `surfaceAlt`, `textMuted`, `destructive`, `link`…).
- **Type:** bundle Bricolage Grotesque + DM Sans (both are OFL-licensed Google Fonts — verify at bundling time) as app fonts; map the existing scale.
- **Motion:** `EASE_OUT [0.25, 1, 0.5, 1]` → `Animation.timingCurve(0.25, 1, 0.5, 1, duration:)`; the four duration tokens carry over as-is. Same rule: animate transforms and opacity only.
- **Haptics:** the exact mapping (which control gets `light`/`medium`/`selection`) is already specified in `native-swift-features.md` — implement from that doc.
- **Disc3 spinner:** rebuild the 33⅓ RPM spin (1.8s/rev) as the universal loading state. Non-negotiable brand detail.

## Working agreement (starter CLAUDE.md for the Swift repo)

The instruction-file discipline is the real asset — port it on day one:

1. Read before writing; match existing patterns exactly.
2. One concern per session; commit after each working phase.
3. Build and run on device (or simulator) after every change — never stack unverified edits.
4. SwiftUI-first. UIKit only where SwiftUI genuinely can't (and flag it).
5. No new dependencies without flagging. Convex-swift is the only planned one.
6. All backend behavior lives in Convex — never reimplement a proxy action, sync loop, or auth rule client-side. If Swift needs something the backend doesn't expose, add a Convex function (and deploy) rather than calling Discogs from the app.
7. Design tokens, motion tokens, haptic map, and UX writing rules are law — port the relevant CLAUDE.md sections verbatim, including the toast/copy voice ("Short. Shorter than you think.").
8. Keep a parity ledger: every intentional PWA/native difference gets a line in a `PARITY.md`, so drift is a decision, not an accident.

## Prerequisites checklist (one-time, ~an afternoon)

- [ ] Apple Developer Program enrollment ($99/year) — start early, activation can take a day or two
- [ ] Mac with current Xcode
- [ ] Bundle ID (e.g. `com.shawnhiatt.holygrails`) + app record in App Store Connect
- [ ] Register the native OAuth callback URL in Discogs app settings
- [ ] App icon exports from existing brand assets
- [ ] TestFlight group (reuse the beta-tester circle from the PWA beta)

## Phases (each ≈ one or a few sessions)

0. **Setup** — project scaffold, fonts, color assets, ConvexClient wired, CLAUDE.md written.
1. **Auth + boot** — OAuth round trip, Keychain session, collection subscription rendering a raw list. *The milestone that proves the whole architecture.*
2. **Collection** — grid/list, search/filter, alphabet index, detail view (read-only).
3. **Purge + Sessions** — verdict buttons with haptics, purge tracker, session CRUD + reorder.
4. **Look It Up** — search, VisionKit barcode scan, pressing picker, add flows.
5. **Polish** — full haptic map, empty states, Disc3 spinner everywhere, app icon, launch screen.
6. **TestFlight** — internal build, then the beta circle.

## Guardrails

- **Don't start before PWA 1.0.** Rebuilding a moving target doubles every lesson's cost. The beta decides what v1 native even needs.
- **PWA stays canonical** until native covers a full week of daily use without reaching for the web app. Until then, product decisions land in the PWA first.
- **If the parity tax ever dominates** (every feature costing 2×), that's the signal to pick a lead platform deliberately — a future decision, noted here so it's made consciously instead of by exhaustion.
