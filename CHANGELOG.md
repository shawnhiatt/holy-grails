# Holy Grails — Changelog

All notable changes to Holy Grails are documented here. Versions follow the guidelines in `VERSIONING.md`.

---

## 2026-03-05

### Added
- **Format Spotlight** feed section — rotates on every app load, filters collection for obscure vinyl format descriptions (7-Inch, 12-Inch, Limited Edition, Picture Disc, Colored, Etched, 45 RPM, Mono, etc.). Requires minimum 3 matching albums per category. Operates entirely on cached Convex collection data with zero additional API calls.
- **Recommended hero** on mobile — Recommended section renders as a full-bleed hero card. Feed header becomes transparent at scroll position 0 and transitions to opaque on scroll, scoped to the home feed via a prop on the header component.
- **Home feed section order** established: Recommended, Recently Added, Format Spotlight, Following Activity, From the Depths, Purge Tracker, Insights.

### Fixed
- **Collection folders not displaying** — all releases showed as "Uncategorized" regardless of actual Discogs folder assignment. Root cause: the Discogs API does not return `folder_id` on release objects fetched from the aggregate folder 0 ("All") endpoint. Fix: `proxyFetchCollection` now fetches releases per-folder (one paginated request per user folder, skipping folder 0), injecting the correct `folder_id` from the folder being fetched. Folder 0 is still used for followed users (`skipPrivateFields: true`) where folder names are irrelevant.

### Documented
- **Vinyl-only filter** — the app is intentionally vinyl-only. The global filter on `formats[].name === "Vinyl"` is applied at the data layer during collection sync. This is a product decision, not a user setting.
- **Folder sync architecture** — per-folder fetching pattern, `skipPrivateFields` fallback to folder 0, and rate limiting documented in CLAUDE.md.

---

## 0.4.0 — 2026-03-04

### Security
- Convex auth guards added to all queries and mutations via central `authenticateUser()` helper in `convex/authHelper.ts`
- Discogs consumer secret migrated server-side — removed from client bundle entirely. All Discogs API calls now proxied through Convex actions in `convex/discogs.ts` with HMAC-SHA1 signing
- Fixed critical auto-authentication vulnerability — `getLatestUser` now requires a session token argument; session token persisted to localStorage (`hg_session_token`) for returning user restore
- OAuth token fields no longer returned to client
- `.gitignore` hardened for `.env.production` / `.env.development`

### Performance
- Service Worker image caching — Discogs artwork and avatars cached via `discogs-images-v1` (CacheFirst, 500 entries, 30-day TTL). Images load instantly on repeat visits
- Fixed 3 image sizing mismatches using `cover` where `thumb` was appropriate

### Following screen
- Followed user rows now render instantly from Convex cache on navigation — no longer waits for full API hydration
- Recent Activity and From the Depths sections now read from `following_feed` Convex cache (available at startup) instead of waiting for hydration

### UI & Design system
- Hide-on-scroll header animation removed — header is now statically fixed on all screens
- Replaced 5 `Loader2` spinner instances with `Disc3` + `disc-spinner` per design system
- Fixed 7 toast message inconsistencies (periods, format, verbosity)
- Added `screen-title` class to Wantlist header for consistent desktop scaling
- Deleted orphaned `ImageWithFallback.tsx` and empty `figma/` directory
- Removed dead code: `FollowingSkeletonRows`, `FollowedUserRow`, `isHydrating`, `useHideHeaderOnScroll` hook and all call sites

### Architecture
- `convex/discogs.ts` — 13 server-side Discogs proxy actions
- `convex/discogsHelpers.ts` — internal credential lookup (separated due to Convex `"use node"` constraint)
- `convex/oauth.ts` — consumer credentials now read from Convex env vars, not client args
- `discogs-api.ts` — HTTP functions removed, types/constants/caches retained
- `DiscogsAuth` type and `getAuthCredentials` query removed
- `hg_session_token` is the only permitted localStorage usage

---

## 0.3.1 — 2026-03-03

