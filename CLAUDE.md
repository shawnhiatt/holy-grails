# CLAUDE.md — Holy Grails v0.5.4

This file is read by Claude Code at the start of every session. Follow everything here before making any decisions about architecture, design, or implementation.

---

## What This App Is

**Holy Grails** is a vinyl record collection management PWA that syncs with Discogs. It is not a Discogs clone. The core value is decision-making and curation — specifically the purge workflow (evaluating records as Keep / Cut / Maybe) and listening session building. These are things Discogs does not do.

The app is a passion project and portfolio piece built by a designer (Shawn) using vibe coding. Designed for a small circle of friends today with potential to scale. Code quality matters, but preserving the design integrity matters more. When in doubt, match the existing visual and interaction patterns exactly.

---

## Tech Stack

- **Framework**: React + TypeScript
- **Build tool**: Vite
- **Styling**: Tailwind CSS + CSS custom properties
- **Animation**: Framer Motion (imported as `motion` from `"motion/react"`)
- **Icons**: Lucide React
- **Charts**: Recharts
- **UI components**: shadcn/ui (in `src/app/components/ui/`)
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
- Listening sessions (name, album order, created/modified timestamps), keyed by `discogs_username`
- Following list (other Discogs users being followed in-app + `avatar_url`), keyed by `discogs_username`
- Following feed cache (`following_feed` table — 50 most recent albums per followed user, 24h TTL per user, up to 25 users)
- Wantlist cache (`wantlist` table — mirrors Discogs wantlist for offline/fast reads, 24h TTL synced alongside collection)
- Want list priority bolts, keyed by `discogs_username` + `release_id`
- Last-played timestamps, keyed by `discogs_username` + `release_id`
- Collection cache (`collection` table — mirrors Discogs collection for offline/fast reads, synced alongside wantlist with 24h TTL)
- User preferences (theme, hide purge indicators, hide gallery meta, shake to random, view mode, want view mode, default screen), keyed by `discogs_username`
- OAuth tokens (access token + token secret), `session_token`, `collection_value`, `collection_value_synced_at`, `discogs_avatar_url`, `created_at`, `last_synced_at`, stored in the `users` table

### Vinyl-Only Filter
Holy Grails is intentionally vinyl-only. A global filter (`formats[].name === "Vinyl"`) is applied at the data layer during Convex collection sync and cache hydration in `app-context.tsx`. CDs, cassettes, and other formats are excluded before albums reach any UI component. This is a product decision, not a flag or user setting. No other formats should ever surface in the UI.

### Rules
- Never use localStorage for any persistent data
- All Convex reads use `useQuery`, all writes use `useMutation`
- Use optimistic updates for writes wherever Convex supports it
- The public API of `app-context.tsx` must not change when wiring Convex — components should not need to update

---

## Authentication Architecture

**Session token auth pattern:**
All Convex queries and mutations (except `oauth.ts` and `users.upsert`) require a valid `sessionToken`. A central `authenticateUser()` helper in `convex/authHelper.ts` handles validation and returns the authenticated user record. The `discogs_username` is always derived server-side from the authenticated user — never accepted as a client-supplied argument.

**Session token flow:**
`sessionToken` is generated on `users.upsert` during OAuth callback, extracted in `auth-callback.tsx`, stored in `app-context.tsx` state, persisted to `localStorage` as `hg_session_token`, and threaded through all ~37 Convex mutation/query call sites.

**Session token persistence (`hg_session_token`):**
The `setSessionToken` wrapper in `app-context.tsx` syncs every token change to `localStorage`. On cold load, `sessionToken` state initializes from `localStorage.getItem("hg_session_token")`. If a stored token exists, it is passed to `getLatestUser` to look up the user by `by_session_token` index. If no stored token exists (fresh visitor, incognito, post-logout), `getLatestUser` is skipped entirely and the visitor sees the login screen. If the stored token is invalid (no matching user), the token is cleared from localStorage and the visitor sees the login screen. This is the only permitted use of `localStorage` in the app — do not add other localStorage usage without discussion.

**users.ts function split:**
- `getLatestUser` — session restore query, requires `sessionToken` argument, looks up user by `by_session_token` index (never returns data without a valid token)
- `getMe` — authenticated query, returns user record without tokens

**Schema change:**
`users` table has a `session_token` field and a `by_session_token` index.

**Exempt from auth guards:**
`convex/oauth.ts` functions (`requestToken`, `accessToken`, `fetchIdentity`) are intentionally public — they are part of the OAuth handshake and must remain unauthenticated.

**`discogsAuth` removed from AppState.** Components that previously used `discogsAuth` to make Discogs API calls now get `sessionToken` from `useApp()` and pass it to Convex proxy actions instead.

**`oauthCredentials` state and `convexAuthCredentials` query removed** from `app-context.tsx`. Tokens are resolved server-side.

**`discogsToken` dev flow removed.** All authentication now goes through OAuth. There is no longer a personal access token fallback.

