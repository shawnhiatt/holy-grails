# Holy Grails — Native iOS App Plan

**Status:** not started, by design. This is a post-1.0 project — see `BETA-PLAYBOOK.md` for what comes first. The PWA remains the product and the canonical Holy Grails until a native version reaches daily-use parity. This document exists so that starting the native app is a *decision*, not a research project.

**Last reconciled against the codebase:** August 2026, at v0.7.0 + unreleased. The July 2026 draft of this plan predated the Session Builder, all-formats, the cover scan, market values, in-app bug reports, and multiple accounts; each of those changed something here. Re-reconcile before starting — if the delta is this large again, that is itself the signal that the readiness gate below has not been met.

**Method:** the same one that built the PWA — designer describes intent, Claude Code writes the implementation, one focused session at a time. (Reference: Kris Puckett's *Permissionless* — a designer shipping a real SwiftUI app to the App Store through conversation with Claude. That's the proof of feasibility; this plan is the Holy Grails-specific version.)

---

## Readiness gate — read this first

Codebase health is not the constraint and never was. At the last check the app typechecks clean under strict TS, lints clean, and passes 262 tests across 18 files with no open PRs. That is not the question.

The question is that **nobody but Shawn has ever used this app.** The v1 scope table below is a set of guesses about which screens matter most, and every guess in it gets validated or rewritten by twenty real people in a fortnight. Building a second client against an unvalidated scope means paying for each lesson twice — once in SwiftUI and once in React.

Concrete gate, all of which must hold before Phase 0:

- [ ] Beta Stage 1 has run and met its exit criteria (`BETA-PLAYBOOK.md`)
- [ ] The PWA is tagged and versioned at 1.0 — today there are **no git tags in the repo at all**, which makes "which version?" unanswerable on any bug report
- [ ] The pre-beta config items are done: Sentry DSN + alert rule, `HG_ADMIN_USERNAMES` set on **both** Convex deployments (it fails closed — unset means reports pile up unread), Convex backups verified
- [ ] Two consecutive weeks with no new must-fix bug

If it helps to name the feeling: "there's always something else to implement" is not anxiety, it's an accurate reading of a repo that is still shipping weekly. The gate exists to convert that into a decision instead of a vibe.

---

## Why native (the honest list)

Everything in this list is a documented PWA wall, not speculation:

- **Haptics** — the whole reason `native-swift-features.md` exists. The PWA implementation was a WebKit exploit and was removed; `UIImpactFeedbackGenerator` / `.sensoryFeedback()` are the real thing. The full re-wiring map (which taps get which style) is already written in that doc.
- **The Discogs deep-link problem, solved.** Outbound discogs.com links are banned in the PWA because the Discogs app's Universal Link hijacks them (three failed redirect strategies, see CLAUDE.md). A native app can open links properly — or link *into* the Discogs app deliberately.
- **Barcode scanning** — zxing-wasm + getUserMedia works, but VisionKit's `DataScannerViewController` is faster, more accurate, and free.
- **Camera control the browser can't reach.** The cover scanner needed a `0.5×` lens toggle (ultra-wide is a separate `deviceId` on iOS, so switching restarts the stream) *and* a photo-library escape hatch, purely because a `getUserMedia` preview can't reach the ultra-wide lens, flash, or HDR. AVFoundation exposes all of it directly, and the whole workaround pair disappears.
- **No more Safari fights** — the `100dvh`/standalone viewport saga, keyboard-chasing-input scroll hacks, 16px input zoom rule, `WebkitTextOverflow` — an entire class of workaround disappears.
- **Shake gesture without a permission prompt** — CoreMotion needs no `requestPermission()` dance, and the boot-time permission re-check in `App.tsx` goes away with it.
- **App Store presence** — discoverability, TestFlight for betas, an icon people trust.
- Later possibilities: widgets (random album on the home screen), Live Activities, Siri/App Intents ("what should I play?").

## What carries over untouched (the leverage)

This is why the project is weeks, not a year:

1. **The entire backend.** Every Convex function — auth sessions, the Discogs proxy actions, server-side sync loops, purge tags, sessions, following, preferences, the market-value drip cron, the cover-scan vision action, bug reports — is client-agnostic. The native app is *another subscriber*, via Convex's official Swift client ([convex-swift](https://github.com/get-convex/convex-swift)). **Zero Discogs API code gets written in Swift.** No OAuth signing, no rate limiting, no pagination — all of it stays server-side where it already lives.
2. **The per-device session model.** `auth_sessions` was built for exactly this: the iPhone app is just another device row. Logging in on native never disturbs the PWA session, and all auth guards work unchanged.
3. **The design.** Screens, hierarchy, tokens, type scale, motion values, UX copy, product decisions — all settled. This is a port, not a redesign.
4. **The product judgment.** All-formats scope (display-only, never a data-layer filter), purge workflow semantics, wantlist conventions, the out-of-scope list — every decision transfers.

What gets rebuilt: the view layer, in SwiftUI — plus the pure-logic seam below, which is the part the earlier draft of this plan missed.

---

## What does NOT carry over — the shared pure-logic seam

**This is the section that did not exist before, and it is the main reason this document needed rewriting.**

The claim "zero business logic in Swift" was true when this plan was drafted. The Session Builder ended it. The client imports pure modules directly out of `convex/` — a deliberate design so that one implementation serves both the live view and `stacks.getShared`:

| Module | Lines | What it decides |
|---|---|---|
| `convex/stackRules.ts` | 518 | `evaluateStackRule`, `matchesRule`, `evaluateCondition`, `seededShuffle`, `rotationBucket`, `CAP_TIERS`/`capToLimit`, `RULE_SORTS` |
| `convex/albumFields.ts` | 138 | `mediaType()` format classifier, `hasRating`, `CONDITION_GRADES`, `conditionRank` |

Plus client-only pure logic a second client must re-derive to render the same screens: `use-filtered-albums.ts` (145), `stack-rule-labels.ts` (300), `stack-presets.ts` (241), `collection-facts.ts` (136), `listening.ts` (120), `insights.ts` (93), `accounts.ts` (88), `format.ts` (79), `shuffle.ts` (42).

Call it **~1,900 lines that must behave identically on both clients**, or the two apps disagree about what a session contains, what counts as a CD, and what "unrated" means. A user seeing different membership for the same session on phone and laptop will read it as data loss, not as a port artifact.

**There is no server-side escape hatch today.** `previewStackRule` is a *client* function in `app-context.tsx` wrapping `evaluateStackRule` locally — not a Convex query. The only server-side evaluation that exists is inside `stacks.getShared`, which is the unauthenticated share path and returns display fields, not membership. So a native client has exactly two options.

**Chosen approach: port to Swift, and port the test fixtures with them.** These modules were built dependency-free on purpose, which is what makes this cheap. Every one of them already has a Vitest suite (`stackRules.test.ts`, `stack-rule-labels.test.ts`, `use-filtered-albums`, `listening`, `collection-facts`, `insights`, `accounts`, `format`, `shuffle`) — those become XCTest cases over the *same fixtures*. The logic is duplicated; the tests are what pin the parity. A rule field added to one side without the other fails a test rather than shipping a disagreement.

**Rejected: moving evaluation server-side for the hot path.** A `stacks.membership` query would remove the duplication, but it kills the property CLAUDE.md calls out explicitly — `stackMembership` re-deriving the instant a sync lands, because `albums` already re-derives from the collection subscription. It would add a round trip to every collection change. Acceptable *only* for the builder's live match count, which is already a preview surface and tolerates latency.

**Also rejected: a monorepo with a shared package.** Swift cannot import TypeScript. Co-location buys nothing that the test-fixture discipline doesn't buy better.

### Non-negotiable semantics to carry across

These are the ones that look like bugs later if a port gets them wrong. All are documented in CLAUDE.md; repeating them here because they are the exact places two implementations drift:

- **`year: 0` and `rating: 0` are sentinels, not values.** Zero means *unknown* and *unrated* respectively. Never render a 0 year; never write a 0 rating; read ratings through `hasRating`. Discogs *accepts* 0 to clear a rating and *returns* 0 to mean unrated — write-only in one direction.
- **Rule evaluation order is specified and must not be reordered:** filter by conditions → remove `excluded_ids` → if rotating and `pool >= limit * 1.5`, seeded-shuffle by `stack_id + period bucket` and take `limit`, else sort and take `limit` → sort for display. Rotation picks *which*; the sort rule decides the *running order*. They stay independent.
- **Rotation stores nothing.** `rotationBucket` is a function of the clock and `ROTATION_OFFSET_MS` (10h, so the flip lands in the early-morning US rather than mid-evening). A Swift implementation that caches a bucket breaks the property that a viewer sees the same set as the owner.
- **Unknown rule conditions are ignored — except when *all* of them are unknown, which matches nothing.** This is what lets an old build read a new rule. An empty session is recoverable; one that silently swallowed the whole collection is not. A Swift client will be the old build eventually, so this matters more after the port than before it.
- **`mediaType()` is first-match-wins, and unmatched/empty is `"Other"` — never assume vinyl.** Format scope is display-only; the data layer stores everything.
- **Membership is derived, never stored.** Do not add a materialized cache of matching ids on the native side to "make SwiftUI easier." That is the one shortcut that reintroduces every drift problem the design avoids.

---

## Architecture sketch

```
SwiftUI views
   │  @Observable view models
   ▼
Ported pure logic (stackRules, albumFields, filters, derivations)
   │  ← parity pinned by XCTest over the PWA's own fixtures
   ▼
ConvexClient (convex-swift)  ──subscriptions──▶  same Convex deployment
   │                                              (queries/mutations/actions,
   │                                               sessionToken arg, unchanged)
   ▼
Keychain: account list      (never UserDefaults — tokens are secrets)
```

- **Auth flow:** `ASWebAuthenticationSession` opens the Discogs authorize URL → callback hits a custom scheme or universal link → app calls the existing `oauth.completeLogin` action → stores the session token in Keychain. Same handshake, same server-derived identity; only the browser sandbox differs. (Discogs app settings will need the additional callback URL registered.)
- **Keychain holds a list, not a token.** Multiple accounts shipped after the first draft of this plan: the PWA keeps the active token in `hg_session_token` and the full list in `hg_accounts` as `{ username, avatarUrl, sessionToken, addedAt }[]`. Native mirrors that shape in Keychain — the whole list, since every entry is a secret. `utils/accounts.ts` (88 lines, fully tested) is one of the modules to port. Note the PWA switches accounts by swapping the active token and reloading; SwiftUI has no equivalent blunt instrument, so account switching needs a real state-reset path — the one place native does *more* work than the web app, not less.
- **Data:** subscribe to the same `collection`/`wantlist`/`purge_tags`/`stacks`/`last_played` queries the PWA uses. Convex's reactivity model maps naturally onto SwiftUI state.
- **Images:** `thumb` (150px) / `cover` (500px) convention carries over verbatim; `AsyncImage` with a disk cache (or Nuke if needed — flag before adding, same dependency rule as the PWA). The `/img-proxy/` rewrite exists solely to dodge CORS canvas tainting for dominant-color extraction — native reads pixels directly and should hit the CDN, not the proxy.
- **Offline:** Convex Swift client handles reconnection; a lightweight local cache mirrors the PWA's cache-first boot feel. Don't over-engineer this in v1.
- **Monitoring:** the PWA reports through `reportError()` into Sentry plus a 10-entry in-memory ring buffer that bug reports attach. Native needs an equivalent pair named before Phase 6 — the ring buffer especially, since it is what makes a bug report answerable.

## v1 scope — ruthless

Ship the decision-making core, not the whole app. Revised against what actually shipped since the first draft:

| In v1 | Explicitly deferred |
|---|---|
| Login (OAuth via ASWebAuthenticationSession), multiple accounts | Following (screen, feeds, shareActivity) |
| Collection: grid + list, search, filter, alphabet index, format badges | Insights/Reports (charts, Top Shelf, market-value surfaces) |
| Album detail: read-only + purge verdict + mark played + star rating | Instance editing, folder management |
| Purge tracker | Feed screen (identity block, spotlights, Listening card) |
| Sessions: create, add/remove, reorder — **and evaluate auto sessions** | **Session Builder UI** (build on web, consume on native) |
| Look It Up: search + VisionKit barcode scan + add to collection/wantlist | Cover scan mode |
| Sync (trigger `syncSelf`, subscribe to `sync_status`) | Session share links (`/s/{shareId}`) — see decision below |
| Haptics per the map in `native-swift-features.md` | Bug reports (in-app) — see note below |
| Settings: theme, format scope, sign out, delete all data | Widgets, App Intents, Live Activities, iPad/macOS |