### Following Feed Cache
- Added `following_feed` Convex table caching the 50 most recent albums per followed user (up to 25 users, 24h TTL per user)
- Feed Recent Activity and From the Depths cards now render from Convex cache at startup, no longer requiring the Following screen to be visited first
- Following feed sync runs during startup after collection/wantlist sync with rate-limited sequential fetches

### API Optimization (Passes 1 + 2)
- **Image sizes**: `thumb` (150px) for list rows, artwork grid, compact cards; `cover` (500px) for detail panels, grid cards, depths cards. Added `thumb` field to `Album` type, Convex `collection` schema, and all grid/list components.
- **skipPrivateFields**: `fetchCollection` skips `fetchCustomFields` and `fetchFolderMap` for other users' collections (always 403). Skip `fetchUserProfile` on cache load when avatar is already stored in Convex.
- **Avatar cache**: Followed user avatars stored in `following` Convex table (`avatar_url` field), populated on first follow and refreshed during Following screen hydration
- **Wantlist cache**: Wantlist mirrored in `wantlist` Convex table with 24h TTL synced alongside collection. Write operations (add/remove) update both local state and Convex on success. New Convex `wantlist` table with `by_username` and `by_username_release` indexes.
- **Collection value cache**: `collection_value` and `collection_value_synced_at` stored on the Convex `users` table — skip Discogs `/collection/value` fetch on cache-fresh loads

### Terminology
- Renamed "Friends" to "Following" across all screens, routes, and Convex tables (`friends-screen.tsx` → `following-screen.tsx`, `friends` → `following`)

### Shared Components
- **AlbumArtworkGrid**: Unified artwork grid component used across Collection, Following, and Wantlist screens for consistent card sizing and layout. Wantlist and Following artwork grids now use shared component — consistent 4 cols mobile, 8 cols desktop. Following artwork view now uses `thumb` field for grid images.
- **WantlistHeartButton**: Shared wantlist add/remove button with `"overlay"` and `"inline"` variants. Handles state check, confirmation SlideOutPanel, Discogs API call, Disc3 loading spinner, and toast notifications. Used in Feed Depths cards, Following Depths cards, Following grid/artwork/list views.

### master_id Matching
- `master_id` now stored on `Album`, `WantItem`, and `FeedAlbum` objects
- "In Collection" and heart filled state check both `release_id` and `master_id` to match across different pressings of the same recording
- `isInWants` and `isInCollection` context helpers accept optional `masterId` parameter
- Feed and Following screens build `ownMasterIds` / `wantMasterIds` Sets for O(1) lookups
- Following feed cache bypasses 24h TTL when stored data lacks `master_id` (one-time migration)

### Toast Notifications
- Album-specific toasts now include the full title with no truncation: `"[Title]" kept.` / `"[Title]" added to Wantlist.` / `"[Title]" removed.`
- Removed hardcoded 20-character truncation from purge and wantlist toasts

### Wantlist Confirmation Dialogs
- All wantlist add/remove confirmations standardized on SlideOutPanel bottom-sheet pattern
- Following screen remove confirmation migrated from fixed centered modal to SlideOutPanel matching Feed screen pattern

### Feed Recent Activity
- Followed user avatars now render in Recent Activity cards (previously always showed text initial fallback)
- Avatar URLs read from `following` Convex table via `followingAvatars` context map

### iOS Safari
- Wantlist artwork view text truncation switched from `truncate` class to inline styles

---

## 0.3.0 — 2026-03-01