**`authedArgs` pattern (stale token defense):**
All authenticated `useQuery` subscriptions in `app-context.tsx` use a shared `authedArgs` variable that gates on `!!discogsUsername && !!sessionToken`. During session restore, `discogsUsername` is only set after `getLatestUser` confirms the token is valid — so authenticated queries never fire with a stale token. New authenticated queries must use `authedArgs` as their argument condition, not `sessionToken` alone. `getLatestUser` is the only exception — it gates on `sessionToken` only, as it is the gatekeeper query that validates the token before `discogsUsername` is set.

---

## Discogs API Proxy

All authenticated Discogs API calls go through server-side Convex actions in `convex/discogs.ts`. The client never calls the Discogs API directly. Actions look up the user's credentials server-side via `getUserCredentials` (an internalQuery in `convex/discogsHelpers.ts`) and sign requests using HMAC-SHA1.

**convex/discogs.ts** — `"use node"` directive. Contains 19 public proxy actions: `proxyFetchIdentity`, `proxyFetchUserProfile`, `proxyFetchCollection`, `proxyFetchWantlist`, `proxyFetchMarketData`, `proxyFetchCollectionValue`, `proxyUpdateCollectionInstance`, `proxyMoveToFolder`, `proxyRemoveFromCollection`, `proxyAddToWantlist`, `proxyRemoveFromWantlist`, `proxyFetchRelease`, `proxyFetchUserCollectionPage`, `proxyFetchFolders`, `proxyCreateFolder`, `proxyRenameFolder`, `proxyDeleteFolder`, `proxyUpdateProfile`, `proxyAddToCollection`. All take `sessionToken` as the first argument.

`proxyAddToCollection` — action #19. POSTs to `/users/{username}/collection/folders/{folder_id}/releases/{release_id}`. Defaults to folder 1 (Uncategorized). Returns `instance_id`. Caller inserts album into local state and Convex collection cache — no full re-sync.

**convex/discogsHelpers.ts** — Contains `getUserCredentials` (internalQuery). Separated from `convex/discogs.ts` because Convex does not allow queries in `"use node"` runtime files. If adding new internal queries needed by Discogs actions, they must live here, not in `discogs.ts`.

**convex/oauth.ts** — OAuth handshake actions (`requestToken`, `accessToken`, `fetchIdentity`). Now read `DISCOGS_CONSUMER_KEY` and `DISCOGS_CONSUMER_SECRET` from `process.env` — no longer accept them as client arguments. Still uses PLAINTEXT signing (acceptable for transient token exchange over HTTPS).

**discogs-api.ts** — HTTP functions removed. File now contains only: exported types (`Album`, `WantItem`, `Session`, `FollowedUser`, `FeedAlbum`, `PurgeTag`, `UserProfile`, `CollectionValue`, `MarketData`, `ConditionPrice`, `MarketplaceStats`), constants (`CONDITION_GRADES`, `CONDITION_SHORT`), pure utility functions (`normalizeCondition`, `buildFieldMap`), and in-memory market/collection value cache functions. Do not re-add HTTP functions here.

**`DiscogsAuth` type removed.** The client no longer holds raw OAuth credentials. Auth is identified entirely by `sessionToken`.

**`getAuthCredentials` removed from `convex/users.ts`.** Raw OAuth tokens are never returned to the client. Token lookup is internal only via `getUserCredentials` in `convex/discogsHelpers.ts`.

**Convex "use node" constraint:** Files with the `"use node"` directive (like `convex/discogs.ts`) cannot contain queries or mutations — only actions. Any internalQuery needed by a Node.js action must live in a separate file (e.g. `convex/discogsHelpers.ts`) and be called via `ctx.runQuery(internal.discogsHelpers.functionName, args)`.

**Sync progress granularity:** After the 1b migration, paginated sync no longer reports specific page counts ("Fetching 150/300"). The loading phase shows "Syncing" without per-page progress. This is a known tradeoff of server-side proxying — progress callbacks are not available across Convex action boundaries.

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
npm run dev
```

The app runs on `http://localhost:5173` by default (Vite).

---

## File Structure

