# CLAUDE.md — Holy Grails v0.6.0

This file is read by Claude Code at the start of every session. Follow everything here before making any decisions about architecture, design, or implementation.

---

## What This App Is

**Holy Grails** is a vinyl record collection management PWA that syncs with Discogs. It is not a Discogs clone. The core value is decision-making and curation — specifically the purge workflow (evaluating records as Keep / Cut / Maybe) and session building. These are things Discogs does not do.

The app is a passion project and portfolio piece built by a designer (Shawn) using vibe coding. Designed for a small circle of friends today with potential to scale. Code quality matters, but preserving the design integrity matters more. When in doubt, match the existing visual and interaction patterns exactly.

---

## Tech Stack

- **Framework**: React + TypeScript
- **Build tool**: Vite
- **Styling**: Tailwind CSS + CSS custom properties
- **Animation**: Framer Motion (imported as `motion` from `"motion/react"`)
- **Icons**: Phosphor Icons (`@phosphor-icons/react`) — imported EXCLUSIVELY through the alias shim `src/app/components/icons.ts`, which re-exports Phosphor icons under the legacy Lucide names the components were written against (e.g. `VinylRecordIcon as Disc3`, `CardsThreeIcon as GalleryVerticalEnd`). Never import from `@phosphor-icons/react` directly in a component, and never reintroduce `lucide-react`. Phosphor has no `strokeWidth` prop — boldness comes from `weight`: `regular` is the global default (set via `IconContext.Provider` in `main.tsx` with `size: 24`, matching Lucide's implicit defaults), `fill` marks active states (selected nav tab, filled heart/bolt/star, solid Play triangles), `light` is the deliberately airy stroke (inactive nav, header buttons, outline hearts/stars — replaces the old fractional strokeWidths 1.2–1.5), `bold` replaces the old strokeWidth 2.25–3 emphasis (small confirm checks, the feed Shuffle button). `thin` and `duotone` are unused — do not introduce them without a design pass.
- **Charts**: Recharts
- **Barcode decoding**: zxing-wasm — used ONLY by the Look It Up barcode scanner. Lazy-loaded (dynamic import) with the .wasm bundled locally via `?url` so nothing fetches from a CDN; excluded from the SW precache. Do not import it anywhere else or statically.
- **Fonts**: Bricolage Grotesque (display/headings) + DM Sans (body/UI) via Google Fonts
- **Backend**: Convex (all Holy Grails-exclusive data — purge tags, sessions, following, preferences, last played, want priorities)
- **Auth**: Discogs OAuth 1.0a — the Discogs username is the primary key for all Convex data. Session-token-based auth guards on all Convex functions (see Authentication Architecture). There is no separate Holy Grails account system.

Do not introduce new dependencies without flagging it first. The existing stack is intentional.

---

## Data Architecture

### What lives in Discogs (via API sync)
- Collection (albums, folders, conditions, notes, custom fields)
- Want list
- User profile (username, avatar, location, bio, buyer/seller ratings, registered date, contributions)

### What lives in Convex (Holy Grails-exclusive)
- Purge tags (keep / cut / maybe + timestamps), keyed by `discogs_username` + `release_id`
- Sessions (name, album order, created/modified timestamps), keyed by `discogs_username` — stored in the `stacks` table (see the Sessions naming note below)
- Following list (other Discogs users being followed in-app + `avatar_url`), keyed by `discogs_username`
- Following feed cache (`following_feed` table — 50 most recent albums per followed user, 24h TTL per user, up to 25 users)
- Wantlist cache (`wantlist` table — mirrors Discogs wantlist for offline/fast reads, 24h TTL synced alongside collection)
- Want list priority bolts, keyed by `discogs_username` + `release_id`
- Last-played timestamps, keyed by `discogs_username` + `release_id`
- Collection cache (`collection` table — mirrors Discogs collection for offline/fast reads; local `albums`/`wants` state is reactively derived from these cache subscriptions)
- Followed collections cache (`followed_items` table — slim rows of each followed user's collection + wantlist, written server-side by `discogs.syncFollowedUser`, read per-profile; sync metadata `is_private`/`collection_synced_at` lives on the `following` table)
- Sync progress (`sync_status` table — one doc per user, written by the server-side sync loop, subscribed by the client for per-page progress)
- User preferences (theme, hide purge indicators, shake to random, view mode, want view mode, default screen, recent Look It Up searches), keyed by `discogs_username`. The `hide_gallery_meta` field still exists in the schema but is legacy — its swiper view was removed and the Settings toggle deleted with it; do not resurface it.
- OAuth tokens (access token + token secret), `session_token`, `session_created_at`, `collection_value`, `collection_value_synced_at`, `discogs_avatar_url`, `created_at`, `last_synced_at`, stored in the `users` table

### Sessions Naming Note (feature name vs. internal names)
The listening-sessions feature is called **Sessions** in all user-facing copy and documentation. It was briefly renamed "Stacks" (June 2026) and then rolled back to Sessions — but ONLY the verbiage rolled back. Internal names keep the stack-era naming and must not be renamed:
- Convex table: `stacks` (in `convex/stacks.ts`). It CANNOT be renamed to `sessions` — an undeclared legacy `sessions` table from before the rename still holds old rows in both deployments, and declaring that name fails Convex schema validation.
- Files: `stacks.tsx`, `stack-picker-sheet.tsx`, `convex/stacks.ts`
- Code identifiers: the `Stack` type, `stacks` state, `createStackDirect`, `deleteStack`, `renameStack`, `toggleAlbumInStack`, `isInStack`, `reorderStackAlbums`, `stackPickerAlbumId`, `onNewStack`, etc.
- Screen route key and stored `default_screen` preference value: `"stacks"`
Do not rename these identifiers to `session*` — besides the table constraint, they would collide with auth session naming (`sessionToken`, `auth_sessions`). When writing user-facing copy or docs, always say Sessions.

### Vinyl-Only Filter
Holy Grails is intentionally vinyl-only. A global filter (`formats[].name === "Vinyl"`) is applied at the data layer during Convex collection sync and cache hydration in `app-context.tsx`. CDs, cassettes, and other formats are excluded before albums reach any UI component. This is a product decision, not a flag or user setting. No other formats should ever surface in the UI.

### Rules
- Never use localStorage for any persistent data
- All Convex reads use `useQuery`, all writes use `useMutation`
- Use optimistic updates for writes wherever Convex supports it
- The public API of `app-context.tsx` must not change when wiring Convex — components should not need to update
- **Reactive hydration:** local `albums` and `wants` state is derived from the Convex `collection`/`wantlist` cache subscriptions (merged with purge tags / want priorities) in `app-context.tsx`. Any code path that changes collection/wantlist data MUST also write the corresponding Convex cache mutation (`addItem`/`removeItem`/`updateInstance`/`renameFolderInCache`), or the change will be reverted by the next re-derive.
- **Search state is screen-local:** `searchQuery` (Collection) and `wantSearchQuery` (Wantlist) live in their screens, filtered via the `useFilteredAlbums` hook — they are intentionally NOT in the app context so a keystroke doesn't re-render every context consumer. Do not add search state back to `app-context.tsx`. Do not put `searchQuery` in view `key` props (it remounts the whole grid per keystroke) — pass `resetKey` for scroll-to-top instead.

---

## Authentication Architecture

**Session token auth pattern:**
All Convex queries and mutations (except the `oauth.ts` handshake) require a valid `sessionToken`. A central `authenticateUser()` helper in `convex/authHelper.ts` handles validation (including expiry) and returns the authenticated user record. The `discogs_username` is always derived server-side from the authenticated user — never accepted as a client-supplied argument.

**Session token flow:**
`auth-callback.tsx` makes a single server-side action call — `oauth.completeLogin(oauth_token, oauth_token_secret, oauth_verifier)` — which exchanges the verifier for an access token, derives the username from Discogs `/oauth/identity` (the client can NEVER supply a username), and upserts the user via the internal `users.upsert` mutation. Raw OAuth access tokens never reach the client. The returned `sessionToken` is stored in `app-context.tsx` state, persisted to `localStorage` as `hg_session_token`, and threaded through all Convex mutation/query call sites.

**Per-device sessions (`auth_sessions` table):**
Every OAuth login mints a FRESH token as its own row in the `sessions` table (token rotation), so one device's login never invalidates another device's session. Sign-out (`users.clearSession`) deletes only the calling device's row — the user record (OAuth tokens, sync metadata) stays, so the next login boots instantly from cache. Sessions expire 90 days after mint (`SESSION_TTL_MS` in `authHelper.ts`); expired rows are pruned at login, and `resolveSession` also honors the legacy single-token fields on `users` read-only until those age out. `users.deleteAllUserData` clears all sessions.

**Session token persistence (`hg_session_token`):**
The `setSessionToken` wrapper in `app-context.tsx` syncs every token change to `localStorage`. On cold load, `sessionToken` state initializes from `localStorage.getItem("hg_session_token")`. If a stored token exists, it is passed to `getLatestUser` to look up the user by `by_session_token` index. If no stored token exists (fresh visitor, incognito, post-logout), `getLatestUser` is skipped entirely and the visitor sees the login screen. If the stored token is invalid (no matching user), the token is cleared from localStorage and the visitor sees the login screen. This is the only permitted use of `localStorage` in the app — do not add other localStorage usage without discussion.

**users.ts function split:**
- `getLatestUser` — session restore query, requires `sessionToken` argument, looks up user by `by_session_token` index; returns the user record WITHOUT OAuth tokens and WITHOUT echoing the session token; returns `null` for invalid/expired tokens
- `getMe` — authenticated query, returns user record without tokens
- `upsert` — INTERNAL mutation, callable only from `oauth.completeLogin`. It must never be made public: a public variant would let any caller claim any username and receive that user's session token (full account takeover).

**Schema change:**
New `auth_sessions` table (`session_token`, `discogs_username`, `created_at`) with `by_token`/`by_username` indexes. The `session_token`/`session_created_at` fields on `users` are legacy, honored read-only. The table is deliberately NOT named `sessions` — an undeclared legacy `sessions` table from before the Sessions→Stacks rename still holds old rows in the deployments, and declaring that name fails Convex schema validation. (The same collision is why the Sessions feature's own table is still named `stacks` — see the Sessions naming note in Data Architecture.)

**Exempt from auth guards:**
`convex/oauth.ts` functions (`requestToken`, `completeLogin`) are intentionally public — they are the OAuth handshake and must remain unauthenticated. `completeLogin` is safe because the identity it mints a session for comes from the Discogs token exchange itself, not from the caller.

**`discogsAuth` removed from AppState.** Components that previously used `discogsAuth` to make Discogs API calls now get `sessionToken` from `useApp()` and pass it to Convex proxy actions instead.

**`oauthCredentials` state and `convexAuthCredentials` query removed** from `app-context.tsx`. Tokens are resolved server-side.

**`discogsToken` dev flow removed.** All authentication now goes through OAuth. There is no longer a personal access token fallback.

**`authedArgs` pattern (stale token defense):**
All authenticated `useQuery` subscriptions in `app-context.tsx` use a shared `authedArgs` variable that gates on `!!discogsUsername && !!sessionToken`. During session restore, `discogsUsername` is only set after `getLatestUser` confirms the token is valid — so authenticated queries never fire with a stale token. New authenticated queries must use `authedArgs` as their argument condition, not `sessionToken` alone. `getLatestUser` is the only exception — it gates on `sessionToken` only, as it is the gatekeeper query that validates the token before `discogsUsername` is set.

---

## Discogs API Proxy

All authenticated Discogs API calls go through server-side Convex actions in `convex/discogs.ts`. The client never calls the Discogs API directly. Actions look up the user's credentials server-side via `getUserCredentials` (an internalQuery in `convex/discogsHelpers.ts`) and sign requests using HMAC-SHA1.

**convex/discogs.ts** — `"use node"` directive. Public actions (all take `sessionToken` as the first argument): `syncSelf`, `syncFollowedUser`, `proxyFetchIdentity`, `proxyFetchUserProfile`, `proxyFetchSyncSignals`, `proxyFetchWantlist`, `proxyFetchCollectionValue`, `proxyUpdateCollectionInstance`, `proxyMoveToFolder`, `proxyRemoveFromCollection`, `proxyAddToWantlist`, `proxyRemoveFromWantlist`, `proxyFetchRelease`, `proxyFetchUserCollectionPage`, `proxyFetchUserWantlistPage`, `proxyFetchFolders`, `proxyCreateFolder`, `proxyRenameFolder`, `proxyDeleteFolder`, `proxyUpdateProfile`, `proxyAddToCollection`, `proxySearchDatabase`, `proxyFetchMasterVersions`, `proxyFetchMarketData`, `warm` (unauthenticated no-op for runtime pre-warming).

**Standalone database search & market lookup:**
- `proxySearchDatabase` — searches the Discogs database. `type` is `master` (default) or `release` only; pagination is appended server-side. `format=Vinyl` is applied to **release searches only** — masters aren't format-specific objects and coupling them to a format filter starves results (masters with vinyl pressings can return zero rows). Vinyl-only still holds: the pressing picker's versions call hard-codes `format=Vinyl`, so nothing non-vinyl is ever addable. Splits the combined "Artist - Title" result string and returns a trimmed row shape (`id`, `type`, `masterId`, `title`, `artist`, `year`, `thumb`, `cover`, `label`, `catno`, `country`, `format`, `have`, `want`) plus pagination totals.
- `proxyFetchMasterVersions` — vinyl pressings of a master, filtered/paginated server-side (`country`, `year`→`released`, `label` native params; sorted `released asc`). Returns per-version `inCollection`/`inWantlist`/`haveCount` from `stats`, filter facets (when the API provides them), `mainReleaseId` (fetched once on the unfiltered first page), and pagination totals.
- `proxyFetchMarketData` — condition-tiered price suggestions from `/marketplace/price_suggestions/{id}`. **Returns `null` when the user has no Discogs seller settings** — all callers must treat `null` as "no data" and degrade silently. Never surface an error or a prompt to configure seller settings.
- `proxyFetchRelease` now also returns Tier 1 market signal: `lowestPrice` (number | null, lowest *ask*) and `numForSale`. Zero extra requests — these ride on the existing release fetch.

**Server-side sync loops:**
- `syncSelf` — the user's own collection/wantlist sync runs entirely inside this action: paginated fetch (shared `fetchCollectionInternal`/`fetchWantlistInternal` helpers), vinyl-only filter, diff writes straight to the Convex `collection`/`wantlist` caches via `applyDiff`, collection value, profile, and sync metadata. Synced data never round-trips through the client; the client receives it reactively through its cache subscriptions. Per-page progress is written to the `sync_status` table.
- `syncFollowedUser` — fetches a followed user's collection (folder 0, `skipPrivateFields` semantics) + wantlist and replaces their `followed_items` rows in chunks. Detects private collections (403 → `is_private` on the `following` row) and refreshes the stored avatar.
- **Adaptive rate limiting** — `discogsFetch` reads `X-Discogs-Ratelimit-Remaining` and backs off progressively as the 60/min budget drains (full speed with headroom, sleeps near the floor, 429 retry as backstop). The old fixed 1.1s sleep between pages is gone; do not re-add fixed sleeps to server-side pagination loops.

**Self-operation username derivation:** Actions that operate on the authenticated user's own data (collection value, instance updates, folder moves/management, collection add/remove, wantlist add/remove, profile update) build their Discogs URLs from `creds.username` returned by `getUserCredentials` — the client-supplied `username` argument is accepted for backward compatibility but ignored. Only the cross-user read actions (`proxyFetchUserProfile`, `proxyFetchCollection`, `proxyFetchWantlist`, `proxyFetchUserCollectionPage`, `proxyFetchUserWantlistPage`) honor the `username` argument, since they are also used to fetch followed users' data.

`proxyAddToCollection` — action #19. POSTs to `/users/{username}/collection/folders/{folder_id}/releases/{release_id}`. Defaults to folder 1 (Uncategorized). Returns `instance_id`. Caller inserts album into local state and Convex collection cache — no full re-sync.

**convex/discogsHelpers.ts** — Contains `getUserCredentials` (internalQuery). Separated from `convex/discogs.ts` because Convex does not allow queries in `"use node"` runtime files. If adding new internal queries needed by Discogs actions, they must live here, not in `discogs.ts`.

**convex/oauth.ts** — OAuth handshake actions (`requestToken`, `completeLogin`). `completeLogin` performs the access-token exchange, derives the username server-side from `/oauth/identity`, and calls the internal `users.upsert`. Reads `DISCOGS_CONSUMER_KEY` and `DISCOGS_CONSUMER_SECRET` from `process.env`. Still uses PLAINTEXT signing (acceptable for transient token exchange over HTTPS).

**discogs-api.ts** — HTTP functions removed. File now contains only: exported types (`Album`, `WantItem`, `Stack`, `FollowedUser`, `FeedAlbum`, `PurgeTag`, `UserProfile`, `CollectionValue`), constants (`CONDITION_GRADES`, `CONDITION_SHORT`), and pure utility functions (`normalizeCondition`, `buildFieldMap`). Do not re-add HTTP functions here.

**`DiscogsAuth` type removed.** The client no longer holds raw OAuth credentials. Auth is identified entirely by `sessionToken`.

**`getAuthCredentials` removed from `convex/users.ts`.** Raw OAuth tokens are never returned to the client. Token lookup is internal only via `getUserCredentials` in `convex/discogsHelpers.ts`.

**Convex "use node" constraint:** Files with the `"use node"` directive (like `convex/discogs.ts`) cannot contain queries or mutations — only actions. Any internalQuery needed by a Node.js action must live in a separate file (e.g. `convex/discogsHelpers.ts`) and be called via `ctx.runQuery(internal.discogsHelpers.functionName, args)`.

**Sync progress:** the server-side sync loop writes per-page progress to the `sync_status` table (`convex/syncStatus.ts`); the client subscribes via `api.syncStatus.get` and formats messages like "Syncing collection (150 of 300)" (`formatSyncStatus` in `app-context.tsx`).

---

## Environment Variables

**Client-side (`.env.local`):**
- `VITE_CONVEX_URL` — Convex deployment URL (safe to expose)
- `VITE_DISCOGS_CONSUMER_KEY` and `VITE_DISCOGS_CONSUMER_SECRET` have been removed. These now live exclusively in Convex environment variables.

**Convex environment variables (set via Convex dashboard):**
- `DISCOGS_CONSUMER_KEY` — set on both `adventurous-crow-499` (dev) and `unique-sturgeon-566` (prod)
- `DISCOGS_CONSUMER_SECRET` — set on both deployments

Note: Convex env vars cannot be set via `.env` files. Use the Convex dashboard (Settings > Environment Variables) or `npx convex env set KEY value`.

---

## Running the Project

```bash
npm install
npm run dev        # http://localhost:1234 (Vite, port set in vite.config.ts)
npm run typecheck  # strict tsc --noEmit — must pass before committing
npm test           # Vitest — must pass before committing (CI runs it)
npm run build      # production build (requires VITE_CONVEX_URL)
```

---

## Testing

Vitest, run via `npm test` (wired into CI alongside typecheck and build). Config lives in `vitest.config.ts` — deliberately separate from `vite.config.ts` so tests run without plugins or `VITE_CONVEX_URL`. No component/DOM testing layer (no jsdom, no testing-library) — tests cover Convex functions and pure logic only. Do not add DOM testing dependencies without flagging first.

**Convex function tests** (`convex/*.test.ts`, via `convex-test`): run in the `edge-runtime` environment — each file opts in with a `// @vitest-environment edge-runtime` docblock as its FIRST line (it must precede the `/// <reference types="vite/client" />` line that types `import.meta.glob`). The Convex CLI ignores `*.test.ts` when deploying. These tests protect the security invariants and must never be weakened or deleted to make a change pass:
- `authHelper.test.ts` — session-token guard: valid/unknown/empty/expired tokens, the 90-day TTL boundary, legacy single-token fallback, per-device sign-out isolation, and that `getMe`/`getLatestUser` never return `access_token`/`token_secret`/`session_token`.
- `shareActivity.test.ts` — the Cross-User Data Pattern gate: unauthenticated viewers rejected, only `shareActivity === true` exposed, "not found" indistinguishable from "not opted in", no token leakage, and that viewers authenticated via the `auth_sessions` table (every fresh login) can read opted-in targets.

**Pure logic tests** (`src/**/*.test.ts`, node environment): `use-filtered-albums` (via the exported pure `filterAndSortAlbums` — the hook wraps it in `useMemo`; keep the split so the logic stays testable without React), `collection-facts` threshold gating, `format.ts` relative-time ladder, `buildFieldMap`/`isVinylFormat`, and the Fisher–Yates `shuffle`. Shared `makeAlbum` factory lives in `src/test/factories.ts`.

When adding a new guarded Convex function or a new cross-user query, add tests for its auth guard / shareActivity gate in the same session.

---

## File Structure

```
src/
  app/
    App.tsx              # Root layout, screen routing, splash flow, side panel. ReportsScreen and album-detail are React.lazy chunks (recharts stays off the critical path) prefetched at idle — keep them lazy.
    components/
      add-albums-drawer.tsx
      album-artwork-grid.tsx
      album-detail.tsx
      album-grid.tsx
      album-list.tsx
      alphabet-sidebar.tsx # Shared useAlphabetIndex hook + AlphabetSidebar component for album-grid and album-list
      app-context.tsx    # Global state — do not refactor without discussion. albums/wants reactively derive from Convex cache subscriptions.
      auth-callback.tsx  # OAuth callback handler — processes Discogs redirect and exchanges tokens
      crate-browser.tsx
      shuffle-album-card.tsx
      dominant-color-card.tsx  # Reusable card wrapper — extracts dominant color from album artwork via canvas, sets CSS custom properties (--dc-bg, --dc-text, etc.) for children. Uses /img-proxy/ to avoid CORS canvas tainting.
      discogs-api.ts     # Types, constants, pure utilities (HTTP functions removed — see Discogs API Proxy)
      discogs-search-sheet.tsx  # "Look It Up" — standalone Discogs database search as a FULL-SCREEN panel (z-[85], no backdrop, Discogs-app style: fixed search bar at top, back arrow to dismiss — a bottom sheet put the iOS keyboard on top of the panel; do not convert it back to SlideOutPanel). Master-first results with a drill-in pressing picker; barcode-like queries route to release search; empty results auto-fall back master → release → normalized query (diacritics/dots stripped), with one silent retry on transient errors. Opened from the Search button in the mobile header and desktop top nav. Hands a chosen pressing to ReleaseDetailPanel via setSelectedFeedAlbum. Includes the camera barcode scanner (BarcodeScanner overlay, zxing-wasm EAN/UPC decode, ScanBarcode button right of the search bar — hidden when getUserMedia is unavailable; detected codes land in the search box and route to release search). Input focus happens in onAnimationComplete with focus({ preventScroll: true }) — NEVER autoFocus: focusing mid-slide makes iOS scroll the viewport to chase the off-screen input and shoves the whole app up. The bottom nav stays visible/tappable over this panel; a screen change dismisses it. The pre-search empty state is a centered intro line — 'Search the Discogs database or scan a barcode.' with the scan text tappable — plus recent queries (persisted per-user as preferences.recent_searches, capped 8, recorded when a result is tapped, Clear button empties). Loading states show 'Searching...' / 'Finding pressings...' with the sync-dot animated ellipsis. On open, the panel fires discogs.warm (a no-op action) so the first search doesn't pay the Node runtime cold start. The pressing picker header: nav row (back arrow left, Filter disclosure button right with active-count), a hero block (112px artwork, 22px Bricolage title line-clamp-2, artist, pressing count), a bottom divider; the country/year chips render only while the Filter disclosure is open. Filter-chip facet titles/values are decoded via decodeFacetValue — the versions endpoint returns URL-encoded values ('USA+%26+Canada').
      feed-screen.tsx
      filter-drawer.tsx
      folders-screen.tsx  # Folder management subview (accessed from Settings > Tools > Folders). Create, rename, delete folders. Folders 0/1 are read-only. Uses inline edit and confirmation modal patterns from stacks.tsx.
      format-spotlight.tsx  # Rotating obscure format highlights section on the home feed
      following-screen.tsx
      icons.ts           # Icon alias shim — the ONLY place @phosphor-icons/react is imported. Re-exports Phosphor icons under the legacy Lucide names (VinylRecordIcon as Disc3, CardsThreeIcon as GalleryVerticalEnd, LightningIcon as Zap, etc.). All components import icons from here. See Tech Stack for the weight system.
      install-nudge.tsx   # Dismissible PWA install nudge bottom sheet for mobile browser users. Fixed-position sheet (z-[150]) with backdrop (z-[149]). Detects standalone mode, listens for beforeinstallprompt (Android), shows instructional copy (iOS). Dismissal persisted to localStorage. Mounted from App.tsx.
      last-played-utils.ts
      motion-tokens.ts
      navigation.tsx
      no-discogs-card.tsx
      offline-banner.tsx   # Banner shown when device has no network connection; uses z-[115]
      oauth-helpers.ts   # OAuth 1.0a initiation — kicks off Discogs redirect (no signing, just calls convex/oauth.ts)
      purge-colors.ts
      purge-tracker.tsx
      purge-verdict-buttons.tsx  # Shared Keep/Maybe/Cut verdict button row — solid fill = selected verdict, tag-colored outline = unselected, icons Check/HelpCircle/StackMinus (weight bold). Used by the feed evaluator and album detail Rate for Purge; any new verdict UI must use this component, never bespoke buttons.
      loading-screen.tsx   # Four-phase loading state machine (`'idle' | 'syncing' | 'syncing_following' | 'complete'`) with UnicornScene WebGL background, Disc3 spinner, and animated ellipsis message. `syncing_following` shows "Syncing users you follow (X of Y)" during startup following feed sync. Use this for all full-screen loading states — do not create new loading screens.
      reports-screen.tsx
      share-activity-prompt.tsx  # Full-screen, non-dismissable shareActivity opt-in prompt (see Cross-User Data Pattern)
      stack-picker-sheet.tsx  # Session picker (file/identifier names keep stack* — see Sessions naming note)
      stacks.tsx         # Sessions screen (file/identifier names keep stack* — see Sessions naming note)
      settings-screen.tsx
      splash-screen.tsx
      sync-status-line.tsx  # "Synced Xm ago" / "Up to date." line under the Collection/Wantlist search row; tappable manual sync probe
      slide-out-panel.tsx  # Shared bottom-sheet wrapper with swipe-to-dismiss. Accepts children (scrollable slot), optional title/headerAction (header row), optional footer (pinned above safe area), and z-index/className overrides. Used by AlbumDetailSheet and FilterDrawer — use this for any new mobile panel or sheet. Drag handle padding: py-1.5. Close button: rgba(0,0,0,0.45) bg + backdrop-blur(6px) + white icon for contrast over artwork. Blurs the active element on mount (`document.activeElement?.blur()`) to dismiss the iOS software keyboard whenever a panel opens over an active text input. App-wide — no individual tap handlers need to handle this.
      swipe-to-delete.tsx  # Reusable swipe-to-delete gesture component for mobile list items. Currently used in stacks.tsx. Use this for any future list item deletion on mobile.
      theme.ts
      unicorn-scene.tsx  # WebGL animated background used on all pre-auth screens. Wraps Unicorn Studio SDK (UMD, v2.1.4). Scene loaded from local `/splash-screen.json` (scene ID `w7mlqmYVwPpRyrBLkt7m`). Falls back to `#01294D` if WebGL is unavailable.
      use-filtered-albums.ts  # Screen-local collection filtering/sorting hook (search lives in the screens, not context)
      use-shake.ts  # Shake-to-Random gesture hook. Detects lateral shake via DeviceMotion API (threshold: 25 m/s²), fires callback. Requires iOS DeviceMotionEvent.requestPermission() flow — toggle lives in Settings → Gestures. Preference persisted to Convex (`shake_to_random`). `App.tsx` performs a silent boot-time permission check: if `shakeToRandom` is `true` on load and `DeviceMotionEvent.requestPermission()` does not return `'granted'`, the preference is reset to `false` in Convex and a toast is shown. The check runs once per session via a `hasDonePermissionCheckRef` guard.
      wantlist.tsx
      wantlist-add-icon.tsx  # Heart + "+" badge composite icon — "add to wantlist" affordance in social/activity contexts where a plain heart reads as "favorite this post". Used by Feed and Following activity rows.
      wantlist-heart-button.tsx  # Shared wantlist add/remove button. Two variants: "overlay" (absolute-positioned on artwork cards) and "inline" (for list rows). Handles wantlist state check, add/remove confirmation SlideOutPanel, API call, Disc3 loading state, and toasts. Used in Feed Shuffle cards, Following Shuffle cards, Following grid/artwork/list views.
      wantlist-crossover-prompt.tsx  # "Now in your collection" floating prompt — shows after sync when a wantlist item is also in the collection. Mounted from BottomTabBar in navigation.tsx.
    hooks/
      use-online-status.ts  # Hook that powers OfflineBanner via navigator.onLine and online/offline events
    lib/
      scroll-state.ts    # Module-level scroll-guard state — one passive capture listener records last scroll time; powers the 250ms post-scroll tap cooldown
      use-safe-tap.ts    # Shared safe-tap helper — touch-slop (10px X+Y) + scroll cooldown + preventDefault to suppress synthetic clicks. All card tap sites use this; never hand-roll touch tap guards.
    utils/
      format.ts          # Shared formatting utilities (formatActivityDate, formatCollectionSince, getInitial, formatSyncedAgo)
      shuffle.ts         # Fisher-Yates shuffle + pickRandom — use these, never .sort(() => Math.random() - 0.5) or inline arr[Math.floor(Math.random()*arr.length)]
      collection-facts.ts  # deriveCollectionFacts — threshold-gated stat lines (top decade/artist/label, oldest pressing, latest pickup with artist) for the feed identity-block ticker
  imports/               # Logo SVG assets (splash, dark, light — the light variant has navy #0C284A letters for light backgrounds; the dark variant has white letters. Both keep the yellow record-dot with navy spindle hole)
  lib/
    condition-colors.ts  # Shared condition grade color spectrum (CONDITION_SPECTRUM map + conditionGradeColor helper). Used by album-detail (incl. the Value section), reports-screen.
  styles/
    fonts.css
    index.css
    tailwind.css
    theme.css
  main.tsx
convex/                  # Convex backend functions and schema
  authHelper.ts        # Central session-token auth guard — used by all guarded queries/mutations
  collection.ts
  schema.ts
  users.ts             # getLatestUser (public bootstrap), getMe, upsert (INTERNAL — see Authentication Architecture), updateLastSynced, updateCollectionValue, clearSession
  oauth.ts             # Public OAuth handshake — reads credentials from process.env, intentionally unauthenticated
  discogs.ts           # "use node" — server-side sync loops (syncSelf, syncFollowedUser) + Discogs API proxy actions (see Discogs API Proxy)
  discogsHelpers.ts    # getUserCredentials internalQuery — separated from discogs.ts due to "use node" constraint
  followed_items.ts    # Followed collections cache: getForUser, clearForUser/appendItems (internal)
  syncStatus.ts        # Sync progress doc: get (subscribed by client), set (internal)
  purge_tags.ts
  stacks.ts            # Sessions feature data (table named `stacks` — see Sessions naming note)
  last_played.ts
  want_priorities.ts
  following.ts
  following_feed.ts  # Following feed cache: getByFollower, upsert, deleteEntry
  wantlist.ts        # Wantlist cache: getByUsername, replaceAll, addItem, removeItem
  preferences.ts
```

---

## Design System

### Color System

#### Philosophy

Holy Grails uses **Oklab** as its color space for all color derivation and token definition. Oklab is a perceptual color space designed by Björn Ottosson and is the color space underpinning CSS Color Level 4/5. It is supported in all modern browsers (baseline since May 2023) and is now the default gradient interpolation in Photoshop.

Reference: https://bottosson.github.io/posts/oklab/

**The core principle:** equal numeric steps in Oklab produce equal perceived steps. This is not true of hex, RGB, or HSL. A `calc(l - 0.03)` step always means the same perceived lightness reduction regardless of hue. This makes it the right tool for building a consistent, predictable dark mode token hierarchy.

#### Rules

1. **Never derive new colors by arithmetic on hex values.** If you need a lighter or darker variant, use `oklab(from <color> calc(l ± X) a b)` in CSS.

2. **All new dark mode background tokens must be defined as `oklab()` relative color expressions**, not raw hex. Existing hex tokens are legacy and should be migrated during dedicated audit passes.

3. **Hardcoded hex values are only permitted for fixed brand colors** (the nav palette and CTA yellow) and for the named semantic/accent colors in the exceptions list below. Every other color in a component must reference a CSS custom property.

4. **Gradients between two non-transparent colors should use `in oklab` interpolation** to avoid hue drift:
   ```css
   background: linear-gradient(in oklab, var(--c-surface), var(--c-bg));
   ```

5. **Do not use `rgba(0,0,0,X)` or `rgba(255,255,255,X)` for surface tinting.** Use a token or an `oklab()` expression derived from the nearest surface token. Exception: image card overlays where black is needed for contrast over photography are intentional and should be left alone.

6. **The `isDarkMode ? "#EBFD00" : "#0078B4"` ternary pattern is retired.** Always use `var(--c-link)` instead.

7. **When adding a destructive action** (delete, remove, unfollow, confirm-destructive), always use `var(--c-destructive)`, `var(--c-destructive-hover)`, and `var(--c-destructive-tint)`. Never hardcode `#FF33B6`.

8. **Always preserve the `a` and `b` axes when adjusting lightness in Oklab.** Use `oklab(from <color> calc(l ± X) a b)` — do not alter `a` or `b` unless intentionally shifting hue or chroma.

#### Token Hierarchy — Dark Mode Backgrounds

Background tokens are defined in `theme.ts` using Oklab relative color expressions. The hierarchy represents perceived elevation — each layer is perceptually lighter than the one below it by a consistent step.

| Token | Expression | Role |
|---|---|---|
| `--c-bg` | `oklab(from #081A31 calc(l - 0.06) a b)` | Main app canvas — lowest elevation |
| `--c-surface-alt` | `oklab(from #0C1F35 calc(l - 0.04) a b)` | Inset/recessed surfaces, input bg |
| `--c-surface` | `#071B30` | Cards, panels, primary containers |
| `--c-surface-hover` | `oklab(from #172E4C calc(l - 0.03) a b)` | Hover state on surface elements |
| `--c-chip-bg` | `oklab(from #172E4C calc(l - 0.03) a b)` | Pill/chip backgrounds |
| `--c-input-bg` | `oklab(from #0C1F35 calc(l - 0.04) a b)` | Input field backgrounds |

(The dark surface family was deepened in v0.6.x from the original `#0C1A2E`/`#091E34`/`#1A3350` palette to the `#081A31`/`#071B30`/`#172E4C` family above. The old hexes survive in two intentional places: the mobile bottom bar gradient and the detached-component surface pattern — see those notes before "fixing" them.)

When a new background token is needed, choose a source hex that sits in the correct position in the hierarchy and apply an appropriate Oklab L step. Do not invent hex values directly.

#### Semantic Color Tokens

These tokens must be used instead of hardcoded values. See Rules above.

##### Content Area — Light Mode (default)
All content area colors use CSS custom properties defined in `theme.ts`:

| Token | Value |
|---|---|
| `--c-bg` | `#F9F9FA` |
| `--c-surface` | `#FFFFFF` |
| `--c-surface-hover` | `#EFF1F3` |
| `--c-surface-alt` | `#F9F9FA` |
| `--c-text` | `#0C284A` |
| `--c-text-secondary` | `#455B75` |
| `--c-text-tertiary` | `#617489` |
| `--c-text-muted` | `#5E6E80` |
| `--c-text-faint` | `#6E8093` |
| `--c-border` | `#D2D8DE` |
| `--c-border-strong` | `#74889C` |
| `--c-chip-bg` | `#EFF1F3` |
| `--c-input-bg` | `#F9F9FA` |
| `--c-destructive` | `#FF33B6` |
| `--c-destructive-hover` | `#E6009E` |
| `--c-destructive-tint` | `rgba(255, 51, 182, 0.12)` |
| `--c-link` | `#0078B4` |
| `--c-link-hover` | `#005F8E` |
| `--c-card-shadow` | `0 4px 20px rgba(12,40,74,0.08)` |
| `--c-sheet-shadow` | `0 -8px 32px rgba(12, 40, 74, 0.1)` |
| `--c-shadow-sm` | `0 1px 3px rgba(0, 0, 0, 0.15)` |
| `--c-shadow-modal` | `0 16px 48px rgba(12, 40, 74, 0.15)` |
| `--c-accent-cyan` | `oklab(from #00CFFF 0.52 a b)` (≈ `#0078A5`) |
| `--c-accent-pink` | `oklab(from #F276EC 0.52 a b)` (≈ `#A428A1`) |
| `--c-accent-yellow` | `#8C6800` (brass gold — oklch(0.54 0.115 86°)) |

The light-mode cyan/pink accents are the dark accents dropped to Oklab L=0.52 with hue preserved, so 11px eyebrow text clears WCAG 4.5:1 on `--c-bg`. **Yellow is the exception:** hue-preserved darkening of `#EBFD00` (h≈115°, on the green side) can only produce olive/mud, so the light yellow hue-shifts to the brass gold `#8C6800` (h≈86°) — darkened gold still reads as the yellow family; darkened yellow does not. Any new accent token must ship BOTH a dark value and a light value that passes 4.5:1 on the light background — never reuse a bright dark-mode accent directly in light mode, and never darken a green-side yellow without shifting its hue toward gold. Where yellow appears as a **fill** in light mode, prefer keeping the true `#EBFD00` edged/paired with `#8C6800` or navy (peak-decade bar, golden-era pill, CTA buttons) over substituting a darker swatch.

##### Content Area — Dark Mode
| Token | Value |
|---|---|
| `--c-bg` | `oklab(from #081A31 calc(l - 0.06) a b)` |
| `--c-surface` | `#071B30` |
| `--c-surface-hover` | `oklab(from #172E4C calc(l - 0.03) a b)` |
| `--c-surface-alt` | `oklab(from #0C1F35 calc(l - 0.04) a b)` |
| `--c-text` | `#E2E8F0` |
| `--c-text-secondary` | `#9EAFC2` |
| `--c-text-tertiary` | `#8A9BB0` |
| `--c-text-muted` | `#7D92A8` |
| `--c-text-faint` | `#6A8099` |
| `--c-border` | `#172E4C` |
| `--c-border-strong` | `#2A4762` |
| `--c-chip-bg` | `oklab(from #172E4C calc(l - 0.03) a b)` |
| `--c-input-bg` | `oklab(from #0C1F35 calc(l - 0.04) a b)` |
| `--c-destructive` | `#FF33B6` |
| `--c-destructive-hover` | `#E6009E` |
| `--c-destructive-tint` | `rgba(255, 51, 182, 0.08)` |
| `--c-link` | `#EBFD00` |
| `--c-link-hover` | `#d9e800` |
| `--c-card-shadow` | `0 4px 20px rgba(0,0,0,0.25)` |
| `--c-sheet-shadow` | `0 -8px 32px rgba(0, 0, 0, 0.3)` |
| `--c-shadow-sm` | `0 1px 3px rgba(0, 0, 0, 0.15)` |
| `--c-shadow-modal` | `0 16px 48px rgba(0, 0, 0, 0.4)` |
| `--c-accent-cyan` | `#00CFFF` |
| `--c-accent-pink` | `#F276EC` |
| `--c-accent-yellow` | `#EBFD00` |

The `--c-accent-*` tokens power the feed section eyebrows (Decade Highlight = cyan, Wantlist Spotlight = pink, Format Spotlight = yellow) and the #1 Top Artists rank / Insights golden-era callout (yellow). Use them — never raw `#EBFD00`/`#00CFFF`/`#F276EC` — for any accent-colored text sitting on themed surfaces.

#### Fixed Brand Colors — Hardcoded, Do Not Tokenize

These never change with theme and are always hardcoded where used.

| Value | Usage |
|---|---|
| `#EBFD00` | CTA buttons, logo accent, sync/action buttons, dark-mode active nav |
| `#01294D` | ThemeSwitch sidebar-variant track, UnicornScene WebGL fallback |
| `#D1D8DF` | Dark-mode inactive nav icon + label |
| `#d9e800` | CTA button hover state |
| `#0C284A` | Text on yellow CTA buttons, light-mode active nav (bottom bar, desktop top nav icon, mobile header active buttons) |

**Both navs are theme-aware.** The desktop top nav renders on a transparent header over the app gradient (no fixed `#01294D` bar anymore); its active icon is `#EBFD00` in dark mode and `#0C284A` in light mode, matching the mobile bottom nav convention — yellow does not read on a light surface. The mobile header's active Following/Settings buttons follow the same rule.

##### Yellow CTA Buttons
```tsx
// Always use this pattern for primary CTAs
className="bg-[#EBFD00] text-[#0C284A] hover:bg-[#d9e800]"
```

##### Active Filter Chips
```tsx
// Light mode
className="bg-[rgba(172,222,242,0.5)] text-[#00527A]"
// Dark mode
className="bg-[rgba(172,222,242,0.2)] text-[#ACDEF2]"
```

#### Permitted Semantic Accent Colors — Hardcoded

These are semantic colors tied to a specific meaning. Hardcoded because the hue is the meaning.

| Value | Usage |
|---|---|
| `#3E9842` | Keep purge tag, Have It icon (green) |
| `#EF5350` | Want It icon (warm red) |
| `#FFC107` | Avg. Rating icon (amber) |
| `#9A207C` | Cut purge tag — light mode |
| `#00476C` | Maybe purge tag — light mode |
| `#ACDEF2` | Active filter chips, Maybe purge tag — dark mode |
| `rgba(172,222,242,0.5)` | Active filter chip bg — light mode |
| `rgba(172,222,242,0.2)` | Active filter chip bg — dark mode |
| `#009A32` | Collection value display, positive metrics |
| `#EEFC0F` | Wantlist priority bolt icon (over artwork scrims only) |
| `#0DB1F2` | Chart third accent (reports-screen chart constants) |
| `#22C55E` | Success / confirmed state icon |
| `#FF98DA` | Cut purge tag — dark mode (also used in progress gradient) |
| `#B8C900` | Wantlist priority bolt — light mode (dark mode uses `#EBFD00`) |
| `#8C6800` | Brass gold — light-mode `--c-accent-yellow` value; also the light-mode stroke edging the `#EBFD00` peak-decade bar and the light stop of the Shuffle gradient |
| `#1DB954` | Spotify brand green — Listen On button icon only (album-detail) |
| `#FA243C` | Apple Music brand red — Listen On button icon only (album-detail) |
| `#FF2D78` | DestructiveButton confirm-tap fill (album-detail) |
| `#F276EC` / `#48FF91` / `#00CFFF` | Shuffle heading gradient stops (with `#EBFD00`) — feed-screen only, dark mode; light mode uses the same four hues via `oklab(from <hex> 0.52 a b)` |

Chart constants in `reports-screen.tsx` (`CHART_GREEN`, `CHART_PINK`, `CHART_BLUE`) are hardcoded by design — they are data visualization colors, not UI surface colors.

Condition grade colors (the pink-to-green spectrum) are defined in `src/lib/condition-colors.ts`. Always import from there — never re-declare inline.

Purge colors are defined in `purge-colors.ts`. Always import from there.

##### Condition Grade Color Spectrum
Maps vinyl condition grades to a pink-to-green spectrum (source of truth: `src/lib/condition-colors.ts`):
- **M / NM**: Green (`#3E9842` dark, `#2D7A31` light)
- **VG+**: Blue-green (`#5FBFA0` dark, `#1A7A5A` light)
- **VG**: Blue (`#ACDEF2` dark, `#00527A` light)
- **G+**: Purple (`#C9A0E0` dark, `#7A3A9A` light)
- **G**: Pink (`#E88CC4` dark, `#9A207C` light)
- **F / P**: Pink (`#FF98DA` dark, `#9A207C` light)

#### Gradients

Gradient fades to surface backgrounds must reference a CSS token — never a hardcoded hex:

```tsx
// Correct
background: "linear-gradient(to bottom, transparent, var(--c-surface))"

// Wrong — breaks on theme change
background: "linear-gradient(to bottom, transparent, #091E34)"
```

Image card overlays using `rgba(0,0,0,...)` for photo readability are intentional exceptions — do not change them.

---

### Typography

- **Display / Headings**: `Bricolage Grotesque` (weights 300–700)
- **Decorative display accents**: `Rock Salt` (Shuffle heading, Format Spotlight, Decades heading) and `Manufacturing Consent` (Insights and Purge Tracker headings on the feed) — loaded in `fonts.css`, used only for these named feed moments. Do not use them anywhere else.
- **Body / UI labels**: `DM Sans` (weights 300–700)
- Loaded via a `<link>` (with preconnect) in `index.html` — not an `@import` in CSS, so the font fetch starts before CSS parse. Only weights 400/500/600/700 are requested; weight 300 is intentionally not loaded (unused)
- Never use system fonts for headings — Bricolage Grotesque is part of the brand

---

### Motion Tokens

All animation constants live in `motion-tokens.ts`. Always import from there — never hardcode easing or duration values.

```ts
EASE_OUT: [0.25, 1, 0.5, 1]
EASE_IN_OUT: [0.76, 0, 0.24, 1]
EASE_IN: [0.5, 0, 0.75, 0]

DURATION_MICRO: 0.1      // Button press, toggles
DURATION_FAST: 0.175     // Crate flip, tab switches
DURATION_NORMAL: 0.225   // Bottom sheets, filter drawer
DURATION_SLOW: 0.3       // Lightbox out, large exits
```

Only animate `transform` and `opacity`. Never animate `width`, `height`, `top`, `left`, `margin`, or `padding`.

---

## Cross-User Data Pattern

Holy Grails surfaces one user's data to another in one place: the
Following screen HG activity section. Any future feature that does the
same must follow this pattern without exception.

**The shareActivity gate:**
Any Convex query that returns one user's data to a different authenticated
viewer must:
1. Authenticate the viewer via `authenticateUser()` first — unauthenticated
   callers get an error, not an empty result
2. Look up the target user and check `shareActivity === true`
3. Return `null` for both "user not found" and "shareActivity not true" —
   the caller must not be able to distinguish between the two cases
4. Never expose OAuth tokens, session tokens, or any field not explicitly
   listed in the return type

**Existing implementations:**
- `users.getHolyGrailsUsers` — takes `usernames[]`, returns the subset
  with `shareActivity === true`
- `lastPlayed.getPublicActivitySummary` — returns play data for a target
  user, or `null` if not found or not opted in

**Opt-in prompt:**
`ShareActivityPrompt` renders full-screen for any authenticated user with
`shareActivity === undefined` — this covers both new users and existing
users who predate the field. It is not dismissable. `showSharePrompt` is
derived reactively in `app-context.tsx` and clears automatically once
`setShareActivity` resolves in Convex.

---

## Cross-Cutting Patterns

### Touch Handling on Interactive Cards

All interactive card and row elements must include `touchAction: "manipulation"` in their inline style. This eliminates the 300ms double-tap delay and lets the browser handle vertical pan natively. Cards with explicit `onTouchStart`/`onTouchMove`/`onTouchEnd` handlers must use a Y-axis-only threshold of 10px in `onTouchMove` — check `clientY` delta only, never `clientX`. X-axis movement during a vertical scroll is noise and must not suppress a tap. Any new card type added to the app must follow both rules.

### iOS Safari Text Truncation
Never use Tailwind's `truncate` class on album-facing text. Always use inline styles:

```tsx
style={{
  display: "block",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  WebkitTextOverflow: "ellipsis",
  maxWidth: "100%",
}}
```

`line-clamp-1` / `line-clamp-2` is fine for multi-line clamping (grid card titles, session names).

### Disc3 Spinner
All loading states use `Disc3` (Phosphor's `VinylRecord`, aliased in `icons.ts`) with the `disc-spinner` CSS class. This spins at 33 1/3 RPM (1.8s per revolution). Never use a generic spinner component.

```tsx
import { Disc3 } from "./icons"
<Disc3 className="disc-spinner" />
```

### CSS Variables on Detached Components
The session picker and other components that render outside the main `<main>` element must apply CSS variables inline on their container — they don't inherit from the main cascade.

**Detached-component surface color pattern:** The following components use `isDarkMode ? "#091E34" : "#FFFFFF"` for their background color rather than `var(--c-surface)`. This is intentional — these components render in a context where CSS custom properties from the root are not inherited (detached from the main DOM tree or rendered via portals):

- slide-out-panel.tsx
- add-albums-drawer.tsx
- stack-picker-sheet.tsx
- album-detail.tsx (two instances)
- wantlist-crossover-prompt.tsx
- purge-tracker.tsx
- loading-screen.tsx

`#091E34` (dark) and `#FFFFFF` (light) are the correct surface values for detached components. Do not change these to `var(--c-surface)` without first verifying CSS variable inheritance in that rendering context.

### App-Level CSS Custom Properties

- `--app-bg` — set dynamically in App.tsx as the scroll-fade gradient base color. Dark: `#081A31`, Light: `#ACDEF2`. Used for the top-of-screen scroll fade overlay. (The app root also paints a radial gradient — dark: `#091C33` → `#030C1C`, light: `#FFF` → `#ACDEF2` — and syncs the `<html>` background to `#030C1C`/`#F9F9FA`; these are the true outermost canvas colors.)
- `--nav-clearance` — `calc(84px + env(safe-area-inset-bottom, 0px))` — bottom padding calc used across 16+ screen components to clear the fixed navigation bar. Set in App.tsx or navigation.tsx.
- `--slide-panel-footer-pb` — `84px` (mobile) / `16px` (desktop) — bottom padding for pinned sheet footers.
- WantlistCrossoverPrompt bottom offset: `calc(72px + env(safe-area-inset-bottom, 0px))`
- Scroll fade overlay height: `calc(128px + env(safe-area-inset-bottom, 0px))`

### CSS Utility Classes (theme.css)

- `overlay-scroll` — enables momentum scrolling and overflow behavior for scrollable containers. Used across 6+ screen components.
- `tappable` — applies press-state feedback styling for interactive elements.

### Sonner Toast Theming

`theme.css` contains an extensive custom Sonner toast palette (lines ~215–276). This is intentional and should not be removed or overridden.

### Safe Area Insets
All bottom sheets and floating elements must account for iOS safe areas:

```tsx
paddingBottom: "env(safe-area-inset-bottom, 16px)"
```

The bottom tab bar floats 12px from the bottom with 10px side margins. Inner scrollable content in bottom sheets needs `paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 120px)` to scroll fully above it.

### Full-Screen Viewport Height (iOS Safari)

Never use Tailwind's `h-screen` (which maps to `100vh`) for full-screen layouts like splash screens or loading screens. On iOS Safari, `100vh` includes the area behind the browser chrome, causing unwanted vertical scroll. Use `100dvh` (dynamic viewport height) instead:

```tsx
style={{ height: "100dvh" }}
```

`100dvh` adjusts to the actual visible area as the browser chrome shows/hides. Supported in all modern browsers (baseline late 2022).

**Standalone PWA exception (the app root).** `100dvh` is correct in a browser tab, but in an installed (standalone) iOS PWA it resolves *shorter* than the physical screen — it excludes the home-indicator strip. Because the app root is `overflow: hidden`, the fixed bottom nav then anchors to the root's box and `bottom: 0` lands above the strip, floating the nav above the home indicator. The app root therefore uses the `.app-viewport` class (theme.css), not an inline height:

```css
.app-viewport { height: 100dvh; }                 /* browser: clears chrome */
@media all and (display-mode: standalone) {
  .app-viewport { height: 100vh; }                /* installed PWA: fills the true screen */
}
```

Do not move the app-root height back to an inline `100dvh` — that reintroduces the floating-nav bug in the installed PWA. Splash/loading screens keep plain `100dvh` (they have no fixed bottom nav, so the standalone quirk doesn't surface).

### Input Font Size (iOS Auto-Zoom Prevention)
All `<input>` elements must have `font-size: 16px` minimum. iOS Safari auto-zooms on inputs smaller than 16px. This is a hard rule.

### Album Detail Edit Mode
The album detail panel (`album-detail.tsx`) has an inline edit mode for `mediaCondition`, `sleeveCondition`, `notes`, and `folder`. Key patterns:
- Edit mode is entered via a `Pencil` (16px) icon button. On mobile, the edit button sits in the "YOUR COPY" card header row (right-aligned). On desktop (`hideHeader=false`) it sits beside the X close button in the panel header.
- Edit mode is not accessible while `isSyncing` — the button is hidden during sync.
- `isEditMode` state resets whenever `selectedAlbum` changes.
- On Save: Convex proxy actions first (`proxyUpdateCollectionInstance` / `proxyMoveToFolder`), then local state + Convex cache update via `updateAlbum` from context. On failure: error toast, stay in edit mode so the user can retry. Never trigger a full re-sync.
- Folder moves use the two-step Discogs API process: add to new folder → delete from old folder. The new `instance_id` returned by the add call must be stored in local state and Convex.
- `updateAlbum(albumId, fields)` in `app-context.tsx` updates local albums state and fires `collection.updateInstance` Convex mutation. Pattern mirrors `setPurgeTag`.
- Condition grades for the dropdowns: use `CONDITION_GRADES` exported from `discogs-api.ts` — do not hardcode them.
- Custom field ID resolution for the Discogs update happens inside `proxyUpdateCollectionInstance` — it fetches the user's field definitions server-side to map field names to IDs.
- All `<select>` elements in edit mode use `appearance: none` with a custom SVG chevron background image. Arrow color switches by theme (`#AAAAAA` dark, `#333333` light). `paddingRight: 36px` prevents text overlap with the arrow. This ensures consistent select styling on iOS Safari where native select arrows do not respect dark mode.

### Album Detail Enriched Metadata
The album detail panel lazy-loads enriched metadata from the Discogs `/releases/{release_id}` endpoint via `proxyFetchRelease`. Key patterns:
- **In-memory cache**: A module-level `Map<number, ReleaseData>` persists across panel open/close within the same session. No Convex persistence — this is session-scoped enrichment data.
- **Stale guard**: The `useEffect` fetch uses a `let stale = false` + cleanup return pattern to prevent state updates after the component unmounts or the album changes.
- **Hook ordering**: All hooks (`useState`, `useEffect`, `useCallback`, `useMemo`, `useAction`) must be called unconditionally before the two early returns (want item guard and null album guard). Moving hooks below early returns causes "Rendered fewer hooks than expected" errors.
- **ReleaseData shape**: `{ country, notes, tracklist, credits, community, identifiers, genres, styles, lowestPrice, numForSale }`. `lowestPrice`/`numForSale` power the Value section (see below).
- **Mobile hero image**: On mobile (`hideHeader === true`), the panel renders a padded square cover image (`px-4 pt-3`, `rounded-[12px]`, `aspect-square`, `1px solid var(--c-border-strong)`) with a gradient scrim overlay (`linear-gradient(to top, rgba(0,0,0,0.82), transparent)`) covering the bottom 55%. Album title (22px, Bricolage Grotesque 700, white) and artist · year (15px, weight 500, white 80%) float as text on the gradient. Desktop side panel layout is unchanged.
- **Thumbnail carousel**: `mt-3` spacing below the hero image.
- **Purge tag**: Renders in its own `px-4 pb-2` row below the carousel (left-aligned), only when present and not in edit mode. No longer part of the title block.
- **"Your Copy" card header**: On mobile, the metadata card has a "YOUR COPY" section label (16px, fontWeight 600, `var(--c-text)`) matching other section heading styles, with the edit pencil button right-aligned in the header row.
- **Panel section order**: Hero → Thumbnail carousel → Purge tag → Your Copy (with section header, Format, Label, Catalog #, Year, Country, Folder, Media, Sleeve, Paid, custom fields) → User Notes → Mark as Played → Enriched Tabs (mobile) or accordion sections (desktop) → Community (compact row) → Sessions → Rate for Purge. (`AlbumDetailPanel` has no Value section — that lives only in `ReleaseDetailPanel`; see below.)
- **Enriched content tabs (mobile)**: On mobile, Tracklist, Credits, Pressing Notes, and Identifiers render as a sticky horizontal tab bar instead of accordion sections. Tabs with no data are hidden after the enriched fetch resolves. During loading, all four tabs show at `opacity: 0.4` with a skeleton below. Active tab uses `2px solid #EBFD00` underline indicator. Tab bar uses `position: sticky; top: 0; z-index: 10` with a background matching the sheet's hardcoded background (`isDarkMode ? "#132B44" : "#FFFFFF"`). An IntersectionObserver sentinel pattern applies `paddingTop: 48px` only when the tab bar is stuck, clearing the close button. `tabBarStuck` state resets on album change. On desktop, the original accordion sections remain.
- **Section component props**: `hideTitle` prop added to `TracklistSection`, `CreditsSection`, `PressingNotesSection` — suppresses section headings when rendered inside tab content on mobile. `hideToggle` prop added to `TracklistSection` — shows full tracklist without Show More truncation on mobile tabs.
- **Inner scroll container**: The `div.flex-1.overflow-y-auto` inside `AlbumDetailPanel` conditionally applies `overflow-y-auto` only on desktop (`hideHeader === false`). On mobile, `overflow-y` is removed so `position: sticky` resolves against `scrollRef` in `SlideOutPanel`.
- **Two distinct notes**: User personal notes (from collection sync) stay in Your Copy. Discogs pressing/matrix notes (from enriched data) go in the collapsible Pressing Notes section (or Pressing Notes tab on mobile). Never merge these.
- **Wantlist button**: Intentionally removed from collection album detail view. The underlying `WantlistHeartButton` logic remains for wantlist item detail.
- **Skeleton loading**: `EnrichedSkeleton` component with `animate-pulse` bars shows while release data loads.
- **Image lightbox (`ImageLightbox`)**: shared by all three detail panels, rendered via `createPortal` to `document.body`. The portal is load-bearing: the panels live inside transform-animated containers (bottom sheet / side panel), which trap `position: fixed` and z-index inside the sheet's stacking context — without the portal, the sheet's floating close button (`sheetZIndex + 1`) sits on top of the lightbox's close button and tapping X closes the whole detail card. Do not inline the lightbox back into the panels.
- **Sheet open gate (`App.tsx`):** The desktop side panel and mobile sheet open condition checks `selectedAlbum || selectedWantItem || selectedFeedAlbum`. Any new panel type added to `AlbumDetailPanel` routing must also be added to this gate or the sheet will silently refuse to open.
- **DestructiveButton** — shared two-tap confirm button component, local to `album-detail.tsx`. Props: `label`, `confirming`, `loading`, `onClick`, `variant?: "destructive" | "neutral"` (default: `"destructive"`). Destructive variant: outlined white text (first tap) → solid `#FF2D78` fill (confirm tap) → `Disc3` spinner while async in flight. Neutral variant: `var(--c-surface)` bg + `var(--c-border-strong)` border + `var(--c-text)` color in all states, no pink. Used by `WantItemDetailPanel`, `AlbumDetailPanel` (remove from collection) with `destructive`; `ReleaseDetailPanel` (remove from wantlist) with `neutral`.

`ReleaseDetailPanel` — detail panel for non-collection albums (feed/following, and pressings chosen in "Look It Up"). Takes a `FeedAlbum` prop. Loads enriched data via `proxyFetchRelease`. Shows hero image, thumbnail carousel, enriched tabs, community stats, the **Value section**, and action buttons. Does not include Mark as Played, Purge, Edit, or session picker. Action buttons ("Add to Collection", "Add to Wantlist", "Remove from Wantlist") render side by side in one row (`flex gap-2`, each `flex-1 min-w-0`) and use neutral surface style — `var(--c-surface)` bg, `var(--c-border-strong)` border, `var(--c-text)` color. Add buttons carry leading icons: `GalleryVerticalEnd` (collection) and `Heart` (wantlist), 16px. "View Your Copy" (shown when already in collection) retains its green surface style with the `GalleryVerticalEnd` icon. "Remove from Wantlist" uses `DestructiveButton` with `variant="neutral"` (no icon).

**Value section (`ReleaseDetailPanel` only)** — the record-store price lookup. A prior full market-value attempt was abandoned as inaccurate/over-complicated; this is the deliberately minimal replacement. Presentation rules are load-bearing, not cosmetic:
- **Unofficial releases show no Value section at all.** `proxyFetchRelease` returns `isUnofficial` (any format description equals "Unofficial Release"); when true, `ReleaseDetailPanel` skips the section entirely and never calls `proxyFetchMarketData`. Discogs bans selling bootlegs, so its price suggestions for them have no sales history behind them — showing them is made-up pricing. Accurate or nothing.
- **Tier 1, always** (official releases): `Lowest ask {price} · {N} for sale` from `proxyFetchRelease`'s `lowestPrice`/`numForSale`. Labeled "ask," never "value." Zero listings → `No copies for sale`.
- **Tier 2, when available**: suggested prices for **VG, VG+, NM only** (not all eight grades) from `proxyFetchMarketData`, rounded to whole units with a `~` prefix, colored via `conditionGradeColor`, laid out as a full-width 3-column grid, with the microcopy `Suggested prices from Discogs sales history.` (these are Discogs' condition-adjusted price suggestions — the same numbers Discogs shows sellers — NOT the sold-history low/median/high, which the public API does not expose) `null` (no seller settings, or sparse data) → Tier 1 only, silently. No error/empty states, no nag.
- Session-scoped `marketDataCache` (module-level `Map`), mirroring `releaseDataCache`.
- **"N for sale" is plain text — NOT a link.** Outbound Discogs listing links were removed after every redirect strategy failed (see below). Reach to `AlbumDetailPanel`/`WantItemDetailPanel` is a deliberate future decision, not shipped.

**Outbound Discogs links: DO NOT ADD THEM.** Every strategy for linking to `discogs.com` from the installed iOS PWA has been tried and failed — the Discogs app's Universal Link intercepts the navigation and strands the user on its home screen. Attempt 1: raw href (bounced). Attempt 2: same-origin `go.html` with a client-side `location.replace()` (the in-app browser treats JS redirects as fresh navigations — bounced, and stranded a blank overlay). Attempt 3: `/api/go` Vercel function issuing a server-side HTTP 302 (in-app browser still app-switched — bounced). All redirector code has been deleted. The rule is now absolute: no `discogs.com` hrefs anywhere in the app, no exceptions, until Discogs fixes its deep-link handling. Marketplace data shown in-app (Value section) is the substitute.

Session picker entry points: Bookmark buttons have been removed from all card views (Grid, Artwork, List, Swiper), and the `Music` icon button went away with the feed's Recommended card. The session picker is now accessed solely via the inline Save for Later accordion in `album-detail.tsx` (a deliberate narrowing — do not add card-level session buttons back without instruction).

### Search/Filter Row

Standard row order (Collection, Wantlist, followed user profile):
[Search bar — flex: 1] [Large grid toggle] [List toggle] [Filter button]

Removed toggles: compact 3-column grid (Grid3x3) and swiper/disk (Disc3).
These view modes no longer exist. VIEW_MODES and WANT_VIEW_MODES are
reduced to `grid` and `list` only. A useEffect guard resets any stored
`crate` or `artwork` view mode to `grid` on mount.

Followed user profile (FollowedUserProfile in following-screen.tsx):
Same row minus filter button — filter button is present but filter
system is not yet fully wired. Do not remove the button.

### Year Display Convention

Discogs returns `0` for year when a pressing has no release date. Always guard year rendering with a `hasYear` check — do not render year anywhere in the UI when the value is `0`, `null`, or `undefined`.

Define locally in each file that needs it:

```ts
const hasYear = (year: number | null | undefined): year is number =>
  year != null && year !== 0;
```

In card grid contexts, use `visibility: hasYear(year) ? "visible" : "hidden"` on the year span (not conditional removal) to preserve card height consistency. In detail panel `DetailRow` elements, use conditional removal (`{hasYear(year) && <DetailRow ... />}`).

### Image Sizing Convention
Two fields on every `Album`, `WantItem`, and `FeedAlbum` object:
- `thumb` — 150x150px — use for small display contexts (list rows, artwork grid, session thumbnails, feed compact cards, drawer thumbnails)
- `cover` — 500x500px — use for large/focal displays (detail panels, shuffle cards, grid cards)

Never use `cover` in contexts smaller than ~200px — always prefer `thumb || cover` for thumbnails. Loading a 500px image into a 40px element wastes bandwidth.

### master_id Matching
`master_id` is stored on `Album`, `WantItem`, and `FeedAlbum` objects. "In Collection" and heart filled state check both `release_id` and `master_id` to match across different pressings of the same recording. `master_id` of 0 means no master exists — skip matching on 0. The `isInWants` and `isInCollection` context helpers accept an optional `masterId` parameter. Feed and Following screens build `ownMasterIds` / `wantMasterIds` Sets for O(1) lookups.

### Following Feed Cache
The `following_feed` Convex table caches the 50 most recent albums per followed user (up to 25 users, most recently followed first). 24h TTL per user — bypassed when cached data lacks `master_id` (one-time migration). Powers Feed Recent Activity, the feed Shuffle section, and the Following screen's From the Depths section without requiring Following screen hydration. Avatar URLs for followed users are stored in the `following` Convex table and exposed via the `followingAvatars` map in context.

**Manual sync (Sync Now)** bypasses the 24h TTL on the following feed — `syncFollowingFeed()` accepts a `forceRefresh` parameter that skips the cache freshness check. `syncFromDiscogs()` (the manual trigger) always passes `forceRefresh: true`. Startup sync uses the default (`false`) and respects the 24h cache.

### Followed Collections (followed_items)
Followed users' full collections/wantlists persist in the `followed_items` Convex table (slim rows, vinyl-only), written server-side by `discogs.syncFollowedUser`. The Following screen reads them per-profile via `followed_items.getForUser` (one subscription returning collection, wants, `syncedAt`, `isPrivate`). Profiles render instantly from cache; a background sync fires when a profile opens stale (24h TTL, once per user per session) or right after a new follow. Following someone is instant — one profile lookup registers the follow; there is no blocking collection fetch. Rows are cleaned up on unfollow, clear-all, and account wipe. Do not reintroduce client-side hydration loops that fetch followed collections from Discogs on screen open.

### Wantlist Caching
The wantlist is cached in the `wantlist` Convex table with the same 24h TTL as the collection. `convex/wantlist.ts` handles persistence (`getByUsername`, `replaceAll`, `addItem`, `removeItem`). Wantlist write operations (add/remove) update both local state and the Convex wantlist cache on success.

### Home Feed (feed-screen.tsx)

**Section order:** Identity block, Shuffle, Recently Added, Following Activity, Purge Tracker, Format Spotlight, On the Hunt, Decades, Insights. On desktop, Purge Tracker and Insights render together in a 2-column grid at the Purge Tracker slot (position 4) — the pairing is a deliberate desktop layout, so desktop has no standalone Insights end-cap. The three collection-random sections (Shuffle, Format Spotlight, Decades) are deliberately interleaved with other content — do not stack them adjacent.

**Recommended section removed (v0.6.x):** The time-of-day-weighted "Give this one a spin." hero was cut — it read as redundant with Shuffle. Its `getTimeBucket`/mood-folder scoring code was deleted with it; do not resurrect it. The feed-header transparency behavior it introduced remains: the mobile feed header is transparent at scroll position 0 on the home feed and transitions to opaque on scroll, scoped via a prop on the header component (`onHeroVisibility` keys off scroll position, not any hero section). The identity block sits flush under the transparent header.

**Identity block (above the fold):** The scripted time-of-day greeting pool was removed — real data carries the personality instead. A full-width band (no card container) built from rows separated by `1px solid var(--c-border)` hairlines, rendered by `identityBlock(variant)` with `"mobile"` and `"desktop"` arrangements. Mobile stacks three rows flush under the transparent header (wrapper clearance `calc(safe-area-inset-top + 58px)` — the band's own top hairline reads as the header's bottom edge): (1) avatar (44px, initial fallback) + username (22px Bricolage, `flex-1` + `min-width: 0`, truncates with ellipsis so it never collides with the sync control) + a right-aligned **SYNC control** — `RefreshCw` icon (Phosphor `ArrowsClockwise`, `weight="bold"`) beside uppercase "SYNC" (13px, weight 700, letter-spacing 0.1em) in `var(--c-link)`, with "Synced {2h ago}" (`formatSyncedAgo`, 12px muted) beneath; while syncing it becomes a Disc3 spinner + "SYNCING" and disables. Calls `syncFromDiscogs` with the Settings-style success/error toasts. (2) A stats grid — equal columns with vertical hairline dividers, ordered In Collection · Med. Value (`#009A32`, hidden when no cached collection value) · In Wantlist; values 22px Bricolage over 10px uppercase letterspaced labels; **each stat is a tappable shortcut** (In Collection → crate, Med. Value → reports, In Wantlist → wants). (3) The collection facts ticker on a subtle lifted strip (dark: `oklab(from #0C1A2E calc(l + 0.03) a b)`, light: `oklab(from #F9F9FA calc(l - 0.025) a b)`; hard edge clip, no fade mask). `deriveCollectionFacts` returns structured `{ label, value }` pairs rendered as an eyebrow label (10px uppercase, `var(--c-text-faint)`) beside its value (13px weight 600, `var(--c-text)`); seamless two-copy loop via the `.feed-ticker` keyframe in fonts.css — the track is `display:flex; width:max-content` and each item `flex-shrink:0; white-space:nowrap`, or iOS Safari stacks the text vertically; falls back to a single centered `pickRandom` fact under `prefers-reduced-motion` or when fewer than 2 facts. "Collecting since" was removed with the container redesign. Desktop composes the same pieces as one header strip (avatar 48px, username 26px, inline stat cells, sync control right) with the ticker strip underneath. Zero additional API calls — all fields come from context/cache.

**Format Spotlight:** Rotates the featured format on every app load. Filters the user's collection data for obscure vinyl format descriptions (7-Inch, 12-Inch, Limited Edition, Picture Disc, Colored, Etched, 45 RPM, Mono, etc.). Headers are the plain format name ("45 RPMs", "Limited Editions") under the FORMAT SPOTLIGHT eyebrow — no "Your …" / "… in Your Collection" fluff. Requires a minimum of 3 matching albums per category to be eligible for display. Operates entirely on cached Convex collection data — zero additional API calls.

**Following Activity:** In-card Collection/Wantlist tabs over a followed-users feed (built by `buildFeedActivity`/`buildFeedWantActivity`, up to 10 rows each). Shows 5 rows collapsed with a "Show more"/"Show less" toggle (ChevronDown, rotates) that reveals the rest inline; the "See all" header link still routes to the full Following screen. Expansion resets on tab switch.

**On the Hunt:** Wantlist showcase — horizontal scroll on mobile (145px cards), 6-col grid on desktop. Shows priority bolt icons on prioritized items. "See All" navigates to wantlist screen. Tapping a card opens `WantItemDetailPanel`. Shuffled on mount with priority items weighted 2x, deduped, max 6 items.

**Decades:** Random eligible decade spotlight (requires 5+ albums in the decade). Header is a plain "The {decade}" (Rock Salt) under a DECADE HIGHLIGHT eyebrow — the old scripted flavor subtitles were removed. Uses `ShuffleAlbumCard` with `dominantColor` for artwork-driven card backgrounds.

**Shuffle** (this is the home-feed section; the Following screen has a sibling section over followed users' collections that keeps the older **From the Depths** name — the two are deliberately named differently, so don't unify them)**:** Leads the feed directly under the identity block — it reshuffles on every load, so it carries the "why did I open the app" slot. Introduced by the gradient "Shuffle" heading (Rock Salt 30px, pink→yellow→green→cyan) with, on the right, a Square/Grid2x2 pill (screen-local toggle between one album and the 4/9 grid) and a yellow refresh button (`reshuffle` — re-picks the 10-album pool). Cards animate in with a staggered fade/rise (80ms, EASE_OUT, keyed on a shuffle counter; honors prefers-reduced-motion). 2x2 grid on mobile, 3x3 grid on desktop; single mode shows one full-width (mobile non-compact) card. Uses `ShuffleAlbumCard` (`shuffle-album-card.tsx`) with `compact` and `dominantColor` props — compact shows only title, artist, and date (no year/label/folder meta line).

**Dominant color cards:** `DominantColorCard` (`dominant-color-card.tsx`) extracts the dominant color from album artwork via canvas sampling and uses it as the card background. Text contrast (light/dark) is determined by WCAG 2.1 relative luminance. Images are proxied through `/img-proxy/` (Vite dev proxy + Vercel rewrite) to avoid CORS canvas tainting. The component sets CSS custom properties (`--dc-bg`, `--dc-text`, `--dc-text-secondary`, `--dc-text-muted`) for children to consume. `ShuffleAlbumCard` supports a `dominantColor` boolean prop that wraps the card in `DominantColorCard` and switches text colors to `--dc-*` vars with `--c-*` fallbacks. A `compact` boolean prop reduces font sizes and hides the year/label/folder meta line.

### Following Screen (following-screen.tsx)
- **Avatar size**: 80px (with 28px fallback initials). Button container width: 92px.
- **Avatar row sort order**: Sorted by most recent `followingFeed` entry per user (descending). Users with no feed entries fall to end, tiebroken alphabetically. Sort is derived via `useMemo` and applied only to the avatar row display order — does not affect the main user list.
- **From the Depths**: A horizontal-scroll peek into followed users' collections, built from the `following_feed` cache (seeded per user + 12h time bucket, up to 4 cards each). This section keeps the **From the Depths** name — the home feed's equivalent collection-random section is called **Shuffle**, but the followed-users version deliberately does not. Uses the shared `ShuffleAlbumCard` (the component name is generic; it does not imply the section name).

### Reports & Insights (reports-screen.tsx)

**Sections** (uses recharts library):
1. **Stat line**: Compact plain text below the "Insights" heading — "{N} collected · {N} on wantlist". DM Sans 13px, font-weight 500, var(--c-text-muted). No card, no border.
2. **Collection Value**: Hero median value in green, min/max range.
3. **Condition**: Standalone card with color-coded horizontal bar chart per condition grade and "X% of your collection is NM or better" green pill callout. Uses conditionGradeColor spectrum. Not part of the Breakdown card.
4. **Breakdown**: Tabbed card with three tabs:
   - *By Folder*: Two-column ranked list (folder name + count, divider rows, no bars, no cap — all folders shown)
   - *By Decade*: recharts BarChart. Filters albums with year < 1900. Peak decade bar rendered in #EBFD00. Yellow pill callout below: "{decade} is your most collected decade" with faint yellow background (rgba(235,253,0,0.08)), border (rgba(235,253,0,0.2)). Hidden if fewer than 3 distinct decades.
   - *By Format*: 2×2 stat grid of format types (LP, 12", 7", Box Set etc.). Format strings are normalized: split on comma and semicolon, strip "Vinyl", "Album", "All Media", "Reissue", "Compilation", "Stereo", "Mono", "Promo", "Limited Edition", "Deluxe Edition", "Remaster", "Special Edition", "Club Edition", "Transcription", "Unofficial Release", "White Label", "Record Store Day".
5. **Top Artists**: Ranked list (#1–#10). Filters to artists with 2+ albums. Hidden if fewer than 3 qualify. Excludes "Various", "Various Artists", "Unknown Artist", "Unknown". #1 rank in #EBFD00, #2–3 in var(--c-text-muted), #4+ in var(--c-text-faint). Disambig suffixes (e.g. " (2)") stripped before grouping.
6. **Top Labels**: Lollipop chart (thin stem + dot). Filters to labels with 2+ albums, cap 10. Hidden if fewer than 3 qualify. Dot color: CHART_BLUE (#0DB1F2).
7. **Listening Activity**: Stats grid (played this month in green Keep styling, days since last played, no plays recorded count), "No Spins on File" neglected album list, "Recently Played" list (max 5, hidden entirely if no plays logged).
8. **Purge Progress**: Donut ring, 2×2 stat grid (Keep/Cut/Maybe/Unrated).

**Minimum data thresholds** (sections render null if not met — no empty states):
- Top Artists: 3+ artists with 2+ albums
- Top Labels: 3+ labels with 2+ albums
- By Decade golden era callout: 3+ distinct decades
- By Format tab: 2+ distinct format types

### Convex View Mode Fields

`view_mode` and `want_view_mode` are stored as `v.optional(v.string())` — not string enums. Adding new view mode values (e.g. `"grid3"`) requires no schema change and no `npx convex deploy`.

---

## Navigation Structure

### Mobile (< 1024px)
Mobile bottom tab bar is fixed flush to the bottom edge (not a floating pill).

- `left: 0`, `right: 0`, `bottom: 0`, `border-radius: 0`
- Height: `calc(54px + env(safe-area-inset-bottom, 0px))`
- `paddingBottom: env(safe-area-inset-bottom, 0px)` applied internally
- **Theme-aware surface** (reads `isDarkMode`):
  - Dark: background `linear-gradient(to bottom in oklab, #0F2238, #0C1A2E)` (legacy dark surface hexes retained deliberately for the bar — they blend with the deepened v0.6.x background family), top border `rgba(172,222,242,0.08)`, active `#EBFD00`, inactive `#D1D8DF`
  - Light: background `linear-gradient(to bottom in oklab, #FFFFFF, #F9F9FA)`, top border `#D2D8DE`, active `#0C284A` (navy, matching desktop nav — yellow does not read on a light bar), inactive `rgba(12,40,74,0.65)`
- The nav itself needs no PWA-standalone override — it stays flush via the app-root height fix (see the `.app-viewport` note under "Full-Screen Viewport Height"). The `.bottom-tab-bar` class on the `<nav>` is a styling hook with no rules attached; keeping the nav flush is the app root's job, not the nav's.

5 items:

| Order | Label | Icon | Screen |
|---|---|---|---|
| 1 | Feed | Newspaper | `feed` |
| 2 | Collection | GalleryVerticalEnd | `crate` |
| 3 | Wantlist | Heart | `wants` |
| 4 | Sessions | Music | `stacks` |
| 5 | Insights | BarChart3 | `reports` |

**Purge is not in the mobile bottom bar** — Purge is accessed from the Feed screen card, Settings quick-access card, and Album Detail.

### MobileHeader Variants

MobileHeader is context-aware and renders one of five variants based on
`screen` and `followedUserProfile` from AppContext.

**Variant A — Feed**
PillLogo (h-32px) left. Users icon + avatar right.
Wordmark is the only screen where the logo appears in the header.

**Variant B — Standard screens (Collection, Wantlist, Insights, Settings)**
Screen title `<h1>` left (Bricolage Grotesque 700, 28px, truncating).
Users icon + avatar right.

**Variant C — Sessions**
Screen title left. Yellow Plus button (w-8 h-8 rounded-full bg-[#EBFD00]) +
users icon + avatar right. Plus button calls `onNewStack` from context.

**Variant D — Following (no profile open)**
Screen title left. Yellow UserPlus button + users icon + avatar right.
UserPlus button calls `onAddFollowedUser` from context.

**Variant E — Following (profile open, followedUserProfile !== null)**
Back arrow + user avatar + @username (truncating) left.
Muted UserMinus button (var(--c-text-muted), NOT destructive red) right.
Back calls `onBackFromProfile`. Unfollow calls `onUnfollowUser` (triggers
existing confirmation modal — does not unfollow directly).

The shared right-side button group (`navButtons`, used by Variants A–D)
leads with the sync chip (when syncing — it sits at the far left of the
group so it never splits the button cluster; on the Feed screen it is
suppressed during collection syncs since the identity block's SYNC
control already shows that state, but still appears there for
following-feed syncs), then a **Search button** that opens the "Look It
Up" sheet via `setShowDiscogsSearch(true)` — present on every screen
except the Following profile sub-view, so the record-store lookup is one
tap from a cold open. Then the Users icon and avatar.

Title truncation on all variants: `white-space: nowrap`,
`overflow: hidden`, `text-overflow: ellipsis`, `min-width: 0`,
`flex: 1` on title wrapper. Right button group is `flex-shrink: 0`.

SCREEN_TITLES map lives in `navigation.tsx`. Feed is intentionally omitted.
Per-screen internal title bars have been removed from all screens —
do not re-add them.

### Desktop (>= 1024px)
Horizontal top nav with 9 items split left/center/right. Logo centered. Both groups are `flex-1`.

**Left group:** Feed > Collection > Wantlist > Sessions
**Right group:** Look It Up (Search) > Following > Purge > Insights > Settings > theme toggle

Collection uses `GalleryVerticalEnd` icon (was `Library`; since the Phosphor migration this alias renders `CardsThree` — records standing in a crate). Insights uses `BarChart3` (Phosphor `ChartBar`). Active state: `#EBFD00` icon + translucent background highlight; active nav items use `weight="fill"`, inactive use `weight="light"`.

---

## Z-Index Hierarchy

| Layer | Z-Index | Component |
|---|---|---|
| Confirm-removal dialog | `z-[200]` | following-screen.tsx |
| Install nudge sheet | `z-[150]` | install-nudge.tsx |
| Install nudge backdrop | `z-[149]` | install-nudge.tsx |
| Lightbox overlay | `z-[140]` | album-detail.tsx |
| Lightbox backdrop | `z-[135]` | album-detail.tsx |
| Mobile bottom tab bar | `z-[130]` | navigation.tsx |
| Wantlist crossover prompt | `z-[125]` | wantlist-crossover-prompt.tsx |
| Album detail mobile sheet | `z-[120]` | album-detail.tsx |
| Offline banner | `z-[115]` | offline-banner.tsx |
| Album detail mobile backdrop | `z-[110]` | album-detail.tsx |
| Desktop side panel | `z-[110]` | App.tsx |
| New session / Add user FABs (mobile) | `z-[105]` | stacks.tsx, following-screen.tsx |
| Scroll fade overlay | `z-100` | App.tsx |
| Delete confirmation modals | `z-[90]` | stacks.tsx |
| Purge tracker sheet | `z-[89]` | purge-tracker.tsx |
| Purge tracker backdrop | `z-[88]` | purge-tracker.tsx |
| Session picker mobile sheet | `z-[85]` | stack-picker-sheet.tsx |
| Session picker mobile backdrop | `z-[80]` | stack-picker-sheet.tsx |
| Add Albums drawer sheet | `z-[85]` | add-albums-drawer.tsx |
| Add Albums drawer backdrop | `z-[80]` | add-albums-drawer.tsx |
| Look It Up search panel (full-screen, no backdrop) | `z-[85]` | discogs-search-sheet.tsx |
| Filter drawer panel | `z-[70]` | filter-drawer.tsx |
| Filter drawer backdrop | `z-[60]` | filter-drawer.tsx |
| Desktop session picker | `z-50` | stack-picker-sheet.tsx |
| Mobile feed header (transparent at feed top) | `zIndex: 50` | App.tsx |
| Alphabet index sidebar | `z-40` | album-grid.tsx, album-list.tsx |
| Wantlist card close button | `z-[2]` | wantlist.tsx |
| Wantlist card hover overlay | `z-[1]` | wantlist.tsx |

Note: `z-10` is used for sticky elements (sticky tab bar in album-detail.tsx, sticky search in add-albums-drawer.tsx). These are local stacking context only and not part of the global layering system.

Do not introduce new z-index values outside this hierarchy without checking for conflicts.

---

## Current State of the Codebase

### What's Real
- Full component and screen architecture
- Design system (colors, typography, motion tokens)
- All UI interactions and animations
- Navigation structure
- Two view modes (Grid incl. compact grid3, List) — legacy crate/artwork stored prefs are mapped back to grid at preferences hydration
- Discogs OAuth 1.0a authentication (real login via Discogs)
- Live Discogs API sync via server-side Convex proxy actions (collection, folders, wantlist, collection value)
- All Holy Grails-exclusive data persisted in Convex (purge tags, sessions, last played, want priorities, following, preferences)
- Album instance editing (media/sleeve condition, notes, folder) from album detail panel
- Folder management (create, rename, delete) from Settings > Tools > Folders via `proxyCreateFolder`, `proxyRenameFolder`, `proxyDeleteFolder`
- Discogs profile personalization in Settings — enriched profile data (location, bio, buyer/seller ratings, member since, contributions) fetched from `/users/{username}`, editable profile text and location via `proxyUpdateProfile`
- Wantlist write operations (`proxyAddToWantlist`, `proxyRemoveFromWantlist`) via Convex proxy actions
- `selectedWantItem: WantItem | null` in AppState — parallel to `selectedAlbum`, used for wantlist item detail panel (`WantItemDetailPanel` in `album-detail.tsx`). Now includes enriched tabs (Tracklist, Credits, Pressing Notes, Identifiers) loaded via `proxyFetchRelease`, matching the `AlbumDetailPanel` tab pattern.
- `selectedFeedAlbum: FeedAlbum | null` — context slot for following/feed album detail. Mirrors the `selectedWantItem` pattern exactly. Set by Following and Feed screen album art taps. Cleared on panel close.
- `removeFromCollection(albumId)` in context — calls `proxyRemoveFromCollection` (action #9), removes album from local state and Convex collection cache on success. No full re-sync.
- `collectionCrossoverQueue` in context — queue of wantlist items found in collection after sync, drives the crossover prompt (`wantlist-crossover-prompt.tsx`)
- Header action callbacks — registered by screens on mount, cleaned up on unmount. All use the double-arrow pattern to prevent React functional update auto-invocation:
  - `setOnNewStack(() => () => fn())` ← correct
  - `setOnNewStack(() => fn())` ← WRONG — triggers fn() immediately on mount
  - `onNewStack` / `setOnNewStack` — registered by the Sessions screen
  - `onAddFollowedUser` / `setOnAddFollowedUser` — registered by FollowingScreen
  - `followedUserProfile` / `setFollowedUserProfile` — `{ username, avatarUrl? } | null`, set by FollowingScreen when a user profile is open, null when closed
  - `onBackFromProfile` / `setOnBackFromProfile` — registered by FollowingScreen
  - `onUnfollowUser` / `setOnUnfollowUser` — registered by FollowedUserProfile
- Following screen activity feed hearts call Convex proxy actions with per-item Disc3 loading spinners
- Following feed cache in Convex — powers Feed Recent Activity without requiring Following screen hydration
- Wantlist cached in Convex — synced alongside collection with 24h TTL
- `master_id` matching for "In Collection" and heart state across different pressings
- **Standalone Discogs search ("Look It Up")** — `discogs-search-sheet.tsx`: master-first database search with a drill-in vinyl pressing picker (server-side country/year filtering, pinned most-collected row), barcode-like queries routed to release search, handoff to `ReleaseDetailPanel`. Makes the app usable without touching Discogs — add to collection/wantlist and check market value from search results.
- **Record-store price lookup** — Value section in `ReleaseDetailPanel` (lowest ask + N-for-sale + VG/VG+/NM suggestions), shown entirely in-app (no outbound listings link — see the outbound-links rule).
- Deployed to Vercel — live at holygrails.app (custom domain) and holy-grails.vercel.app

### What's Explicitly Out of Scope
- Listening logs — do not add any listen tracking beyond last-played timestamp
- Seller/marketplace tools
- Full Discogs database *browsing* — artist pages, label discographies (link out instead). Database **search-to-add and price lookup** ("Look It Up") ARE in scope.
- Native iOS app — this codebase is a PWA only. A native SwiftUI app is a planned post-1.0 *separate* project (see `docs/native-app-plan.md` and `docs/native-swift-features.md`); never add native-app scaffolding, Capacitor, or wrapper tooling here.

### Known Issues (do not fix without explicit instruction)
- `FollowingSkeletonRows` and `FollowedUserRow` components deleted in Phase 7 QA — replaced by partial hydration pattern introduced in Phase 7 Prompt 2a. Do not recreate these components.

### Backlog
- ~~One-off gray text colors~~ — DONE (v0.6.x color audit): crate-browser's `#9BA4B2`/`#3D5C77` migrated to `var(--c-text-faint)`/`var(--c-text-secondary)`; purge-tracker's `#6B7B8E` corrected to the token value `#5E6E80`.
- Empty state standardization — icon sizes, vertical padding, and icon-to-text spacing are inconsistent across screens. Needs a dedicated design pass with visual references before normalizing.
- Purge Cut confirmation icon — Minus vs X icon flagged during Phase 7 QA for visual review.
- Startup Convex auth errors — `Unauthorized` errors appear briefly in terminal/logs during app startup (race condition between proxy actions firing and sessionToken populating). Cosmetic, non-blocking. Queued for investigation.

---

## Rules for Claude Code Sessions

1. **Read before writing.** Understand the existing pattern before adding new code. Check how similar components are built and match them.

2. **Do not reintroduce a component library.** The shadcn/ui directory (`src/app/components/ui/`) and its dependencies were removed after the Figma Make prototype phase ended — all UI is hand-built with Tailwind + inline styles. New components follow the existing bespoke patterns.

3. **Never change the design system.** Colors, typography, motion tokens, and spacing are locked. If something looks wrong, fix the implementation, not the tokens.

4. **Preserve iOS Safari compatibility.** Test truncation with inline styles. Test inputs at 16px. Test safe area insets.

5. **Match the voice.** UX copy follows the Holy Grails tone — collector vernacular, short, direct, no corporate filler. When adding any user-facing text check the UX writing guidelines.

6. **One concern per session.** Don't combine a bug fix with a feature addition. Keep sessions focused.

7. **Commit after each working phase.** Don't let sessions pile up uncommitted.

8. **Flag before refactoring.** The following files are load-bearing. Do not refactor their APIs without explicit instruction:
   - `app-context.tsx` — global state and Convex wiring
   - `convex/discogs.ts` — all Discogs API proxy actions
   - `convex/discogsHelpers.ts` — credential lookup for proxy actions
   - `discogs-api.ts` — shared types, constants, and caches
   - `convex/schema.ts` — database schema
   - `auth-callback.tsx` — OAuth callback handler
   - `App.tsx` — root layout and auth state routing
   - `loading-screen.tsx` — full-screen loading state

9. **Convex deploy required.** Any changes to files in the `convex/` directory must be followed by `npx convex deploy` before pushing to Vercel. The dev and prod Convex deployments are separate — `npx convex dev` only updates dev. Failing to deploy will cause production errors.

---

## Key UX Writing Rules

- Short. Shorter than you think.
- Use vinyl vocabulary naturally: pressing, crate, grail, side A, VG+
- No exclamation points, no emoji, no "Hey there!" energy
- Avoid: "seamlessly," "powerful," "experience," "journey"
- Toast notifications: under 4 words where possible, no punctuation except a period for emphasis. Album-specific toasts include the full title with no truncation: `"[Title]" kept.` / `"[Title]" added to Wantlist.` / `"[Title]" removed.` Error toasts, session toasts, sync toasts, and settings toasts remain generic.
- The plural of vinyl is vinyl
- "Wantlist" is one word — never "want list" or "want-list"

---

## Discogs API Reference

**Base URL**: `https://api.discogs.com`

**Auth method**: OAuth 1.0a. Access token and token secret are stored in the Convex `users` table and used server-side only by `convex/discogs.ts` proxy actions. HMAC-SHA1 signing. The client never sees raw OAuth credentials — it passes `sessionToken` to Convex actions which resolve credentials internally.

**Rate limit**: 60 requests/minute authenticated.

**Key endpoints**:
- Collection: `GET /users/{username}/collection/folders/0/releases`
- Folders: `GET /users/{username}/collection/folders`
- Create folder: `POST /users/{username}/collection/folders`
- Rename folder: `POST /users/{username}/collection/folders/{folder_id}`
- Delete folder: `DELETE /users/{username}/collection/folders/{folder_id}`
- Want list: `GET /users/{username}/wants`
- Add to wantlist: `PUT /users/{username}/wants/{release_id}`
- Remove from wantlist: `DELETE /users/{username}/wants/{release_id}`
- Collection value: `GET /users/{username}/collection/value`
- Price suggestions: `GET /marketplace/price_suggestions/{release_id}`
- Market stats: `GET /marketplace/stats/{release_id}`
- User profile: `GET /users/{username}`
- Update profile: `POST /users/{username}` (supports `profile`, `location`, `name`, `home_page`, `curr_abbr`)

All Discogs API calls go through `convex/discogs.ts` proxy actions. No direct Discogs fetch calls in client code.

**sessionStorage** is permitted in one place only: `hg_oauth_token_secret` in `oauth-helpers.ts`, storing the temporary OAuth token secret during the Discogs redirect. It is cleared immediately after the callback completes in `auth-callback.tsx`. No other sessionStorage usage is permitted anywhere in the codebase.

**localStorage** is permitted in two places:
- `hg_session_token` in `app-context.tsx` — persists the session token for cold load restore (see Session token persistence above)
- `hg_install_nudge_dismissed` in `install-nudge.tsx` — device-level UI flag that permanently hides the PWA install nudge banner after the user dismisses it. Not a user preference — not synced to Convex.

No other localStorage usage is permitted anywhere in the codebase.

**Folder sync architecture (per-folder fetching)**

`fetchCollectionInternal` (in `convex/discogs.ts`, used by `syncSelf`) fetches collection releases per-folder rather than from the aggregate folder 0 ("All") endpoint. This is required because the Discogs API does not return `folder_id` on release objects from the folder 0 endpoint. The flow: fetch the folder list via `/collection/folders`, then for each folder (skipping folder 0), fetch `/collection/folders/{id}/releases` and inject `folder_id` from the folder being fetched onto each release before mapping. Folder 1 ("Uncategorized") is included — it is a real folder releases can live in. Rate limiting is adaptive (driven by `X-Discogs-Ratelimit-Remaining` inside `discogsFetch`), and 429 responses retry up to 2 times honoring the `Retry-After` header.

**skipPrivateFields**

`fetchCollectionInternal` takes a `skipPrivateFields` flag. When set, it skips `fetchCustomFields` and `fetchFolderMap` calls which always return 403 for other users' collections, and falls back to fetching from folder 0 since folder names are irrelevant for followed users. `syncFollowedUser` always sets this.

**Multi-folder dedup behavior**

`fetchCollectionInternal` deduplicates collection items by `release_id` after fetching all folders. If a release exists in more than one folder, only the first instance is kept. The second instance's folder assignment, condition notes, and grading are silently discarded. This is a known architectural assumption: one copy per release. Do not attempt to fix or change this behavior without explicit instruction from Shawn.

**Folder management**

The `folders` state in `app-context.tsx` is `{ id: number; name: string; count: number }[]` — not just names. `proxyFetchCollection` returns folder objects with IDs and counts. On cache hydration (cold load from Convex), folders are derived from album data as a fallback until `proxyFetchFolders` runs.

Four context functions manage folders: `createFolder(name)`, `renameFolder(folderId, name)`, `deleteFolder(folderId)`, `fetchFolders()`. All wait for API success before updating local state (no optimistic updates). `renameFolder` also updates the `folder` name on all albums that reference the renamed folder's ID.

Folder 0 ("All") is a virtual folder — always present, never editable. Folder 1 ("Uncategorized") is a real Discogs folder but cannot be renamed or deleted. The Folders management screen (`folders-screen.tsx`) enforces these constraints with locked visual treatment (Lock icon, no edit/delete controls).

The `folderOptions` derivation in `album-detail.tsx` uses the centralized `folders` state directly — it no longer reverse-engineers folder IDs from album records.

Consumers that iterate `folders` (filter-drawer, add-albums-drawer) access `folder.name` for display and `folder.id` for keys. The `activeFolder` state remains a string (folder name) for filtering.
