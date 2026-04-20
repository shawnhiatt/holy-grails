# Holy Grails — Changelog

All notable changes to Holy Grails are documented here. Versions follow the guidelines in `VERSIONING.md`.

---

## 0.5.6

### Fixed
- **Accidental card taps during scroll** — raised scroll-guard cooldown from 80ms → 250ms in `scroll-state.ts` to cover momentum-decay tap scenarios on iOS. Created shared `use-safe-tap.ts` hook implementing touch-slop (10px X+Y) + cooldown + `preventDefault` to suppress synthetic click. Retrofitted all 14 card tap sites across Collection, Wantlist, Feed, Following, and Depths screens. `dominant-color-card.tsx` extended to accept spread touch handlers. Two previously unguarded wantlist sites (`WantGridCard`, wantlist list row) now protected. All tap sites share one implementation.

### Added
- **Double-tap nav to focus filter** — tapping the active Collection or Wantlist nav item dispatches a `hg:focus-filter` custom event, focusing the sticky filter input and raising the keyboard. No new context slots; only the mounted screen's listener fires.
- **"Added" date in Your Copy** — album detail panel now shows the Discogs `date_added` value (formatted as e.g. "Jan 14, 2026") after the Folder row in the Your Copy section. Field was already synced and stored — display-only addition to `album-detail.tsx`.
- **Following wantlist activity** — followed users' wantlist additions now cached and surfaced alongside collection activity. New `proxyFetchUserWantlistPage` Convex action fetches page 1 (50 items, sorted by date desc) per followed user; paired with collection fetch via `Promise.all` inside the existing 1s inter-user sync window. `following_feed` schema extended with optional `recent_wants` field. Pre-existing cache rows force-refreshed once via `needsWantsMigration` branch. Feed screen and Following screen Following Activity sections now have a **Collection | Wantlist tab switcher** (Collection default). "See all" from Feed deep-links to the correct tab via one-shot `followingActivityTabIntent` state. No heart button on wantlist activity rows.

---

## [0.5.5] — 2025-04-09

### Changed

- Insights panels reordered: Collection Value → Listening → Purge Progress → remaining
- "Days since last played" tile in Listening panel now shows "Last played today!" (0 days) or "Last played yesterday" (1 day) instead of a number

### Added

- 2x2 / 3x3 grid toggle restored on Collection, Wantlist, and Following screens; preference persists via existing Convex mechanism
- "Open Purge" link added to Purge Progress panel header on Insights screen

### Fixed

- Following screen active page indicator now shows yellow outline ring on avatar, matching Settings screen
- Folder pill on collection grid cards no longer clips prematurely (removed double-subtracted 32px max-width)
- Label pill in wantlist crate overlay no longer hard-capped at 40% width
- Sold History and Auction History buttons removed from release detail panel in all contexts

---

## [0.5.4] — 2026-04-09

### Navigation

- Mobile bottom tab bar converted from floating pill to fixed flush bar
- Removed side margins and border-radius from nav bar
- Active tab highlight changed from `rounded-full` to `rounded-[12px]`
- Nav height now expands with safe area: `calc(60px + env(safe-area-inset-bottom))`
- Updated `--nav-clearance`, `--slide-panel-footer-pb`, scroll fade overlay, and WantlistCrossoverPrompt offset to match new geometry
- Fixed Following screen double safe-area inset bug
- Removed stale `pb-[112px]` / `pb-[120px]` dead-code classes from album-grid, album-list, and wantlist
- Removed PWA standalone `.bottom-tab-bar` override (no longer needed)

### Header

- Removed HOLY GRAILS wordmark from all screens except Feed
- MobileHeader is now context-aware with five variants (A–E) per screen
- Screen titles rendered in header: Collection, Wantlist, Sessions, Insights, Following, Settings
- Feed header renders wordmark left-aligned in title position
- Sessions header: screen title + yellow Plus button (triggers new session form)
- Following header: screen title + yellow UserPlus button (triggers add user form)
- User profile header (Variant E): back arrow + avatar + @username + muted unfollow icon
- Unfollow button de-emphasized to `var(--c-text-muted)` — triggers confirmation modal only
- Per-screen internal title bars removed from all screens
- Header action callbacks registered via AppContext with double-arrow pattern to prevent mount auto-trigger
- Fixed React functional update bug causing New Session form and Add User input to auto-open on mount
- `transparent` prop removed from MobileHeader (was a no-op)