```
src/
  app/
    App.tsx              # Root layout, screen routing, splash flow, side panel
    components/
      accordion-section.tsx
      add-albums-drawer.tsx
      album-artwork-grid.tsx
      album-detail.tsx
      album-grid.tsx
      album-list.tsx
      alphabet-sidebar.tsx # Shared useAlphabetIndex hook + AlphabetSidebar component for album-grid and album-list
      app-context.tsx    # Global state — do not refactor without discussion
      auth-callback.tsx  # OAuth callback handler — processes Discogs redirect and exchanges tokens
      crate-browser.tsx
      crate-flip.tsx
      depths-album-card.tsx
      dominant-color-card.tsx  # Reusable card wrapper — extracts dominant color from album artwork via canvas, sets CSS custom properties (--dc-bg, --dc-text, etc.) for children. Uses /img-proxy/ to avoid CORS canvas tainting.
      discogs-api.ts     # Types, constants, pure utilities, and in-memory caches (HTTP functions removed — see Discogs API Proxy)
      feed-screen.tsx
      filter-drawer.tsx
      folders-screen.tsx  # Folder management subview (accessed from Settings > Tools > Folders). Create, rename, delete folders. Folders 0/1 are read-only. Uses inline edit and confirmation modal patterns from sessions.tsx.
      format-spotlight.tsx  # Rotating obscure format highlights section on the home feed
      following-screen.tsx
      install-nudge.tsx   # Dismissible PWA install nudge bottom sheet for mobile browser users. Fixed-position sheet (z-[150]) with backdrop (z-[149]). Detects standalone mode, listens for beforeinstallprompt (Android), shows instructional copy (iOS). Dismissal persisted to localStorage. Mounted from App.tsx.
      last-played-utils.ts
      market-value.tsx
      motion-tokens.ts
      navigation.tsx
      no-discogs-card.tsx
      offline-banner.tsx   # Banner shown when device has no network connection; uses z-[115]
      oauth-helpers.ts   # OAuth 1.0a initiation — kicks off Discogs redirect (no signing, just calls convex/oauth.ts)
      purge-colors.ts
      purge-tracker.tsx
      reports-screen.tsx
      session-picker-sheet.tsx
      sessions.tsx
      settings-screen.tsx
      splash-screen.tsx
      slide-out-panel.tsx  # Shared bottom-sheet wrapper with swipe-to-dismiss. Accepts children (scrollable slot), optional title/headerAction (header row), optional footer (pinned above safe area), and z-index/className overrides. Used by AlbumDetailSheet and FilterDrawer — use this for any new mobile panel or sheet. Drag handle padding: py-1.5. Close button: rgba(0,0,0,0.45) bg + backdrop-blur(6px) + white icon for contrast over artwork. Blurs the active element on mount (`document.activeElement?.blur()`) to dismiss the iOS software keyboard whenever a panel opens over an active text input. App-wide — no individual tap handlers need to handle this.
      swipe-to-delete.tsx  # Reusable swipe-to-delete gesture component for mobile list items. Currently used in sessions.tsx. Use this for any future list item deletion on mobile.
      theme.ts
      unicorn-scene.tsx  # WebGL animated background used on all pre-auth screens. Wraps Unicorn Studio SDK (UMD). Project ID: `AsNXonIuH0GaiKmG36KD`. Falls back to `#01294D` if WebGL is unavailable.
      use-shake.ts  # Shake-to-Random gesture hook. Detects lateral shake via DeviceMotion API (threshold: 25 m/s²), fires callback, plays 40ms haptic on Android. Requires iOS DeviceMotionEvent.requestPermission() flow — toggle lives in Settings → Gestures. Preference persisted to Convex (`shake_to_random`). `App.tsx` performs a silent boot-time permission check: if `shakeToRandom` is `true` on load and `DeviceMotionEvent.requestPermission()` does not return `'granted'`, the preference is reset to `false` in Convex and a toast is shown. The check runs once per session via a `hasDonePermissionCheckRef` guard.
    hooks/
      use-online-status.ts  # Hook that powers OfflineBanner via navigator.onLine and online/offline events
      wantlist.tsx
      wantlist-heart-button.tsx  # Shared wantlist add/remove button. Two variants: "overlay" (absolute-positioned on artwork cards) and "inline" (for list rows). Handles wantlist state check, add/remove confirmation SlideOutPanel, API call, Disc3 loading state, and toasts. Used in Feed Depths cards, Following Depths cards, Following grid/artwork/list views.
      wantlist-crossover-prompt.tsx  # "Now in your collection" floating prompt — shows after sync when a wantlist item is also in the collection. Mounted from BottomTabBar in navigation.tsx.
      loading-screen.tsx   # Four-phase loading state machine (`'idle' | 'syncing' | 'syncing_following' | 'complete'`) with UnicornScene WebGL background, Disc3 spinner, and animated ellipsis message. `syncing_following` shows "Syncing users you follow (X of Y)" during startup following feed sync. Use this for all full-screen loading states — do not create new loading screens.
      ui/                # shadcn components — do not modify directly
    utils/
      format.ts          # Shared formatting utilities (formatActivityDate, formatCollectionSince, getInitial)
    imports/
    styles/
      fonts.css
      index.css
      tailwind.css
      theme.css
convex/                  # Convex backend functions and schema
  authHelper.ts        # Central session-token auth guard — used by all guarded queries/mutations
  collection.ts
  schema.ts
  users.ts             # getLatestUser (public bootstrap), getMe, upsert, updateLastSynced, updateCollectionValue, clearSession
  oauth.ts             # Public OAuth handshake — reads credentials from process.env, intentionally unauthenticated
  discogs.ts           # "use node" — 18 server-side Discogs API proxy actions (see Discogs API Proxy)
  discogsHelpers.ts    # getUserCredentials internalQuery — separated from discogs.ts due to "use node" constraint
  purge_tags.ts
  sessions.ts
  last_played.ts
  want_priorities.ts
  following.ts
  following_feed.ts  # Following feed cache: getByFollower, upsert, deleteEntry
  wantlist.ts        # Wantlist cache: getByUsername, replaceAll, addItem, removeItem
  preferences.ts
  lib/
    condition-colors.ts  # Shared condition grade color spectrum (CONDITION_SPECTRUM map + conditionGradeColor helper). Used by album-detail, market-value, reports-screen.
