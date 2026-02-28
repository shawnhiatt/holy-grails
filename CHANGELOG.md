# Holy Grails — Changelog

All notable changes to Holy Grails are documented here. Versions follow the guidelines in `VERSIONING.md`.

---

## 0.2.5 — 2026-02-27

### Loading screen
- Centered syncing label with animated ellipsis as a separate inline element — dots cycle 1→2→3 sequentially, no empty state
- Added gradient progress bar (pink→blue→green, matching purge tracker) that fills via `scaleX` reveal — gradient is a fixed wash, not a growing stripe
- Simulated easing animation: fast 0→40% in 800ms, decelerates to 85%, hard cap at 89% until real completion signal fires
- Progress snaps to 100% and fades out only after sync fully completes — wired to `isSyncing` going false in `performSync`'s finally block
- Fixed race condition where `loadPhase` could enter `'complete'` during a ~1ms window before the sync started (`hasSeenSyncingRef` guard)
- Fixed self-cancelling timer bug where the `'complete'` → `'idle'` setTimeout was cleared by React's own cleanup mechanism (extracted to a dedicated effect)
- Fixed unauthenticated / incognito load getting stuck on loading screen forever — added no-session escape hatch to the `loadPhase` state machine
- Sync progress messaging: loading screen now displays live "Fetching X / Y" counts per page during collection sync, falling back to "Syncing collection" when the string is empty

### Authentication
- Fixed stuck "Connecting..." button when user backs out of Discogs OAuth without completing auth — implemented `oauthInFlight` module-level ref shared between `App.tsx` and `auth-callback.tsx` to distinguish abandonment from successful return
- Fixed `visibilitychange` false-positive resets on successful auth return

### Unicorn Studio background
- Replaced video background with Unicorn Studio WebGL scene across all pre-auth screens: splash, loading, connect Discogs prompt, create account, sign in
- WebGL availability detected synchronously on mount — falls back to `#01294D` background if unavailable
- `splash-video.tsx` deleted

### Navigation
- Mobile bottom tab bar reordered: Feed → Following → Collection → Wants → Sessions
- Desktop left group reordered: Feed → Following → Collection → Wants
- Desktop right group reordered: Sessions → Purge → Insights → Settings → theme toggle
- Desktop active nav item now shows yellow (`#EBFD00`) icon to match mobile active state
- Further restructured in follow-on session: Following removed from mobile footer, moved to mobile header right icon — mobile footer is now 4 items: Feed → Collection → Wants → Sessions
- Desktop left group finalised: Feed → Collection → Wants → Sessions
- Desktop right group finalised: Following → Purge → Insights → Settings → theme toggle

### Purge + Feed
- Standardized Keep / Maybe / Cut order across Feed purge card and Purge Tracker screen (buttons and stat chips)

### Touch and safe area
- Album card tap sensitivity fix across all four view modes (Grid, Artwork, List, Swiper) — 6px drag threshold prevents accidental album detail opens during scroll
- Swiper lightbox close button repositioned below iOS status bar using `env(safe-area-inset-top)`

### Shake to Random
- Implemented shake gesture to open a random album in Album Detail — mobile PWA only
- Lateral entrance animation on shake-triggered opens (20px → 0 x-translate)
- Haptics via Vibration API (40ms pulse, Android only — iOS does not support the Vibration API)
- Shake threshold: 25 m/s² (requires deliberate wrist flick, not incidental movement)
- Shake to Random toggle in Settings → Gestures with iOS `DeviceMotionEvent.requestPermission()` flow
- Preference persisted to Convex (`shake_to_random` field in preferences table)
- Fixed toggle unresponsive after iOS permission denial — timer ref prevents stacking timeouts

### Section dividers in grid views
- Collection grid: section dividers for Artist A→Z/Z→A, Title A→Z, Year newest/oldest, Date Added newest/oldest
- Wantlist grid: letter dividers (always sorted A→Z by artist)
- Dividers are `col-span-full` with label and 1px hairline — alphabetical sidebar refs anchor to divider elements

### Album year in Collection list view
- Release year now appears inline after artist name (`Artist · Year`) in Collection list view, matching Wantlist list view
- Removed right-column year span that was hidden on mobile

### Color mode setting
- Added Color mode segmented control (Light / Dark / System) to Settings → Appearance
- Defaults to Dark if no preference stored
- Persisted to Convex — applied before first render to prevent flash of wrong theme
- Nav theme toggle remains as a quick flip; Settings is the persistent preference

