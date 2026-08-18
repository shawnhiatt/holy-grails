# Holy Grails — Native iOS App Plan

**Status:** not started, by design — still waiting on PWA 1.0, or on an explicit decision to go earlier. The guardrail below holds until Shawn says otherwise. What *is* underway is toolchain and workspace setup (see Prerequisites), which is deliberately separable: none of it commits the project, and all of it has lead time worth spending early. The PWA remains the product and the canonical Holy Grails until a native version reaches daily-use parity. This document exists so that starting the native app is a *decision*, not a research project.

**Last synced with the codebase:** 2026-08-17 (PWA v0.7.0, 15 Convex tables, 25 Discogs proxy actions). The original plan was written 2026-07-05 against v0.6.0; roughly six weeks of feature work landed in between and is folded in below.

**Method:** the same one that built the PWA — designer describes intent, Claude Code writes the implementation, one focused session at a time. (Reference: Kris Puckett's *Permissionless* — a designer shipping a real SwiftUI app to the App Store through conversation with Claude. That's the proof of feasibility; this plan is the Holy Grails-specific version.)

---

## Why native (the honest list)

Everything in this list is a documented PWA wall, not speculation:

- **Haptics** — the whole reason `native-swift-features.md` exists. The PWA implementation was a WebKit exploit and was removed; `UIImpactFeedbackGenerator` / `.sensoryFeedback()` are the real thing. The full re-wiring map (which taps get which style) is already written in that doc.
- **The Discogs deep-link problem, solved.** Outbound discogs.com links are banned in the PWA because the Discogs app's Universal Link hijacks them (three failed redirect strategies, see CLAUDE.md). A native app can open links properly — or link *into* the Discogs app deliberately.
- **Barcode scanning** — zxing-wasm + getUserMedia works, but VisionKit's `DataScannerViewController` is faster, more accurate, and free.
- **Camera control for the cover scanner** — *new wall, hit after this plan was first written.* Cover mode had to add a photo-library/OS-camera path specifically because a browser camera preview cannot reach the ultra-wide lens, flash, or HDR, and the 0.5× toggle only appears when the browser deigns to report an ultra-wide device. `AVFoundation` exposes lens selection, torch, and capture settings directly — the fallback stops being a fallback.
- **No more Safari fights** — the `100dvh`/standalone viewport saga, keyboard-chasing-input scroll hacks, 16px input zoom rule, `WebkitTextOverflow` — an entire class of workaround disappears.
- **Shake gesture without a permission prompt** — CoreMotion needs no `requestPermission()` dance.
- **App Store presence** — discoverability, TestFlight for betas, an icon people trust.
- Later possibilities: widgets (random album on the home screen), Live Activities, Siri/App Intents ("what should I spin?").

## What carries over untouched (the leverage)

This is why the project is weeks, not a year:

1. **The entire backend.** Every Convex function — auth sessions, the 25 Discogs proxy actions, server-side sync loops, purge tags, listening sessions, following, preferences, market values, session rules, cover identification — is client-agnostic. Current surface: **15 tables, 24 queries, 38 mutations, 28 actions, 11 internal functions.** The native app is *another subscriber*, via Convex's official Swift client ([convex-swift](https://github.com/get-convex/convex-swift)). **Zero Discogs API code gets written in Swift.** No OAuth signing, no rate limiting, no pagination — all of it stays server-side where it already lives.
2. **The per-device session model.** `auth_sessions` was built for exactly this: the iPhone app is just another device row. Logging in on native never disturbs the PWA session, and all auth guards work unchanged.
3. **The design.** Screens, hierarchy, tokens, type scale, motion values, UX copy, product decisions — all settled. This is a port, not a redesign.
4. **The product judgment.** All-formats scope (display-only, never a data-layer filter), purge workflow semantics, wantlist conventions, the out-of-scope list — every decision transfers.
5. **The server-side intelligence, specifically.** Three things that look like client features are already actions, and therefore free:
   - `vision.identifyCover` — cover scan runs `claude-sonnet-5` inside a `"use node"` Convex action. Swift sends a downscaled JPEG and receives `{artist, title}`. **The Anthropic SDK never enters the app bundle**, exactly as it never enters the browser bundle.
   - `stackRules` — rule-defined sessions are evaluated on the server, including for shared sessions. Swift renders the result; it does not reimplement the rule engine.
   - `market_values` — batched per-user lookups already exist (`getForUser`). The Value section is a read.
6. **The mutation pattern.** The PWA deliberately does *not* use Convex's `withOptimisticUpdate` — it mirrors into local state on success and reconciles from the subscription. This matters more than it sounds: optimistic updates are an open feature request on convex-swift, and because the PWA never depended on them, that gap costs nothing. Port the same mirror-on-success pattern.

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
- **Offline:** see the dependency risk below — this is *not* free, and the plan previously implied it was.