src/
  main.tsx
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
| `--c-bg` | `oklab(from #0C1A2E calc(l - 0.06) a b)` | Main app canvas — lowest elevation |
| `--c-surface-alt` | `oklab(from #0F2238 calc(l - 0.04) a b)` | Inset/recessed surfaces, input bg |
| `--c-surface` | `oklab(from #132B44 calc(l - 0.03) a b)` | Cards, panels, primary containers |
| `--c-surface-hover` | `oklab(from #1A3350 calc(l - 0.03) a b)` | Hover state on surface elements |
| `--c-chip-bg` | `oklab(from #1A3350 calc(l - 0.03) a b)` | Pill/chip backgrounds |
| `--c-input-bg` | `oklab(from #0F2238 calc(l - 0.04) a b)` | Input field backgrounds |

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

##### Content Area — Dark Mode
| Token | Value |
|---|---|
| `--c-bg` | `#0C1A2E` |
| `--c-surface` | `#132B44` |
| `--c-surface-hover` | `#1A3350` |
| `--c-surface-alt` | `#0F2238` |
| `--c-text` | `#E2E8F0` |
| `--c-text-secondary` | `#9EAFC2` |
| `--c-text-tertiary` | `#8A9BB0` |
| `--c-text-muted` | `#7D92A8` |
| `--c-text-faint` | `#6A8099` |
| `--c-border` | `#1A3350` |
| `--c-border-strong` | `#2D4A66` |
| `--c-chip-bg` | `oklab(from #1A3350 calc(l - 0.03) a b)` |
| `--c-input-bg` | `oklab(from #0F2238 calc(l - 0.04) a b)` |
| `--c-destructive` | `#FF33B6` |
| `--c-destructive-hover` | `#E6009E` |
| `--c-destructive-tint` | `rgba(255, 51, 182, 0.08)` |
| `--c-link` | `#EBFD00` |
| `--c-link-hover` | `#d9e800` |
| `--c-card-shadow` | `0 4px 20px rgba(0,0,0,0.25)` |
| `--c-sheet-shadow` | `0 -8px 32px rgba(0, 0, 0, 0.3)` |
| `--c-shadow-sm` | `0 1px 3px rgba(0, 0, 0, 0.15)` |
| `--c-shadow-modal` | `0 16px 48px rgba(0, 0, 0, 0.4)` |

#### Fixed Brand Colors — Hardcoded, Do Not Tokenize

These never change with theme and are always hardcoded where used.

| Value | Usage |
|---|---|
| `#EBFD00` | Active nav, CTA buttons, logo accent, sync/action buttons |
| `#01294D` | Nav background |
| `#214564` | Nav border |
| `#D1D8DF` | Inactive nav icon + label |
| `#d9e800` | CTA button hover state |
| `#0C284A` | Text on yellow CTA buttons |

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
| `#EEFC0F` | Wantlist priority bolt icon |
| `#0DB1F2` | Chart third accent (reports-screen chart constants) |
| `#22C55E` | Success / confirmed state icon |
| `#FF98DA` | Cut purge tag — dark mode (also used in progress gradient) |

Chart constants in `reports-screen.tsx` (`CHART_GREEN`, `CHART_PINK`, `CHART_BLUE`) are hardcoded by design — they are data visualization colors, not UI surface colors.

Condition grade colors (the pink-to-green spectrum) are defined in `src/lib/condition-colors.ts`. Always import from there — never re-declare inline.

Purge colors are defined in `purge-colors.ts`. Always import from there.

##### Condition Grade Color Spectrum
Maps vinyl condition grades to a pink-to-green spectrum:
- **M / NM**: Green (`#3E9842` dark, `#2D7A31` light)
- **VG+**: Blue-green (`#2D8A6E` dark, `#1E7A5A` light)
- **VG**: Blue (`#4A90C4` dark, `#2A6FA0` light)
- **G+ / G**: Pink-blue (`#8A6AAE` dark, `#6B4D91` light)
- **F / P**: Pink (`#C44A8A` dark, `#9A207C` light)

#### Gradients

Gradient fades to surface backgrounds must reference a CSS token — never a hardcoded hex:

```tsx
// Correct
background: "linear-gradient(to bottom, transparent, var(--c-surface))"

// Wrong — breaks on theme change
background: "linear-gradient(to bottom, transparent, #132B44)"
```

Image card overlays using `rgba(0,0,0,...)` for photo readability are intentional exceptions — do not change them.

---

### Typography

- **Display / Headings**: `Bricolage Grotesque` (weights 300–700)
- **Body / UI labels**: `DM Sans` (weights 300–700)
- Both loaded via Google Fonts in `src/styles/fonts.css`
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
All loading states use `Disc3` from lucide-react with the `disc-spinner` CSS class. This spins at 33 1/3 RPM (1.8s per revolution). Never use a generic spinner component.