Rationale: v1 must cover a full record-store trip and a full purge session — the two moments where native feel matters most. Everything deferred still works in the PWA, which stays installed and canonical.

Three scope calls worth stating explicitly, because they are new since the first draft:

- **Auto sessions must *evaluate* in v1 even though the Builder is deferred.** A session that fills itself is not an optional feature you can hide — if a user built one on the web, the native app must show the right contents or it is simply wrong. Reading requires the full `stackRules.ts` port; building requires the rule-row UI, the presets, and the title generator on top. Splitting there gets the correctness for a fraction of the UI. Auto sessions still render locked in pickers with "Fills itself," same as the web.
- **Cover scan is deferred, barcode is not.** The backend action (`vision.identifyCover`) is client-agnostic and needs no work. But the capture geometry is load-bearing and would have to be re-derived for AVFoundation: the crop maps the on-screen framing guide back into source coordinates, *not* the largest centered square of the camera frame. Getting that wrong is what shipped a band of room around a floating cover the first time. Deferring it keeps Phase 4 honest; the barcode path via `DataScannerViewController` is strictly easier than what the PWA already does.
- **Bug reports are deferred but nearly free when picked up.** `bug_reports.diagnostics` is already `{ label, value }[]` — deliberately untyped, so a native client supplies its own labels (iOS version, device model, build number) with no schema change. The admin inbox stays web-only; there is no reason to build triage twice.

### Decisions this plan does not make

- **Session share links.** `/s/{shareId}` is a web route rendered outside `AppProvider` with no auth. Native has three options — universal-link into the app, hand off to Safari, or ignore shares entirely — and picking one is a product call, not a technical one. Deferred in v1 means shares open in the browser, which works today and is not obviously wrong.
- **Whether native ever gets Insights.** The charts are recharts-shaped; Swift Charts is a genuine rewrite rather than a port. Worth deciding after v1 rather than assuming.

## Design system port notes