### Search / Filter Row

- Removed compact 3-column grid toggle from Collection, Wantlist, and followed user profile view
- Removed swiper/disk display toggle from Collection, Wantlist, and followed user profile view
- Filter button repositioned to the right of view toggles on Collection and Wantlist
- Filter button added to followed user profile view
- Search bar expands to fill reclaimed space on all three screens
- Added fallback: if swiper was the active view mode, resets to large grid on mount

---

## 0.5.3 — 2026-04-06

### Play history, play count pills, and listening enhancements

#### Play history (append model)
- Migrated `last_played` from upsert to append model — every play logs a new record
- `playCounts` and `allPlayTimestamps` exposed via app context

#### Album detail — Mark as Played
- Added "Log a past play" secondary link below the Mark as Played button, opens a native date picker capped at today
- Tapping an existing "Last played" date opens the picker to edit it

#### Play history UI
- Play count summary row and history accordion added to "Your Copy" section in album detail panel
- Shows play icon, count, and individual play dates newest first
- Renders null when no plays logged

#### Play count pill
- Play icon + count overlay added to collection album card thumbnails across all surfaces — grid, list, artwork, feed (Recommended, Recently Added, Depths, Decades, Format Spotlight)
- Only appears when play count >= 1
- List view: pill repositioned from thumbnail overlay to right edge of list row, bottom-right, alongside purge dot indicator

#### Streak calculation
- Updated to work with append model play data
- Both current streak and longest streak computed in the same useMemo pass

#### Insights — By Format cards
- Flipped label/number hierarchy — label now appears above the number for improved legibility

#### Feed — Splash screen cycling stats
- Returning users see rotating collection stats during sync progress screen

#### Album detail — bottom gradient
- Panel now has matching gradient fade at bottom consistent with other screens

#### Investigated
- Sold History link: investigated iOS Universal Link interception by Discogs native app; attempted bypass via window.open and intermediate redirect

---

## 0.5.2 — 2026-03-28

### Insights screen overhaul

#### Fixes
- Removed duplicate "By Condition" tab from Breakdown card — standalone Condition card with color-coded bars and NM% callout is the sole condition visualization
- Added compact stat line below Insights heading: "{N} collected · {N} on wantlist" (plain text, no card)
- Fixed "no play recorded" → "no plays recorded" everywhere in the Listening section
- Fixed days-since-last-played calculation: now normalizes to start-of-day before diffing, so a play yesterday correctly returns 1 instead of 0
- Renamed label to "days since last played"