```tsx
import { Disc3 } from "lucide-react"
<Disc3 className="disc-spinner" />
```

### CSS Variables on Detached Components
Session picker and other components that render outside the main `<main>` element must apply CSS variables inline on their container — they don't inherit from the main cascade.

**Detached-component surface color pattern:** The following components use `isDarkMode ? "#132B44" : "#FFFFFF"` for their background color rather than `var(--c-surface)`. This is intentional — these components render in a context where CSS custom properties from the root are not inherited (detached from the main DOM tree or rendered via portals):

- slide-out-panel.tsx
- add-albums-drawer.tsx
- session-picker-sheet.tsx
- album-detail.tsx (two instances)
- wantlist-crossover-prompt.tsx
- purge-tracker.tsx
- loading-screen.tsx

`#132B44` (dark) and `#FFFFFF` (light) are the correct surface values for detached components. Do not change these to `var(--c-surface)` without first verifying CSS variable inheritance in that rendering context.

### App-Level CSS Custom Properties

- `--app-bg` — set dynamically in App.tsx as the scroll-fade gradient base color. Dark: `#0C1A2E`, Light: `#ACDEF2`. Used for the top-of-screen scroll fade overlay.
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

### Input Font Size (iOS Auto-Zoom Prevention)
All `<input>` elements must have `font-size: 16px` minimum. iOS Safari auto-zooms on inputs smaller than 16px. This is a hard rule.