### Wantlist Writes (Phase 6)
- Added `addToWantlist` and `removeFromWantlist` API functions in `discogs-api.ts` — PUT and DELETE against `/users/{username}/wants/{releaseId}`
- Wired `addToWantList` and `removeFromWantList` in `app-context.tsx` to Discogs API (Pattern A: API first, update local state on success)
- `removeFromWantList` also cleans up Convex `want_priorities` on removal
- Added `selectedWantItem: WantItem | null` to app context for wantlist detail panel routing
- Wantlist items now open a detail panel (`WantItemDetailPanel`) with album art, title/artist, priority bolt toggle, year/label, Discogs link, market value, and two-tap "Remove from Wantlist" action
- All 4 wantlist view modes (Grid, List, Artwork, Crate) wired with `onSelect` to open detail panel
- Added "Add to Wantlist" Zap button in collection album detail panel — outline Zap when not on wantlist (tappable), filled yellow Zap when already on wantlist (informational)
- Friends screen activity feed hearts now await async API calls with per-item Disc3 loading spinners and error handling
- Friends screen wantlist removal dialog shows loading state during API call
- Added "Now in your collection" crossover prompt — after sync, detects wantlist items whose release_id exists in the collection and queues them for user review
- Crossover prompt floats above mobile tab bar, shows one item at a time with "Remove from Wantlist" and "Keep on Wantlist" actions
- Queue count indicator shows remaining crossover items

---

## 0.2.6 — 2026-03-01

### Collection caching
- Added `collection` table to Convex schema — one row per album per user
- Collection persists between sessions; repeat loads within 24 hours skip Discogs fetch entirely and hydrate from Convex instantly
- `lastSyncedAt` timestamp on `users` table controls auto-sync staleness
- Manual "Sync Now" always triggers a full sync regardless of cache age
- Full wipe-and-repopulate strategy on sync (`replaceAll` mutation)
- `folderId` and `instanceId` added to album objects and Convex schema (required for write operations)

### Insights redesign
- Removed fake growth chart (synthetic interpolation with Math.random())
- Added condition distribution section with visual grade breakdown
- Added condition quality ratio ("X% of your collection is NM or better")
- Added folder breakdown computed from cached collection data
- Removed all market-dependent sections (rolled back — see Cleanup below)

### Following screen performance
- Followed users' collection and wantlist data now loads only when the user navigates to the Following screen, not on every app load
- Eliminates 10+ Discogs API calls from the startup path that were competing with the main collection sync for rate limit budget

### Purge Cut
- Added "Purge Cut (N)" action to permanently remove all Cut-tagged albums from Discogs collection in bulk
- Two entry points: pinned footer in Purge screen (Cut filter only) and inside Purge Tracker card in Settings
- Two-step confirmation dialog with scrollable album list and count
- Progress indicator during execution ("Removing X of N albums...")
- Per-album 1 second delay between Discogs delete requests to stay within rate limits
- Purge tags cleared from Convex on successful deletion
- Partial failure handling — failed deletions logged and skipped, tags preserved
- Full collection re-sync triggered automatically after completion
- `executePurgeCut` lives in `app-context.tsx`, consumed by both entry points via context

### Edit album fields
- Added edit mode to album detail panel via Pencil icon
- Editable fields: Media Condition, Sleeve Condition, Notes, Folder
- Condition dropdowns use exact Discogs grade strings from `CONDITION_GRADES` in `discogs-api.ts`
- Folder dropdown populated from unique folders in cached collection (move to existing folder only — no creating new folders)
- Save writes to Discogs API then updates Convex cache — no full resync
- Folder move uses two-step Discogs operation (add to new folder, delete from old)
- Error toast keeps edit mode open for retry on failure
- Edit mode disabled while sync is in progress

### Bug fixes
- Fixed purge tag not persisting when toggling an active tag off — null tag now correctly calls `removePurgeTagMut` instead of silently dropping the write
- Fixed circular dependency crash from `executePurgeCut` referencing `syncFromDiscogs` before its declaration in `app-context.tsx`
- Fixed Settings Tools section hidden on desktop — now visible with two-column grid layout on large screens
- Fixed Purge Cut button appearing as sibling card — now nested inside Purge Tracker card as a subordinate action

### Cleanup
- Removed `QA_PRICES` hardcoded marketplace prices from `discogs-api.ts`
- Removed `fetchMarketStats` and `fetchPriceSuggestions` from `discogs-api.ts` (market insights feature built and rolled back due to Discogs API rate limit constraints in a browser PWA context)
- `market_insights` Convex table added and removed in same version

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