### Dependency reality check: convex-swift

The single external dependency is load-bearing enough to state plainly. As of 2026-08-17:

| Fact | Value |
|---|---|
| Latest release | **0.8.1**, published 2026-02-20 |
| Release cadence | ~6 months since last tagged release |
| Maturity | Pre-1.0, 49 stars, 13 open issues, actively maintained (not archived) |
| Platforms | iOS 13+, macOS 10.15+, swift-tools 5.10 — no floor problem |
| Built on | the Convex Rust client via `convex-mobile` (binary xcframework) |

Three open issues touch this plan directly, and none is a blocker — but each changes an estimate:

- **Local caching / offline-first is an open feature request, not a shipped feature.** The earlier draft of this plan said "Convex Swift client handles reconnection; a lightweight local cache mirrors the PWA's cache-first boot feel." Reconnection is handled; the cache is *yours to build*. Budget it as real work in Phase 2 or defer cache-first boot from v1 deliberately.
- **Optimistic updates unsupported** — moot, per point 6 above. Noted so nobody rediscovers it and panics.
- **A concurrency bug in `ConvexClientWithAuth.authBridge`** (`authBridge` mutated without synchronization from three contexts, filed 2026-07-09) sits exactly where Phase 1 lives. If auth behaves strangely under rapid launch/background cycles, look here first rather than assuming the Discogs handshake is at fault.

**Verdict: yes, stay on Convex — the risk is bounded and there is a real fallback.** Two things settle it:

*The library is maintained, just slow to tag releases.* The default branch has been quiet since 0.8.1 in February, but a `seth/ios-simulator-ci` branch landed an iOS Simulator test job and connectivity regression suite on 2026-07-30 — three weeks before this revision. Convex staff investing in test infrastructure is a maintenance signal, not an abandonment one. Small and slow ≠ dead.

*And if convex-swift did stall, the project does not.* Convex deployments expose a plain HTTP API — `POST /api/query`, `/api/mutation`, `/api/action` — which was exercised directly against this project's deployment while writing this doc and returns structured JSON without any SDK involved. A Swift app can call every existing function over `URLSession` alone. What you'd lose is **reactive subscriptions**, replaced by fetch-on-appear plus pull-to-refresh; what you would *not* lose is any backend capability, the auth model, or a single Convex function. A third path exists if it ever matters: add `convex/http.ts` with `httpAction` endpoints shaped for the client (this repo has none today, deliberately).

So the failure mode is "write more networking code and lose live-updating lists," not "stuck." That is a survivable worst case for a v1 whose scope is already frozen — and given the timeline below, it may never come up.

Re-verify this table at Phase 0 rather than trusting it — with the start date open, a 1.0 may well have landed by then, and the `authBridge` fix along with it.

## v1 scope — ruthless

Ship the decision-making core, not the whole app. Two of the PWA's five bottom-tab destinations (Feed, Insights) are deliberately absent, so **v1 native is a three-tab app**: Collection, Wantlist, Sessions.

| In v1 | Explicitly deferred |
|---|---|
| Login (OAuth via ASWebAuthenticationSession) | Following (screen, feeds, shareActivity) |
| Collection: grid + list, search, filter, alphabet index | Insights/Reports (charts, market-value history, growth tabs) |
| Album detail: read-only + purge verdict + mark played + star rating + Value section | Instance editing, folder management |
| Purge tracker | Feed screen (identity block, spotlights, Listening card, recent-adds deltas) |
| Sessions: hand-picked create, add/remove, reorder | **Rule-defined sessions** (builder UI, duration cap + rotation, shared-session pages) |
| Look It Up: search + native barcode scan + **native cover scan** + pressing picker + add to collection/wantlist | Profile editing |
| Sync (trigger `syncSelf`, subscribe to `sync_status`) | In-app bug reports + admin inbox |
| Haptics per the map in `native-swift-features.md` | Crash/error monitoring (PWA uses Sentry; decide native separately) |
| Settings: theme, sign out, delete all data | Widgets, App Intents, Live Activities |
| | iPad/macOS layouts |

**Changes from the original v1 table, all driven by features that shipped after 2026-07-05:**