#### New sections
- **Top Artists**: Ranked list (#1–10), artists with 2+ albums only, minimum 3 to display. Filters generic entries (Various, Unknown). #1 highlighted in yellow.
- **Top Labels**: Lollipop chart, labels with 2+ albums, cap 10, minimum 3 to display
- **By Format tab**: Added to Breakdown card (replaces removed By Condition tab). Normalized format string parsing. Rendered as 2×2 stat grid.

#### Visualization improvements
- By Folder tab: replaced horizontal bars with two-column ranked list, no row cap, handles long folder names
- By Decade tab: filters invalid years (< 1900), all labels now render, peak decade bar in #EBFD00, "Most collected decade" yellow pill callout
- Top Artists changed from bar chart to editorial ranking list
- Top Labels changed from bar chart to lollipop (thin stem + dot) chart

#### Listening section
- Removed "It's been a while" suggestion card
- Added Recently Played list (max 5, hidden if no plays logged), styled identically to No Spins on File
- "Played this month" stat cell now uses green Keep purge tag styling

### Fixed (QA pass)

- **Shake permission reset** — On app boot, if Shake for Random is enabled, `App.tsx` silently checks whether iOS motion permission is still valid via `DeviceMotionEvent.requestPermission()`. If permission has been revoked (e.g. after PWA reinstall or clearing browsing data), the toggle is reset to `false` in Convex and a toast is shown: "Shake permission was reset by iOS. Re-enable in Settings to reactivate." Check runs once per session, iOS only.
- **Year = 0 suppression** — Discogs returns `0` for year when a pressing has no release date. Year is now suppressed app-wide (detail panels, list rows, grid cards, swiper cards, feed cards, following cards) when the value is `0`, `null`, or `undefined`. A `hasYear` guard is defined locally in each affected file. No data layer changes.
- **Grid card height consistency** — Cards with no year now use `visibility: hidden` on the year element rather than removing it from the DOM, so cards with and without a year remain the same height in grid views. Detail panel `DetailRow` year entries are still fully removed when absent.
- **No Spins on File daily rotation** — The neglected album list in Insights previously always showed the same albums (oldest added). It now uses a seeded shuffle keyed to the current calendar date (seed: `YYYYMMDD` integer via `mulberry32`), so the same 4 albums appear all day but a new set is shown each day.
- **Keyboard dismiss on panel open** — `SlideOutPanel` blurs the active element on mount, dismissing the iOS software keyboard whenever any panel opens over an active text input (e.g. collection search). App-wide coverage — no per-handler changes needed.
- **ReleaseDetailPanel button styles** — "Add to Collection", "Add to Wantlist", and "Remove from Wantlist" buttons in `ReleaseDetailPanel` now use a unified neutral surface style (`var(--c-surface)` bg, `var(--c-border-strong)` border, `var(--c-text)` color). Leading icons removed from all three. `DestructiveButton` gains an optional `variant?: "destructive" | "neutral"` prop (defaults to `"destructive"`); `ReleaseDetailPanel` passes `variant="neutral"`. Other panel uses of `DestructiveButton` are unchanged.

---

## 0.5.1

### Added
- **ReleaseDetailPanel** — full album detail panel for non-collection albums. Opens from Following screen (all view modes) and Feed screen (Recent Activity, From the Depths, Decades). Shows hero image, thumbnail carousel, enriched tabs (Tracklist, Credits, Pressing Notes, Identifiers), community stats (Have It / Want It / Avg. Rating), Add to Collection CTA, and wantlist Heart button.
- **Add to Collection** — new `proxyAddToCollection` Convex action (#19). Adds release to Discogs folder 1 (Uncategorized), updates local state and Convex cache. Success toast + panel close. No full re-sync.
- **Remove from Collection** — new `removeFromCollection` context action backed by existing `proxyRemoveFromCollection`. Accessible via Edit mode danger zone in collection `AlbumDetailPanel`. Two-tap confirm pattern.
- **WantItemDetailPanel enriched tabs** — Tracklist, Credits, Pressing Notes, and Identifiers tabs now load in the wantlist item detail panel, matching the collection panel experience.
- **DestructiveButton** — shared two-tap confirm destructive action component local to `album-detail.tsx`. Used by all three panel variants for remove actions.
- **selectedFeedAlbum** context slot — parallel to `selectedWantItem`, enables feed/following album detail routing.

### Changed
- **Sessions nav icon** updated from `Headphones` to `Music` in both mobile bottom bar and desktop top nav.
- **Bookmark buttons removed** from all album card views (Grid, Artwork, List, Swiper). Session picker now accessed via the `Music` icon on the Recommended card and the inline album detail accordion.
- **Heart icon** replaces Zap/bolt on the wantlist button in `ReleaseDetailPanel` for clarity.
- **App.tsx sheet gate** updated to `selectedAlbum || selectedWantItem || selectedFeedAlbum` — fixes silent panel-open failures when `selectedAlbum` is null.
- **On the Hunt cards** (Feed screen) now correctly call `setShowAlbumDetail(true)` alongside `setSelectedWantItem` — was a latent bug exposed by the gate change.

### Fixed

- **Touch sensitivity on album cards** — accidental album detail opens during scroll on mobile. Two-part fix: (1) `touch-action: manipulation` added to all interactive card elements app-wide (album-grid, album-artwork-grid, album-list, crate-flip, feed-screen, following-screen, depths-album-card) — solves unprotected `onClick`-only cards with no JS changes; (2) explicit touch handlers updated from X-or-Y 6px threshold to Y-axis-only 10px threshold — X-axis movement during vertical scroll is no longer treated as a drag signal.

### Removed
- **"View on Discogs" links** removed app-wide from all album and release detail contexts. OAuth flows unaffected.
- **MarketValueSection** removed from `WantItemDetailPanel` and `ReleaseDetailPanel`. Remains in collection `AlbumDetailPanel` only.
- **WantlistHeartButton overlay instances** removed from all album artwork across Following and Feed screens.

---

## [0.5.0] — 2026-03-10

### Changed
- Replaced `h-screen` on root App container with `h-[100dvh]` to fix iOS Safari viewport clipping
- Replaced `100vh` with `100dvh` in `calc()` expressions across `add-albums-drawer.tsx`, `filter-drawer.tsx`, `session-picker-sheet.tsx`, and `slide-out-panel.tsx`
- Replaced hardcoded animation duration values with motion tokens (`DURATION_FAST`, `DURATION_NORMAL`, `DURATION_SLOW`) in `folders-screen.tsx`, `sessions.tsx`, `loading-screen.tsx`, `accordion-section.tsx`, and `following-screen.tsx`
- Replaced inline `[0.25, 1, 0.5, 1]` easing value with `EASE_OUT` token in `following-screen.tsx`

### Documentation
- Corrected `--c-text-muted` and `--c-text-faint` light mode token values in CLAUDE.md to match `theme.ts`
- Corrected `--c-chip-bg` and `--c-input-bg` dark mode values in CLAUDE.md to reflect oklab expressions
- Added offline banner (z-115) and purge tracker (z-88/89) to documented z-index hierarchy
- Added `format-spotlight.tsx`, `offline-banner.tsx`, and `use-online-status.ts` to file structure documentation
- Documented `--app-bg`, `--nav-clearance`, `overlay-scroll`, `tappable`, and Sonner toast theming
- Documented detached-component surface color pattern (`#132B44` / `#FFFFFF`)

---

## 0.4.3 — Album Detail Mobile Hero + Enriched Tabs

### Album Detail

- Full-bleed hero image on mobile — padded square cover with gradient scrim overlay, title and artist floating as white text on the gradient
- Thumbnail carousel spacing tightened with `mt-3` below hero
- Standalone title/artist block removed from mobile — now lives in the gradient scrim
- Purge tag relocated to its own row below the carousel (left-aligned, hidden in edit mode)
- "Your Copy" card header added on mobile with "YOUR COPY" section label and edit pencil button right-aligned
- Enriched content tabs replace accordion sections on mobile — sticky horizontal tab bar for Tracklist, Credits, Pressing Notes, and Identifiers with `#EBFD00` underline indicator
- Tabs with no data hidden after enriched fetch resolves; all four show at `opacity: 0.4` during loading with skeleton below
- IntersectionObserver sentinel pattern adds `paddingTop: 48px` when tab bar is stuck to clear close button
- Inner scroll container `overflow-y-auto` now conditional — desktop only, removed on mobile so `position: sticky` resolves correctly against `SlideOutPanel` scrollRef
- `hideTitle` prop added to `TracklistSection`, `CreditsSection`, `PressingNotesSection` for tab content rendering
- `hideToggle` prop added to `TracklistSection` — shows full tracklist without Show More truncation
- Custom SVG select arrows on all edit mode `<select>` elements — `appearance: none` with theme-aware arrow color (`#AAAAAA` dark, `#333333` light) for iOS dark mode compatibility
- SlideOutPanel drag handle padding tightened from `py-3` to `py-1.5`
- SlideOutPanel close button updated to `rgba(0,0,0,0.45)` background with `backdrop-filter: blur(6px)` and white icon for contrast over artwork

### Following Screen

- Followed user avatars increased from 48px to 80px with 28px fallback initials
- Avatar row sorted by most recent `followingFeed` activity per user (descending), users with no feed entries fall to end tiebroken alphabetically

---

## 0.4.2 — Album Detail Panel Redesign + Color System Standardization

### Album Detail Panel

- **CommunityRow component** — redesigned Community section as a three-column layout (Have It / Want It / Avg. Rating) with colored icons (#3E9842 green, #EF5350 red, #FFC107 amber), K-suffix number formatting, and loading skeleton
- **Tracklist** — replaced accordion with inline gradient fade + SHOW MORE / SHOW LESS toggle (5-track default; albums with ≤5 tracks show no controls)
- **DetailRow layout flipped** — labels now right-aligned `w-24` column, values left-aligned; applied across Your Copy, edit mode, identifiers, and WantItem detail
- **Genre and style tags** — rendered as `rounded-full` pills with `--c-chip-bg` background
- **Section headings** — standardized to 16px / font-semibold / `var(--c-text)` / Title Case across all sections
- **AccordionSection wrappers removed** — Credits, Pressing Notes, and Identifiers now render flat by default
- **Section spacing** — increased `pb-4` → `pb-6` throughout
- **Section order restructured** — personal/actionable content surfaces first (Your Copy → User Notes → Mark as Played → Discogs link → Community Stats → Market Value → Sessions → Rate for Purge), Discogs reference data below (Tracklist → Credits → Pressing Notes → Identifiers)
- **Sessions section** — wrapped in a bordered scrollable container (`--c-border-strong`, borderRadius: 10px, maxHeight: 240px)
- **View on Discogs link** — centered
- **Release image gallery** — horizontal thumbnail strip (renders when `images.length > 1`) and fullscreen lightbox with drag-to-swipe (Framer Motion, ~50px threshold), ChevronLeft/Right nav, image counter, and backdrop-tap-to-close
- **ReleaseData type** — extended with `images` array; `proxyFetchRelease` updated to map `release.images`
- **Z-index** — image lightbox overlay `z-[140]`, backdrop `z-[135]`

### Color System

- **Oklab dark mode tokens** — applied relative color expressions to 6 dark mode background tokens in `theme.ts` (`--c-bg`, `--c-surface`, `--c-surface-hover`, `--c-surface-alt`, `--c-chip-bg`, `--c-input-bg`)
- **New semantic tokens** — added 8 tokens: `--c-destructive`, `--c-destructive-hover`, `--c-destructive-tint`, `--c-link`, `--c-link-hover`, `--c-sheet-shadow`, `--c-shadow-sm`, `--c-shadow-modal`
- **Condition color extraction** — condition grade color map extracted to `src/lib/condition-colors.ts`; removed duplicates from `album-detail.tsx`, `market-value.tsx`, and `reports-screen.tsx`
- **Token rollout** — new tokens applied across 12 files; retired the `isDarkMode ? "#EBFD00" : "#0078B4"` ternary in favor of `var(--c-link)`
- **Dark mode heading bug** — `theme.css` h1/h2/h3 had hardcoded `#0C284A` and did not respond to theme; replaced with `var(--c-text)`
- **Chip text bug** — `#242A13` chip text in `crate-browser.tsx` corrected to `#0C284A`
- **Reports chart colors** — aligned to existing semantic tokens
- **CLAUDE.md color doctrine** — replaced `### Color Palette` section with full `### Color System` doctrine covering Oklab philosophy, 8 enforceable derivation rules, token hierarchy table, brand/accent exception lists, and gradient patterns

---

## 0.4.1

### Added
- **Default screen preference** in Settings > Appearance — choose which screen loads on startup (Feed, Collection, Wantlist, Sessions, or Insights). Persisted to Convex `preferences` table as `default_screen`.
- **PWA install nudge** for mobile browser users — detects standalone mode, captures `beforeinstallprompt` on Android (with native install CTA), shows instructional copy on iOS Safari. Dismissal persisted to localStorage. Mobile-only, never shown in installed PWA.

### Changed
- **Install nudge redesigned as bottom sheet** — replaced top banner (which was clipped by the mobile header) with a fixed-position bottom sheet (`z-[150]`) and backdrop (`z-[149]`). Centered layout with app icon, platform-specific copy, and dismiss button. iOS gets an outlined "Maybe Later" button; Android gets a yellow CTA + text dismiss link.

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