### Wantlist copy
- "Wantlist" is now consistently one word across all user-facing copy — toasts, labels, confirmations, empty states

### Following / wantlist behavior
- Tapping a filled heart in Following now shows a confirmation before removing from wantlist ("Remove [Title] from your wantlist?") instead of navigating to the Wantlist screen

### Favicon and PWA icons
- New app icons across all platforms via realfavicongenerator.net
- `site.webmanifest` replaces vite-plugin-pwa generated manifest as source of truth
- Manifest values: `background_color: #0C284A`, `theme_color: #EBFD00`, `display: standalone`, `orientation: portrait`

### Custom fields error handling
- Discogs `/collection/fields` 403 (private collection or insufficient token scope) now degrades silently — returns empty array, no error shown to user

### Documentation
- `VERSIONING.md` added to repo root
- `CHANGELOG.md` rewritten from scratch at 0.2.5 baseline
- `CLAUDE.md` updated: PWA platform limitations (Vibration API iOS caveat), wantlist copy rule ("wantlist" is one word)
- `CLAUDE.md`: removed deleted `splash-video.tsx`, added `unicorn-scene.tsx` and `figma/ImageWithFallback.tsx`, completed z-index hierarchy table with 5 new entries, updated navigation structure to reflect current tab bar
- Bumped `package.json` version from `0.0.1` to `0.2.5`
- Removed debug `console.log` (`[LoadPhase]`) from `App.tsx`
- Removed dead `setDemoCollectionValue` export and `DEMO_COLLECTION_VALUE` constant from `discogs-api.ts`

### iOS Safari and PWA polish
- Fixed ellipsis dot animation not looping on iOS Safari in standalone PWA mode — replaced `setInterval`-driven JS animation with pure CSS keyframes (`sync-ellipsis-2`, `sync-ellipsis-3`), full webkit treatment, `prefers-reduced-motion` support
- Fixed disc spinner animation on iOS Safari — added `@-webkit-keyframes`, `-webkit-animation`, `-webkit-transform-origin`, and `transform-box: fill-box` to `.disc-spinner`
- Fixed mobile bottom tab bar sitting too far from screen edge in standalone PWA mode — `@media (display-mode: standalone)` CSS fix, no JS sniffing
- Fixed overscroll pull-down bounce revealing background color — `overscroll-behavior: none` on `html` and `body`; background color responds to `prefers-color-scheme`

### Slide-out panel
- Extracted shared `SlideOutPanel` component — accepts scrollable children slot, optional title/headerAction header row, optional pinned footer, and z-index/className overrides
- Album detail panel and filter drawer both refactored to use `SlideOutPanel`
- Fixed background bleeding into safe area zone below mobile nav — sheet anchors to physical screen edge, internal padding handles safe area

### Filter drawer
- Added Apply Filters button (`#EBFD00`) pinned to panel footer
- Fixed Apply Filters button obscured by mobile nav bar — clearance handled via `var(--slide-panel-footer-pb)`
- Added swipe-to-dismiss gesture

### Following screen
- Fixed "View on Discogs" and "Unfollow" buttons hidden when a followed user has a private collection
- Replaced `Trash2` icon with `UserMinus` for all Unfollow actions
- Fixed From the Depths not live-updating when a new user is followed — changed from `useState` lazy init to `useMemo` on `friends`
- From the Depths shows up to 4 cards per followed user (no minimum padding — single-album users show 1 card)
- Fixed From the Depths dates wrapping to two lines — abbreviated to 3-letter month format, e.g. "Nov 2023"

### Recent Activity
- Fixed dates — were fabricated via a hardcoded `recentDates` cycling array; now use real `album.dateAdded` from Discogs
- Fixed feed loading 30 items per user instead of 30 total — now merges all followed users, caps at 300, displays 30 at a time
- Added Load More (+30 per tap)

### Settings
- Added Tools section (mobile-only): Purge Tracker and Insights quick-access cards

---

## 0.2.4 and earlier

Versions 0.2.0–0.2.4 represent the Figma Make prototype iteration and the four infrastructure phases that brought the app to production:

- **Phase 1** — Real Discogs API data (replaced all mock data)
- **Phase 2** — Convex backend + Discogs OAuth 1.0a authentication
- **Phase 3** — PWA setup, installable on iOS
- **Phase 4** — Deployed to Vercel at holygrails.app

Pre-production history is not tracked in detail here.