- **Album detail grew.** It now carries a live Value section (lowest ask, N-for-sale, VG/VG+/NM suggestions) and a star rating surfaced from collection sync. Both are reads against existing backend data, so both are cheap — keep them in v1; a purge verdict without the price is a worse decision tool.
- **Sessions split in two.** "Create, add/remove, reorder" described the whole feature in July. Since then sessions can define themselves by rules, cap by listening duration with overflow rotation, generate their own titles, and evaluate server-side when shared. v1 ships the hand-picked half only. The rule engine is server-side and will still be there — the deferred piece is the *builder UI*, which is the most intricate screen in the app and the wrong place to learn SwiftUI.
- **Look It Up gained cover scan.** It is now in v1 rather than unmentioned, because it is *cheaper* natively than in the browser (VisionKit + AVFoundation replacing zxing-wasm + getUserMedia hacks) and it is the feature most improved by native camera access. The server does the identification either way.
- **Bug reports are deferred, which needs a plan.** The PWA's in-app reporter with screenshot and diagnostics is how beta feedback arrives. For a TestFlight build, TestFlight's own feedback (screenshot + tester note, built in) covers v1. Revisit only if TestFlight feedback proves too thin.

Rationale: v1 must cover a full record-store trip and a full purge session — the two moments where native feel matters most. Everything deferred still works in the PWA, which stays installed and canonical.

## Design system port notes