- **Colors:** SwiftUI has no Oklab relative-color syntax — precompute the resolved values of the `oklab(from … calc(l ± X) a b)` tokens once (they're deterministic) and define them as asset-catalog colors with light/dark variants. The semantic token *names* carry over exactly (`surface`, `surfaceAlt`, `textMuted`, `destructive`, `link`…). Note the light/dark values genuinely differ in kind, not just lightness — `--c-link` is blue in light and yellow in dark, and the accent trio is hue-shifted for light-mode contrast. Port the *pairs*, never one value with a filter.
- **The detached-component surface pattern does not exist on native.** `#14161C`/`#FFFFFF` hardcodes in sheets exist because CSS custom properties don't inherit through portals. Swift has no such problem — use the tokens everywhere and delete that whole category of exception.
- **Type:** bundle Bricolage Grotesque + DM Sans (both are OFL-licensed Google Fonts — verify at bundling time) as app fonts; map the existing scale. The two decorative display faces (`Rock Salt` for spotlight sections, `Manufacturing Consent` for named modules) come along with their assignment rule — which face a heading gets is decided by function, per CLAUDE.md's typography section.
- **Motion:** `EASE_OUT [0.25, 1, 0.5, 1]` → `Animation.timingCurve(0.25, 1, 0.5, 1, duration:)`; the four duration tokens carry over as-is. Same rule: animate transforms and opacity only.
- **Haptics:** the exact mapping (which control gets `light`/`medium`/`selection`) is already specified in `native-swift-features.md` — implement from that doc.
- **Disc3 spinner:** rebuild the 33⅓ RPM spin (1.8s/rev) as the universal loading state. Non-negotiable brand detail.
- **Copy is law and it is format-neutral.** Every user-facing string must pass the CD test in CLAUDE.md — "release," never "record"; "play," never "spin." A fresh SwiftUI port is exactly where vinyl-flavored copy creeps back in, because the strings get retyped rather than moved.

## Repository: separate, not a monorepo

The Swift app gets **its own repository.** Reasons, in order of weight:

1. **CLAUDE.md is the real asset, and it is PWA-specific.** A thousand-plus lines about Tailwind, the z-index table, `100dvh` standalone quirks, and iOS Safari truncation. Loading that into a Swift session wastes context and actively invites the agent to apply web rules to SwiftUI.
2. **Zero shared toolchain.** No npm/Vite/ESLint/Vitest overlap with Xcode/SPM. A monorepo without a shared build buys nothing.
3. **CI splits cleanly.** The existing Action runs Node; Swift needs macOS runners. Mixing means conditional workflows or wasted minutes on every web commit.
4. "One concern per session" maps naturally onto one repo per client.

The cost of separation is precisely the pure-logic seam above, and the mitigation is the ported test fixtures — not co-location.

## Working agreement (starter CLAUDE.md for the Swift repo)

The instruction-file discipline is the real asset — port it on day one:

1. Read before writing; match existing patterns exactly.
2. One concern per session; commit after each working phase.
3. Build and run on device (or simulator) after every change — never stack unverified edits.
4. SwiftUI-first. UIKit only where SwiftUI genuinely can't (and flag it).
5. No new dependencies without flagging. convex-swift is the only planned one.
6. All backend behavior lives in Convex — never reimplement a proxy action, sync loop, or auth rule client-side. If Swift needs something the backend doesn't expose, add a Convex function (and deploy) rather than calling Discogs from the app.
7. **Ported pure logic ships with its ported tests, in the same session.** A rule field, a media type, or a sort added on one side without the other is a parity bug, and the fixtures are what catch it.
8. Design tokens, motion tokens, haptic map, and UX writing rules are law — port the relevant CLAUDE.md sections verbatim, including the format-neutral CD test and the toast voice ("Short. Shorter than you think.").
9. Keep a parity ledger: every intentional PWA/native difference gets a line in `PARITY.md`, so drift is a decision, not an accident.

### What `PARITY.md` tracks

Not a feature checklist — a list of *deliberate* divergences and the shared surfaces that must not diverge:

- Each ported pure module, its PWA source path, and where its test fixtures live
- Every v1 deferral from the scope table, so "missing" is distinguishable from "broken"
- Platform-only behavior in either direction (native haptics and outbound Discogs links; web-only session share pages and the admin inbox)
- Anything where the two clients deliberately show different copy

## Prerequisites checklist (one-time, ~an afternoon)

- [ ] Apple Developer Program enrollment ($99/year) — start early, activation can take a day or two
- [ ] Mac with current Xcode
- [ ] Bundle ID (e.g. `com.shawnhiatt.holygrails`) + app record in App Store Connect
- [ ] Register the native OAuth callback URL in Discogs app settings
- [ ] App icon exports from existing brand assets
- [ ] TestFlight group (reuse the beta-tester circle from the PWA beta)

## Phases (each ≈ one or a few sessions)

0. **Setup** — project scaffold, fonts, color assets, ConvexClient wired, CLAUDE.md + PARITY.md written.
1. **Auth + boot** — OAuth round trip, Keychain account list, collection subscription rendering a raw list. *The milestone that proves the whole architecture.*
2. **Pure-logic port** — `albumFields` then `stackRules`, each with its test fixtures ported to XCTest before any view consumes it. Deliberately its own phase and deliberately before the collection UI: the filter/sort work in Phase 3 depends on it, and porting logic under UI deadline pressure is how sentinels get dropped.
3. **Collection** — grid/list, search/filter/sort, alphabet index, format badges, detail view (read-only + star rating).
4. **Purge + Sessions** — verdict buttons with haptics, purge tracker, session CRUD + reorder, auto-session rendering (read-only, with the "In rotation · N of M" disclosure, which is not optional).
5. **Look It Up** — search, VisionKit barcode scan, pressing picker, add flows.
6. **Polish** — full haptic map, empty states, Disc3 spinner everywhere, error reporting pipeline, app icon, launch screen.
7. **TestFlight** — internal build, then the beta circle.

## Guardrails

- **Don't start before the readiness gate at the top of this document clears.** Rebuilding a moving target doubles every lesson's cost. The beta decides what v1 native even needs.
- **The PWA leads; native lags. Decide that now, not later.** The earlier version of this plan said "if the parity tax ever dominates, that's the signal to pick a lead platform deliberately." Waiting for that signal means discovering it by exhaustion. Backend changes are free — both clients subscribe to the same deployment. What costs double is every pure-logic module, every screen, every design token (no `oklab()` in SwiftUI), and every user-facing string. Product decisions land in the PWA first and reach native on a lag, and that lag is the design, not a failure.
- **Never let the native app become the reason a PWA feature doesn't ship.** The moment a web change is deferred to keep parity, the lead-platform rule has quietly inverted.