### PWA Platform Limitations
- **Haptics**: The Vibration API (`navigator.vibrate()`) is supported on Android PWAs but not on iOS Safari or iOS PWAs — Apple does not support it. Always guard with `if (navigator.vibrate)` so it fails silently on iOS. Do not attempt to polyfill or work around this. If haptic feedback on iOS is ever required, it would need a native app wrapper (e.g. Capacitor) which is out of scope for Holy Grails.

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
- **ReleaseData shape**: `{ country, notes, tracklist, credits, community, identifiers, genres, styles }`.
- **Mobile hero image**: On mobile (`hideHeader === true`), the panel renders a padded square cover image (`px-4 pt-3`, `rounded-[12px]`, `aspect-square`, `1px solid var(--c-border-strong)`) with a gradient scrim overlay (`linear-gradient(to top, rgba(0,0,0,0.82), transparent)`) covering the bottom 55%. Album title (22px, Bricolage Grotesque 700, white) and artist · year (15px, weight 500, white 80%) float as text on the gradient. Desktop side panel layout is unchanged.
- **Thumbnail carousel**: `mt-3` spacing below the hero image.
- **Purge tag**: Renders in its own `px-4 pb-2` row below the carousel (left-aligned), only when present and not in edit mode. No longer part of the title block.
- **"Your Copy" card header**: On mobile, the metadata card has a "YOUR COPY" section label (16px, fontWeight 600, `var(--c-text)`) matching other section heading styles, with the edit pencil button right-aligned in the header row.
- **Panel section order**: Hero → Thumbnail carousel → Purge tag → Your Copy (with section header, Format, Label, Catalog #, Year, Country, Folder, Media, Sleeve, Paid, custom fields) → User Notes → Discogs link → Mark as Played → Enriched Tabs (mobile) or accordion sections (desktop) → Community (compact row) → Market Value → Sessions → Rate for Purge.
- **Enriched content tabs (mobile)**: On mobile, Tracklist, Credits, Pressing Notes, and Identifiers render as a sticky horizontal tab bar instead of accordion sections. Tabs with no data are hidden after the enriched fetch resolves. During loading, all four tabs show at `opacity: 0.4` with a skeleton below. Active tab uses `2px solid #EBFD00` underline indicator. Tab bar uses `position: sticky; top: 0; z-index: 10` with a background matching the sheet's hardcoded background (`isDarkMode ? "#132B44" : "#FFFFFF"`). An IntersectionObserver sentinel pattern applies `paddingTop: 48px` only when the tab bar is stuck, clearing the close button. `tabBarStuck` state resets on album change. On desktop, the original accordion sections remain.
- **Section component props**: `hideTitle` prop added to `TracklistSection`, `CreditsSection`, `PressingNotesSection` — suppresses section headings when rendered inside tab content on mobile. `hideToggle` prop added to `TracklistSection` — shows full tracklist without Show More truncation on mobile tabs.
- **Inner scroll container**: The `div.flex-1.overflow-y-auto` inside `AlbumDetailPanel` conditionally applies `overflow-y-auto` only on desktop (`hideHeader === false`). On mobile, `overflow-y` is removed so `position: sticky` resolves against `scrollRef` in `SlideOutPanel`.
- **Two distinct notes**: User personal notes (from collection sync) stay in Your Copy. Discogs pressing/matrix notes (from enriched data) go in the collapsible Pressing Notes section (or Pressing Notes tab on mobile). Never merge these.
- **Wantlist button**: Intentionally removed from collection album detail view. The underlying `WantlistHeartButton` logic remains for wantlist item detail.
- **Skeleton loading**: `EnrichedSkeleton` component with `animate-pulse` bars shows while release data loads, matching the market-value pattern.
- **Sheet open gate (`App.tsx`):** The desktop side panel and mobile sheet open condition checks `selectedAlbum || selectedWantItem || selectedFeedAlbum`. Any new panel type added to `AlbumDetailPanel` routing must also be added to this gate or the sheet will silently refuse to open.
- **DestructiveButton** — shared two-tap confirm button component, local to `album-detail.tsx`. Props: `label`, `confirming`, `loading`, `onClick`, `variant?: "destructive" | "neutral"` (default: `"destructive"`). Destructive variant: outlined white text (first tap) → solid `#FF2D78` fill (confirm tap) → `Disc3` spinner while async in flight. Neutral variant: `var(--c-surface)` bg + `var(--c-border-strong)` border + `var(--c-text)` color in all states, no pink. Used by `WantItemDetailPanel`, `AlbumDetailPanel` (remove from collection) with `destructive`; `ReleaseDetailPanel` (remove from wantlist) with `neutral`.

`ReleaseDetailPanel` — detail panel for non-collection albums (feed/following). Takes a `FeedAlbum` prop. Loads enriched data via `proxyFetchRelease`. Shows hero image, thumbnail carousel, enriched tabs, community stats, and action buttons. Does not include Mark as Played, Purge, Edit, or session picker. Action buttons ("Add to Collection", "Add to Wantlist", "Remove from Wantlist") all use neutral surface style — `var(--c-surface)` bg, `var(--c-border-strong)` border, `var(--c-text)` color. No leading icons. "View Your Copy" (shown when already in collection) retains its green surface style. "Remove from Wantlist" uses `DestructiveButton` with `variant="neutral"`.

Session picker entry points: Bookmark buttons have been removed from all card views (Grid, Artwork, List, Swiper). Session picker is now accessed via (1) the `Music` icon button on the Recommended card in the Feed screen, and (2) the inline Save for Later accordion in `album-detail.tsx`.

"View on Discogs" links removed app-wide from all album/release contexts. OAuth flows unaffected. `MarketValueSection` removed from `WantItemDetailPanel` and `ReleaseDetailPanel` — only present in collection `AlbumDetailPanel`.

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
- `cover` — 500x500px — use for large/focal displays (detail panels, crate/swiper, depths cards, grid cards)

Never use `cover` in contexts smaller than ~200px — always prefer `thumb || cover` for thumbnails. Loading a 500px image into a 40px element wastes bandwidth.

### master_id Matching
`master_id` is stored on `Album`, `WantItem`, and `FeedAlbum` objects. "In Collection" and heart filled state check both `release_id` and `master_id` to match across different pressings of the same recording. `master_id` of 0 means no master exists — skip matching on 0. The `isInWants` and `isInCollection` context helpers accept an optional `masterId` parameter. Feed and Following screens build `ownMasterIds` / `wantMasterIds` Sets for O(1) lookups.

### Following Feed Cache
The `following_feed` Convex table caches the 50 most recent albums per followed user (up to 25 users, most recently followed first). 24h TTL per user — bypassed when cached data lacks `master_id` (one-time migration). Powers Feed Recent Activity and From the Depths without requiring Following screen hydration. Avatar URLs for followed users are stored in the `following` Convex table and exposed via the `followingAvatars` map in context.

**Manual sync (Sync Now)** bypasses the 24h TTL on the following feed — `performSync()` accepts a `forceRefresh` parameter that skips the cache freshness check. `syncFromDiscogs()` (the manual trigger) always passes `forceRefresh: true`. Startup sync uses the default (`false`) and respects the 24h cache.

### Wantlist Caching
The wantlist is cached in the `wantlist` Convex table with the same 24h TTL as the collection. `convex/wantlist.ts` handles persistence (`getByUsername`, `replaceAll`, `addItem`, `removeItem`). Wantlist write operations (add/remove) update both local state and the Convex wantlist cache on success.

### Home Feed (feed-screen.tsx)

**Section order:** Recommended, Recently Added, Format Spotlight, Following Activity, On the Hunt, Decades, From the Depths, Purge Tracker, Insights.

**Recommended hero:** The Recommended section renders as a full-bleed hero card on mobile only. Uses `DominantColorCard` for artwork-driven background tinting. The feed header becomes transparent when scroll position is 0 on the home feed and transitions to opaque on scroll. This behavior is scoped to the home feed screen exclusively via a prop on the header component — not a fork or separate header.

**Format Spotlight:** Rotates the featured format on every app load. Filters the user's collection data for obscure vinyl format descriptions (7-Inch, 12-Inch, Limited Edition, Picture Disc, Colored, Etched, 45 RPM, Mono, etc.). Requires a minimum of 3 matching albums per category to be eligible for display. Operates entirely on cached Convex collection data — zero additional API calls.

**On the Hunt:** Wantlist showcase — horizontal scroll on mobile (145px cards), 6-col grid on desktop. Shows priority bolt icons on prioritized items. "See All" navigates to wantlist screen. Tapping a card opens `WantItemDetailPanel`. Shuffled on mount with priority items weighted 2x, deduped, max 6 items.

**Decades:** Random eligible decade spotlight (requires 5+ albums in the decade). Uses `DepthsAlbumCard` with `dominantColor` for artwork-driven card backgrounds.

**From the Depths:** 2x2 grid on mobile, 3x3 grid on desktop. Uses `DepthsAlbumCard` with `compact` and `dominantColor` props — shows only title, artist, and date (no year/label/folder meta line).

**Dominant color cards:** `DominantColorCard` (`dominant-color-card.tsx`) extracts the dominant color from album artwork via canvas sampling and uses it as the card background. Text contrast (light/dark) is determined by WCAG 2.1 relative luminance. Images are proxied through `/img-proxy/` (Vite dev proxy + Vercel rewrite) to avoid CORS canvas tainting. The component sets CSS custom properties (`--dc-bg`, `--dc-text`, `--dc-text-secondary`, `--dc-text-muted`) for children to consume. `DepthsAlbumCard` supports a `dominantColor` boolean prop that wraps the card in `DominantColorCard` and switches text colors to `--dc-*` vars with `--c-*` fallbacks. A `compact` boolean prop reduces font sizes and hides the year/label/folder meta line.

### Following Screen (following-screen.tsx)
- **Avatar size**: 80px (with 28px fallback initials). Button container width: 92px.
- **Avatar row sort order**: Sorted by most recent `followingFeed` entry per user (descending). Users with no feed entries fall to end, tiebroken alphabetically. Sort is derived via `useMemo` and applied only to the avatar row display order — does not affect the main user list.

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

---

## Navigation Structure

### Mobile (< 1024px)
Mobile bottom tab bar is fixed flush to the bottom edge (not a floating pill).

- `left: 0`, `right: 0`, `bottom: 0`, `border-radius: 0`
- Height: `calc(54px + env(safe-area-inset-bottom, 0px))`
- `paddingBottom: env(safe-area-inset-bottom, 0px)` applied internally
- Background: `linear-gradient(to bottom, rgb(33,69,100), rgb(1,41,77))`
- The PWA standalone `.bottom-tab-bar` override has been removed — flush bar requires no override

5 items:

| Order | Label | Icon | Screen |
|---|---|---|---|
| 1 | Feed | Newspaper | `feed` |
| 2 | Collection | GalleryVerticalEnd | `crate` |
| 3 | Wantlist | Heart | `wants` |
| 4 | Sessions | Music | `sessions` |
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
users icon + avatar right. Plus button calls `onNewSession` from context.

**Variant D — Following (no profile open)**
Screen title left. Yellow UserPlus button + users icon + avatar right.
UserPlus button calls `onAddFollowedUser` from context.

**Variant E — Following (profile open, followedUserProfile !== null)**
Back arrow + user avatar + @username (truncating) left.
Muted UserMinus button (var(--c-text-muted), NOT destructive red) right.
Back calls `onBackFromProfile`. Unfollow calls `onUnfollowUser` (triggers
existing confirmation modal — does not unfollow directly).

Title truncation on all variants: `white-space: nowrap`,
`overflow: hidden`, `text-overflow: ellipsis`, `min-width: 0`,
`flex: 1` on title wrapper. Right button group is `flex-shrink: 0`.

SCREEN_TITLES map lives in `navigation.tsx`. Feed is intentionally omitted.
Per-screen internal title bars have been removed from all screens —
do not re-add them.

### Desktop (>= 1024px)
Horizontal top nav with 8 items split left/center/right. Logo centered. Both groups are `flex-1`.

**Left group:** Feed > Collection > Wantlist > Sessions
**Right group:** Following > Purge > Insights > Settings > theme toggle

Collection uses `GalleryVerticalEnd` icon (was `Library`). Insights uses `BarChart3`. Active state: `#EBFD00` icon + translucent background highlight.

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
| Swiper lightbox overlay | `z-[100]` | crate-flip.tsx |
| Swiper active card | `z-101` | crate-flip.tsx |
| Scroll fade overlay | `z-100` | App.tsx |
| Delete confirmation modals | `z-[90]` | sessions.tsx |
| Purge tracker sheet | `z-[89]` | purge-tracker.tsx |
| Purge tracker backdrop | `z-[88]` | purge-tracker.tsx |
| Session picker mobile sheet | `z-[85]` | session-picker-sheet.tsx |
| Session picker mobile backdrop | `z-[80]` | session-picker-sheet.tsx |
| Add Albums drawer sheet | `z-[85]` | add-albums-drawer.tsx |
| Add Albums drawer backdrop | `z-[80]` | add-albums-drawer.tsx |
| Filter drawer panel | `z-[70]` | filter-drawer.tsx |
| Filter drawer backdrop | `z-[60]` | filter-drawer.tsx |
| Desktop session picker | `z-50` | session-picker-sheet.tsx |
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
- Four view modes (Grid, Artwork, List, Swiper/Crate Flip)
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
  - `setOnNewSession(() => () => fn())` ← correct
  - `setOnNewSession(() => fn())` ← WRONG — triggers fn() immediately on mount
  - `onNewSession` / `setOnNewSession` — registered by SessionsScreen
  - `onAddFollowedUser` / `setOnAddFollowedUser` — registered by FollowingScreen
  - `followedUserProfile` / `setFollowedUserProfile` — `{ username, avatarUrl? } | null`, set by FollowingScreen when a user profile is open, null when closed
  - `onBackFromProfile` / `setOnBackFromProfile` — registered by FollowingScreen
  - `onUnfollowUser` / `setOnUnfollowUser` — registered by FollowedUserProfile
- Following screen activity feed hearts call Convex proxy actions with per-item Disc3 loading spinners
- Following feed cache in Convex — powers Feed Recent Activity without requiring Following screen hydration
- Wantlist cached in Convex — synced alongside collection with 24h TTL
- `master_id` matching for "In Collection" and heart state across different pressings
- Deployed to Vercel — live at holygrails.app (custom domain) and holy-grails.vercel.app

### What's Explicitly Out of Scope
- Listening logs — do not add any listen tracking beyond last-played timestamp
- Seller/marketplace tools
- Full Discogs database browsing (link out to Discogs instead)
- Native iOS app — this is a PWA only

### Known Issues (do not fix without explicit instruction)
- `FollowingSkeletonRows` and `FollowedUserRow` components deleted in Phase 7 QA — replaced by partial hydration pattern introduced in Phase 7 Prompt 2a. Do not recreate these components.

### Backlog
- Empty state standardization — icon sizes, vertical padding, and icon-to-text spacing are inconsistent across screens. Needs a dedicated design pass with visual references before normalizing.
- Purge Cut confirmation icon — Minus vs X icon flagged during Phase 7 QA for visual review.
- Startup Convex auth errors — `Unauthorized` errors appear briefly in terminal/logs during app startup (race condition between proxy actions firing and sessionToken populating). Cosmetic, non-blocking. Queued for investigation.
- Sync progress granularity — paginated collection/wantlist sync no longer reports specific page counts after the 1b proxy migration. Shows static "Syncing" message. Consider restoring progress feedback via a different mechanism.

---

## Rules for Claude Code Sessions

1. **Read before writing.** Understand the existing pattern before adding new code. Check how similar components are built and match them.

2. **Never modify `src/app/components/ui/`** unless explicitly asked. These are shadcn components.

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

`proxyFetchCollection` fetches collection releases per-folder rather than from the aggregate folder 0 ("All") endpoint. This is required because the Discogs API does not return `folder_id` on release objects from the folder 0 endpoint. The flow: fetch the folder list via `/collection/folders`, then for each folder (skipping folder 0), fetch `/collection/folders/{id}/releases` and inject `folder_id` from the folder being fetched onto each release before mapping. Folder 1 ("Uncategorized") is included — it is a real folder releases can live in. Rate limiting uses the existing `sleep(250)` between requests.

**skipPrivateFields**

`proxyFetchCollection` accepts an optional `skipPrivateFields: true` argument. When set, skips `fetchCustomFields` and `fetchFolderMap` calls which always return 403 for other users' collections, and falls back to fetching from folder 0 since folder names are irrelevant for followed users. Always pass this when fetching followed users' collections.

**Multi-folder dedup behavior**

`proxyFetchCollection` in `convex/discogs.ts` deduplicates collection items by `release_id` after fetching all folders. If a release exists in more than one folder, only the first instance is kept. The second instance's folder assignment, condition notes, and grading are silently discarded. This is a known architectural assumption: one copy per release. Do not attempt to fix or change this behavior without explicit instruction from Shawn.

**Folder management**

The `folders` state in `app-context.tsx` is `{ id: number; name: string; count: number }[]` — not just names. `proxyFetchCollection` returns folder objects with IDs and counts. On cache hydration (cold load from Convex), folders are derived from album data as a fallback until `proxyFetchFolders` runs.

Four context functions manage folders: `createFolder(name)`, `renameFolder(folderId, name)`, `deleteFolder(folderId)`, `fetchFolders()`. All wait for API success before updating local state (no optimistic updates). `renameFolder` also updates the `folder` name on all albums that reference the renamed folder's ID.

Folder 0 ("All") is a virtual folder — always present, never editable. Folder 1 ("Uncategorized") is a real Discogs folder but cannot be renamed or deleted. The Folders management screen (`folders-screen.tsx`) enforces these constraints with locked visual treatment (Lock icon, no edit/delete controls).

The `folderOptions` derivation in `album-detail.tsx` uses the centralized `folders` state directly — it no longer reverse-engineers folder IDs from album records.

Consumers that iterate `folders` (filter-drawer, add-albums-drawer) access `folder.name` for display and `folder.id` for keys. The `activeFolder` state remains a string (folder name) for filtering.