- **Colors:** SwiftUI has no Oklab relative-color syntax — precompute the resolved values of the `oklab(from … calc(l ± X) a b)` tokens once (they're deterministic) and define them as asset-catalog colors with light/dark variants. The semantic token *names* carry over exactly (`surface`, `surfaceAlt`, `textMuted`, `destructive`, `link`…). Note the dark background family was darkened by 0.02 Oklab L in v0.7 — resolve from current `theme.css`, not from memory.
- **Icons — bundle Phosphor. Decided 2026-08-17, not an open question.** The PWA runs on **Phosphor Icons**, imported exclusively through the alias shim `src/app/components/icons.ts` that re-exports them under legacy Lucide names. Weight, not stroke width, carries meaning: `regular` default, `fill` for active states, `light` for the airy stroke (inactive nav, header buttons), `bold` for small emphasis. SF Symbols was evaluated and rejected: **it has no vinyl record or CD glyph.** Phosphor's `VinylRecordIcon` (aliased `Disc3`) is the brand mark, the universal loading spinner, and the Collection tab — there is no acceptable substitute, and a mixed set would drift visually across every screen. Bundling Phosphor also preserves 1:1 parity with the PWA for free. The cost is accepting that icons won't auto-adapt to Dynamic Type or SF Symbol rendering modes; weight mapping is manual.
- **Type:** bundle Bricolage Grotesque + DM Sans (both are OFL-licensed Google Fonts — verify at bundling time) as app fonts; map the existing scale.
- **Motion:** three easing curves and four durations, ported verbatim from `src/app/components/motion-tokens.ts` — `EASE_OUT [0.25, 1, 0.5, 1]`, `EASE_IN_OUT [0.76, 0, 0.24, 1]`, `EASE_IN [0.5, 0, 0.75, 0]` → `Animation.timingCurve(…)`; durations micro `0.1` / fast `0.175` / normal `0.225` / slow `0.3`. Same rule: animate transforms and opacity only.
- **Haptics:** the exact mapping (which control gets `light`/`medium`/`selection`) is already specified in `native-swift-features.md` — implement from that doc.
- **Disc3 spinner:** rebuild the 33⅓ RPM spin (1.8s/rev) as the universal loading state. Non-negotiable brand detail. Note it is `VinylRecordIcon` in Phosphor terms, aliased to `Disc3`.

## Working agreement (starter CLAUDE.md for the Swift repo)

The instruction-file discipline is the real asset — port it on day one:

1. Read before writing; match existing patterns exactly.
2. One concern per session; commit after each working phase.
3. Build and run on device (or simulator) after every change — never stack unverified edits.
4. SwiftUI-first. UIKit only where SwiftUI genuinely can't (and flag it) — `DataScannerViewController` and `ASWebAuthenticationSession` are the known, sanctioned exceptions.
5. No new dependencies without flagging. Convex-swift is the only planned one.
6. All backend behavior lives in Convex — never reimplement a proxy action, sync loop, auth rule, session-rule evaluation, or cover-identification prompt client-side. If Swift needs something the backend doesn't expose, add a Convex function (and deploy) rather than calling Discogs or Anthropic from the app.
7. Design tokens, motion tokens, haptic map, and UX writing rules are law — port the relevant CLAUDE.md sections verbatim, including the toast/copy voice ("Short. Shorter than you think.").
8. Keep a parity ledger: every intentional PWA/native difference gets a line in a `PARITY.md`, so drift is a decision, not an accident.
9. **Point the Swift app at the Convex dev deployment while building.** The PWA's `.env.local` convention has a dev/prod split (`adventurous-crow-499` / `unique-sturgeon-566`) for a reason — a native client writing to prod during Phase 1 auth experiments would corrupt live collection data.

## Prerequisites checklist (one-time, ~an afternoon)

Safe to complete now, ahead of any decision to start — nothing here writes Swift or commits the project.

- [ ] **Xcode** (current release, Mac App Store) — includes the iOS SDK, Simulator, Instruments, and Swift. This is the only IDE required; nothing else on this list is a code editor.
- [ ] Command Line Tools — `xcode-select --install`, then launch Xcode once to accept the license and let it install platform components
- [ ] **Apple Developer Program** enrollment ($99/year) — start early, activation can take a day or two. Required for TestFlight and the App Store; *not* required to build and run on the Simulator or, for 7-day provisioning, your own device.
- [ ] Bundle ID (e.g. `com.shawnhiatt.holygrails`) + app record in App Store Connect
- [ ] Register the native OAuth callback URL in Discogs app settings
- [ ] App icon exports from existing brand assets (1024×1024 master)
- [ ] TestFlight group (reuse the beta-tester circle from the PWA beta)
- [ ] Convex dev deployment reachable from the Mac (`npx convex dev` in this repo, or just the deployment URL — the Swift app needs no Convex CLI of its own)
- [ ] **Test device: iPhone 15 Pro** (confirmed available) — registered in the Developer Program, with a USB-C cable and Developer Mode enabled in Settings → Privacy & Security

**The device is not optional, and the Simulator does not substitute for it.** The Simulator has no Taptic Engine and no camera, which means the two headline reasons for going native — the full haptic map in `native-swift-features.md`, and Phase 4's barcode + cover capture — are both unverifiable there. Phases 1–3 are largely Simulator-friendly; Phases 4–5 are not. The 15 Pro is a fortunate match for this specific app: it has the ultra-wide lens the PWA's cover scanner cannot reliably reach, and being iOS 17+ it supports SwiftUI's `.sensoryFeedback()` directly, so the haptic port needs no UIKit fallback.

Explicitly **not** needed: Swift Playground (a learning app, not a build tool — Xcode supersedes it), CocoaPods or Carthage (convex-swift ships via Swift Package Manager, built into Xcode), a separate TestFlight install for you as developer (TestFlight is an App Store Connect service plus a tester-side iPhone app), and any cross-platform wrapper (Capacitor, React Native, Expo) — those are the thing this plan exists to avoid.

## Phases (each ≈ one or a few sessions)

0. **Setup** — project scaffold, fonts, color assets, Phosphor icon set bundled and weight-mapped, ConvexClient wired against the *dev* deployment, convex-swift version re-verified against the table above, CLAUDE.md written.
1. **Auth + boot** — OAuth round trip, Keychain session, collection subscription rendering a raw list. *The milestone that proves the whole architecture.* If auth misbehaves under launch/background cycling, check the known `authBridge` concurrency issue before suspecting Discogs.
2. **Collection** — grid/list, search/filter, alphabet index, detail view (read-only + Value + star rating). Decide here whether cache-first boot is in v1; it is hand-built work, not a client feature.
3. **Purge + Sessions** — verdict buttons with haptics, purge tracker, hand-picked session CRUD + reorder.
4. **Look It Up** — search, VisionKit barcode scan, AVFoundation cover capture → `vision.identifyCover`, pressing picker, add flows.
5. **Polish** — full haptic map, empty states, Disc3 spinner everywhere, app icon, launch screen.
6. **TestFlight** — internal build, then the beta circle.

## Guardrails

- **Don't start before PWA 1.0** — still in force. Rebuilding a moving target doubles every lesson's cost; the beta decides what v1 native even needs. The evidence for this guardrail got stronger, not weaker: the PWA shipped features four days before this revision, and this document needed six weeks of catch-up to be trustworthy again — it was actively misleading about offline support and silent about icons in the meantime. Phase 0 begins when Shawn says so, not when the toolchain is ready.
  - **Toolchain setup is exempt** and can proceed now. Xcode, Developer Program enrollment, the bundle ID, and the OAuth callback registration all have lead time, none of them writes a line of Swift, and none commits the project. Doing them early converts a two-day stall at Phase 0 into an afternoon already spent.
  - **When it does start: freeze v1 scope against the table above and let the PWA move.** Native chases nothing until Phase 6. Divergence is expected and gets logged in `PARITY.md`, not fixed.
  - **Re-sync this doc at each phase boundary**, and once more immediately before Phase 0 — whenever that lands, this snapshot will be stale again.
- **PWA stays canonical** until native covers a full week of daily use without reaching for the web app. Until then, product decisions land in the PWA first.
- **Never add native scaffolding to this repo.** CLAUDE.md's out-of-scope list is explicit: no Capacitor, no wrapper tooling, no Swift directories here. The native app is a *separate repository* that happens to share a Convex backend.
- **If the parity tax ever dominates** (every feature costing 2×), that's the signal to pick a lead platform deliberately — a future decision, noted here so it's made consciously instead of by exhaustion.
