# Holy Grails — Living Design & Architecture Reference

## Product Summary

A responsive web app for managing a personal vinyl record collection synced with Discogs. The app is called **Holy Grails** and features four view modes for browsing albums (Grid, Artwork, List, and a stacked-card Swiper/Crate Flip), purge tracking, listening session building, want list management, a Following system for browsing other Discogs users' collections, and a Reports & Insights dashboard. It supports light and dark themes with a transparent nav header/top bar that lets the background gradient show through.

All app-specific data (purge tags, sessions, want list priorities, followed users, last-played timestamps) persists independently of Discogs syncs. When the collection changes upstream, local data stays intact.

**Users**: Primarily the owner, but designed so anyone with a Discogs account can connect their own collection. Settings accept a personal access token or CSV import — no hardcoded accounts.

**Platforms**: Responsive web app. Works in desktop and mobile browsers. Installable as a PWA (add to home screen) on mobile. Not a native app.

---

## Discogs API Integration Notes

The Discogs API supports everything this app needs. Integration code lives in `discogs-api.ts`.

**Collection**: `GET /users/{username}/collection/folders/0/releases` returns all releases with pagination. Each release includes `folder_id`.

**Folders**: `GET /users/{username}/collection/folders` returns all user-created folders with `id` and `name`. The app refers to these as **"Folders"** in the UI, not "Genres," since the mapping varies per user.

**Want list**: `GET /users/{username}/wants` returns the full want list with pagination, cover art, and release details.

**User profile**: `GET /users/{username}` returns profile info (username, avatar). Used by the Following feature to look up and validate Discogs users.

**Market data**: Release marketplace statistics are fetched for per-album and collection-wide value estimates.

**Authentication**: Personal access token (generated at discogs.com/settings/developers), passed as `Authorization: Discogs token={token}` header. No OAuth needed for personal use. Note: The app does NOT set a custom User-Agent header because browsers treat it as a "forbidden" header — setting it triggers a CORS preflight that Discogs may reject.

**Rate limits**: 60 requests/minute for authenticated requests. A full sync for a typical collection is well within limits.

---

## Typography

- **Display / Headings**: `Bricolage Grotesque` (weights 300–700)
- **Body / UI**: `DM Sans` (weights 300–700)
- Both imported via Google Fonts in `/src/styles/fonts.css`

---

## Color Palette

### Brand & Navigation
| Token | Value | Usage |
|---|---|---|
| Active nav icon/label | `#EBFD00` (bright yellow) | Active tab icon + text in both mobile bottom bar and desktop top nav |
| Nav background | `#01294D` (dark navy) | Bottom tab bar gradient endpoint |
| Nav border | `#214564` | Bottom bar inset shadow |
| Logo vinyl element | `#EBFD00` | The record disc in the SVG wordmark |
| Inactive nav icon/label | `#D1D8DF` | Inactive tab items |

### Content Area — Light Mode (default)
| Token | CSS Variable | Value |
|---|---|---|
| Background | `--c-bg` | `#F9F9FA` |
| Surface (cards) | `--c-surface` | `#FFFFFF` |
| Surface hover | `--c-surface-hover` | `#EFF1F3` |
| Surface alt | `--c-surface-alt` | `#F9F9FA` |
| Text primary | `--c-text` | `#0C284A` |
| Text secondary | `--c-text-secondary` | `#455B75` |
| Text tertiary | `--c-text-tertiary` | `#617489` |
| Text muted | `--c-text-muted` | `#6B7B8E` |
| Text faint | `--c-text-faint` | `#8494A5` |
| Border | `--c-border` | `#D2D8DE` |
| Border strong | `--c-border-strong` | `#74889C` |
| Chip background | `--c-chip-bg` | `#EFF1F3` |
| Input background | `--c-input-bg` | `#F9F9FA` |
| Card shadow | `--c-card-shadow` | `0 4px 20px rgba(12,40,74,0.08)` |

### Content Area — Dark Mode
| Token | CSS Variable | Value |
|---|---|---|
| Background | `--c-bg` | `#0C1A2E` |
| Surface (cards) | `--c-surface` | `#132B44` |
| Surface hover | `--c-surface-hover` | `#1A3350` |
| Surface alt | `--c-surface-alt` | `#0F2238` |
| Text primary | `--c-text` | `#E2E8F0` |
| Text secondary | `--c-text-secondary` | `#9EAFC2` |
| Text tertiary | `--c-text-tertiary` | `#8A9BB0` |
| Text muted | `--c-text-muted` | `#7D92A8` |
| Text faint | `--c-text-faint` | `#6A8099` |
| Border | `--c-border` | `#1A3350` |
| Border strong | `--c-border-strong` | `#2D4A66` |
| Chip background | `--c-chip-bg` | `#1A3350` |
| Input background | `--c-input-bg` | `#0F2238` |
| Card shadow | `--c-card-shadow` | `0 4px 20px rgba(0,0,0,0.25)` |

### UI Accent Colors
| Color | Value | Usage |
|---|---|---|
| Blue | `#ACDEF2` | Active view toggle bg, active filter chips (translucent), various UI elements |
| Yellow | `#EBFD00` | CTA buttons, active nav, Sync Now button, New Session button. Hover: `#d9e800` |
| Pink | `#FF98DA` | Cut purge indicator (dark mode), chart accent, no-play-recorded stat |
| Green | `#009A32` | Collection value display, chart accents |
| Green (keep) | `#3E9842` | Keep purge tag |
| Pink (cut dark) / Purple (cut light) | `#FF98DA` / `#9A207C` | Cut purge tag |
| Blue (maybe dark) / Teal (maybe light) | `#ACDEF2` / `#00476C` | Maybe purge tag |

### Active Filter Chips
- Light mode: `rgba(172,222,242,0.5)` background, `#00527A` text
- Dark mode: `rgba(172,222,242,0.2)` background, `#ACDEF2` text

### Yellow CTA Buttons
- Background: `#EBFD00`, text: `#0C284A`, hover: `#d9e800`
- Used in: Want List (Priority pill), Sessions (New/Save), Following (Connect), Settings (Sync Now)
- The Wantlist "All" filter pill uses blue chip style (matching Collection screen), only "Priority" uses yellow

### Condition Grade Color Spectrum
Maps vinyl grading abbreviations to a pink-to-green spectrum used in Album Detail condition rows and the "What It's Worth" marketplace comparison table (`market-value.tsx`):
- **M / NM**: Green (`#3E9842` dark, `#2D7A31` light)
- **VG+**: Blue-green (`#2D8A6E` dark, `#1E7A5A` light)
- **VG**: Blue (`#4A90C4` dark, `#2A6FA0` light)
- **G+ / G**: Pink-blue (`#8A6AAE` dark, `#6B4D91` light)
- **F / P**: Pink (`#C44A8A` dark, `#9A207C` light)

---

## Cross-Cutting Patterns

### iOS Safari Text Truncation
All text truncation across album-facing screens uses **inline styles** instead of the Tailwind `truncate` class for iOS Safari WebKit compatibility:
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
Used in: album-list.tsx, album-grid.tsx (folder pill text), crate-flip.tsx, wantlist.tsx (list rows), sessions.tsx (session detail album rows), add-albums-drawer.tsx, session-picker-sheet.tsx. Tailwind `line-clamp-1` / `line-clamp-2` is still used where multi-line clamping is appropriate (e.g., grid card title/artist, session names).

### Disc3 Spinner
All sync/loading spinners tied to collection sync and API calls use the `Disc3` icon from lucide-react with the `disc-spinner` CSS class, which spins at 1.8s per revolution (33 1/3 RPM), `linear` easing. Defined in `/src/styles/fonts.css`:
```css
@keyframes spin-record {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.disc-spinner {
  animation: spin-record 1.8s linear infinite;
  transform-origin: center center;
}
```
Respects `prefers-reduced-motion: reduce` (animation disabled). Used in: settings-screen.tsx (Sync Now button), friends-screen.tsx (Connect button, progress text), splash-screen.tsx (loading states).

### Motion Tokens
Shared animation constants live in `motion-tokens.ts` and are used across all components for consistent timing:
- `EASE_OUT: [0.25, 1, 0.5, 1]`
- `EASE_IN_OUT: [0.76, 0, 0.24, 1]`
- `EASE_IN: [0.5, 0, 0.75, 0]`
- `DURATION_MICRO: 0.1s`, `DURATION_FAST: 0.175s`, `DURATION_NORMAL: 0.225s`, `DURATION_SLOW: 0.3s`

### Hide-on-Scroll Mobile Header
The `useHideHeaderOnScroll` hook (`use-hide-header.ts`) hides the mobile header bar when scrolling down and reveals it when scrolling up or at the top. Active on screens: `crate`, `wants`, `friends`, `reports`. Uses an 8px scroll threshold to prevent flicker. Applied in: album-grid, album-list, album-bento, wantlist, friends-screen, reports-screen.

### Shake-to-Random
The `useShake` hook (`use-shake.ts`) opens a random album in Album Detail when the user shakes their mobile device. Desktop-only disabled. Threshold: 12, timeout: 1000ms.

### Shared Empty State — NoDiscogsCard
The `NoDiscogsCard` component (`no-discogs-card.tsx`) provides a consistent "no Discogs connected" empty state card with heading, subtext, and yellow "Connect Discogs" CTA button. Used in screens where data requires a Discogs connection (wantlist, sessions, etc.). Tapping the button triggers `requestConnectDiscogs` which re-shows the Connect Discogs prompt.

### Alphabetical Index Sidebar (Mobile Only)
An iOS-style alphabetical index sidebar appears on mobile (`lg:hidden`) for scrub-to-scroll navigation. Present in:
- **Collection Grid** (`album-grid.tsx`) — for artist/title sorts only (hidden for date-based sorts)
- **Collection List** (`album-list.tsx`) — same visibility rules as Grid
- **Wantlist Grid** (`wantlist.tsx`) — always visible (wantlist always sorted artist A→Z)
- **Wantlist List** (`wantlist.tsx`) — always visible

**Behavior rules**:
- Visible when sort is `artist-az`, `artist-za`, or `title-az`. Hidden for `year-*`, `added-*`, `last-played-*` sorts.
- Only shown when there are 2+ distinct letters in the dataset.
- Touch scrub scrolls immediately (no tooltip/magnifier). Tap scrolls with `smooth` behavior.
- Active letter highlights in yellow (`#EBFD00`), inactive in `var(--c-text-tertiary)`.
- Letters: 11px, DM Sans, weight 600, 18px tall touch targets.
- Positioned: `right: calc(4px + env(safe-area-inset-right, 0px))`, `top: 140px`, `bottom: calc(80px + env(safe-area-inset-bottom, 0px))`.
- Active letter fades after 600ms timeout.

**Content area balancing**: When the sidebar is visible, scroll containers use `pr-[32px]` on mobile (extra right padding to prevent content from being obscured by the sidebar) and `lg:pr-[24px]` on desktop. Left padding is standardized at `pl-[16px]` on mobile across all gallery views.

---

## Core Screens

### 1. Collection (Home) — `crate-browser.tsx`

The primary screen for browsing albums.

#### Four View Modes

The `ViewMode` type is `"crate" | "list" | "grid" | "artwork"`. Toggle order in the UI: **Grid** (Grid2x2 icon) -> **Artwork** (Grid3x3 icon) -> **List** (List icon) -> **Swiper** (Disc3 icon). Default view is `"grid"`.

1. **Grid** (`album-grid.tsx`): 2-column (mobile) / 4-column (desktop) grid of square album covers with card styling (surface background, border, shadow). Card layout: title (`line-clamp-1`, 13px Bricolage Grotesque weight 600), artist (`line-clamp-1`, 12px DM Sans), year on its own row (11px DM Sans), then folder pill + bookmark icon on the bottom row. Folder pill sizes to content width with inner text truncation (inline styles for iOS Safari). Bookmark icon uses `marginLeft: "auto"` to flush right, with 12px tap padding and negative margins for a larger touch target. Purge indicator dot in top-left corner of artwork. Full `min-w-0` ancestor chain for truncation. Alphabetical index sidebar on mobile (see Cross-Cutting Patterns).
2. **Artwork** (`album-bento.tsx`): 4-column grid of square album covers. Artwork only — no text below cards. Metadata (title, artist) appears via hover overlay (desktop) or tap (mobile). Same gap spacing as old Bento view (`gap-2 lg:gap-[10px]`). Padding: `px-[16px] lg:px-[24px]`. Bookmark icon in corner. Purge indicator dot.
3. **List** (`album-list.tsx`): Compact rows with 64x64px thumbnail (`w-16 h-16`), artist, title (both with inline truncation styles), last-played relative date, purge indicator (8px circle at 50% opacity), year, and folder pill. Folder pills use blue chip palette. Purge indicator positioned as absolute `top-1.5 right-1.5`. Bookmark icon below year/folder. Alphabetical index sidebar on mobile (see Cross-Cutting Patterns). Container padding: `pl-[16px] pr-[32px]` on mobile when sidebar visible, `lg:pr-[24px]` on desktop.
4. **Swiper / Crate Flip** (`crate-flip.tsx`): Stacked-card interaction using Motion (Framer Motion). Cards stacked with slight vertical offset and scale. Swipe up/down (vertical drag) to flip through. Current card front and center, next cards peek behind. Folder pill on crate cards uses white-on-translucent styling since it overlays album art. Last-played text shown on cards. Text uses inline truncation styles. **Lightbox dimming**: Swiping activates a dark overlay (`rgba(0, 0, 0, 0.7)`) at `z-[100]` with the current card elevated to `z-101`. The lightbox auto-dismisses after 3 seconds of inactivity. Close button (X icon) in top-right. Card scales up 1.05x when lightbox is active. Stack cards dim to 0.08 base opacity during lightbox (vs 0.15 normally). `hideGalleryMeta` setting (from app context) can hide the metadata overlay on swiper cards.

#### Card Display (All Views)
- **Cover art is dominant**
- Artist name and title
- Year as a small detail
- Folder name as a subtle badge
- No purge controls visible — the crate is for browsing, not evaluating

#### Title Bar (White Background Container + Bottom Border)
- **Desktop**: "Collection" heading (48px Bricolage Grotesque), right-aligned stats showing "+X albums in the last 30 days" (green for positive) and "Est. value $X,XXX ($min - $max)" with green median value. Reports button (BarChart3 icon).
- **Mobile**: "Collection" heading (36px), same stats at smaller size (11px) aligned right.

#### Search / Filter / View Controls (Gray Content Background)
Below the title bar, on the gray content background:
- **Search field**: rounded pill with Search icon, "Search artist, title, label..."
- **Filter button**: SlidersHorizontal icon -> opens filter drawer
- **View mode toggle**: Pill-shaped container with 4 icon buttons
- **Reports button** (mobile only): BarChart3 icon in a bordered square
- **Active filter chips**: Dismissible pills showing active folder, sort option, "Play Not Recorded", "Rediscover"

#### Filter Drawer (Bottom Sheet / Center Modal) — `filter-drawer.tsx`
- **Folders section**: Chips pulled from Discogs folders. "All" selected by default. Active chips use blue style.
- **Quick Filters section**: "Play Not Recorded" and "Rediscover" toggle chips
- **Sort By section**: Artist A->Z (default), Artist Z->A, Title A->Z, Year newest/oldest, Date Added newest/oldest, Last Played (oldest first)
- **Apply button**: Yellow CTA at bottom
- Mobile: bottom sheet anchored above tab bar. Desktop: centered modal with backdrop.

#### Rediscover Mode
When activated via filter drawer, a header with Compass icon appears showing album count and Exit button. Subtitle: "Albums waiting for your attention." Works with all four view modes. Shows empty state "Your whole collection is getting love." when no albums qualify. Appears as a dismissible chip in active filters.

#### Tap Behavior
Tapping an album card (in any view) opens the **Album Detail** (bottom sheet on mobile, right side panel on desktop).

### 2. Album Detail — `album-detail.tsx`

**Mobile**: Bottom sheet that slides up. Draggable to dismiss. Sheet extends to the true screen bottom (`bottom: 0`) with `paddingBottom: env(safe-area-inset-bottom, 16px)` on the outer container so the background reaches the edge on notched devices. The inner scrollable content has `paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 120px)` to ensure all content (including Rate for Purge) scrolls fully into view above the floating bottom tab bar.
**Desktop**: Right-side panel (380px wide), animated in/out with spring transition. Persistent alongside main content — not an overlay.

**Content order** (top to bottom):
- Cover art (large, prominent)
- Title, artist, year + purge badge
- Detail rows (year, label, catalog #, format, folder, conditions with color-coded grades, price paid, custom fields)
- Notes from Discogs
- Link out to Discogs release page
- **"Mark as Played"** button with pulse animation when just tapped. Shows last-played date.
- **"What It's Worth"** section — uses `MarketValueSection` component from `market-value.tsx`. Rendered as an `AccordionSection` with Coins icon in header. Contains marketplace statistics with condition grade comparison table using the color spectrum (see Color Palette). Fetches market data lazily on expand.
- **"Add to Session"** button — visible when a session draft is active, hidden otherwise.
- **"Save for Later"** accordion (shared `AccordionSection` component, Bookmark icon in header). Label dynamically changes: "Save for Later" when album is in no sessions, "Saved" when `isAlbumInAnySession` is true.
- **"Rate for Purge"** section — Keep / Cut / Maybe buttons. Always visible (not in accordion).

**Accordion sections** use the shared `AccordionSection` component (`accordion-section.tsx`): `rounded-[10px]` container with `border-strong` border, `surface-alt` background, label + optional icon + optional trailing content + animated chevron header, and `AnimatePresence`-driven expand/collapse with divider.

**Save for Later accordion**: Contains an inline session checklist identical to the Session Picker (see 4c). Bookmark icon in header is filled with accent color (`#ACDEF2` dark / `#00527A` light) when album is in any session, outline with `var(--c-text-secondary)` when not. Auto-checks Saved for Later when expanding if album is in no sessions.

**Condition grades**: Detail rows for media and sleeve condition are color-coded using the condition grade color spectrum (P/F=pink, G/G+=pink-blue, VG=blue, VG+=blue-green, NM/M=green). Both `album-detail.tsx` and `market-value.tsx` have their own `conditionColor` / `conditionGradeColor` functions mapping grade abbreviations to the spectrum.

**Purge badge**: If album has a purge tag, a small colored indicator pill appears near the title.

**Scroll fade overlay**: The app-wide gradient overlay (in `App.tsx`) that fades content above the floating bottom nav is conditionally hidden (`{!showAlbumDetail && !sessionPickerAlbumId && ...}`) when the album detail sheet or session picker is open, preventing it from obscuring the sheet's interactive elements.

### 3. Purge Tracker — `purge-tracker.tsx`

Dedicated screen for focused evaluation work.

**Top stats row**: Total, Keep (green), Cut (pink/purple), Maybe (blue/teal), Unrated. Each stat tappable to filter the list. Uses `purge-colors.ts` for consistent coloring.

**Progress visualization**: Bar showing "X of Y evaluated" with percentage.

**Filtered album list**: Same list component as Collection list view. Defaults to "Unrated" filter.

**Swipe-to-tag**: In this tab, swiping list rows reveals quick-tag options using Motion drag gestures. Visual color feedback based on drag direction.

**Market value integration**: Per-album market data fetched on demand.

### 4. Listening Sessions — `sessions.tsx`

Uses an internal list/detail view pattern — no draft mode, no floating bar.

**Session list view**: Cards showing session name (`line-clamp-2` truncation), album count (with Disc3 icon), date created (with Calendar icon). Tap navigates to session detail. Stacked album cover thumbnails as visual preview. Sessions sorted by most recently modified. Yellow "+" button in title bar opens inline name input card.

**Session creation**: Tap "+" -> inline card with text input (`maxLength={100}`) and Cancel/Create buttons. On Create, immediately navigates to the new session's detail view.

**Session detail** (internal view, not overlay):
- **Header**: Back button (ChevronLeft with circular `border-strong` outline) on left. Editable session title — tap title to rename (inline input with yellow underline, `maxLength={100}`, `line-clamp-2` display). Pencil icon appears on hover.
- **Subtitle**: Album count + creation date, `pl-10` to align past back button.
- **Album list with drag-to-reorder**: Uses Motion's `Reorder.Group` and `Reorder.Item` components for drag-to-reorder. Numbered positions with grip handles (GripVertical icon, `cursor: grab`). Each row shows position number, grip handle, album thumbnail (36x36px, `rounded-[6px]`) + title/artist with inline truncation styles (tappable to open album detail), and a Trash2 delete button (pink `#FF33B6`). Reordering calls `reorderSessionAlbums(sessionId, newOrder)` from app context to persist the new album ID order.
- **Inline action buttons** (below album list): Full-width yellow "Add Albums" CTA + muted gray "Delete Session" text button.
- **Empty state**: Headphones icon + "Nothing here yet." / "Add albums to get started." + yellow "Add Albums" button + muted gray "Delete Session" button.
- **Delete confirmation**: Modal with AlertTriangle icon, "Delete this session?" heading, Cancel/Delete buttons. Delete uses pink (`#FF33B6`) styling.

**Add Albums drawer** (`add-albums-drawer.tsx`): Bottom sheet (mobile) / centered modal (desktop, 520px wide, max 720px/85vh tall) for adding albums to a session. Header shows dynamic text: "Add to '{session name}'" (zero new) or "X albums added to '{session name}'" with curly quotation marks and `line-clamp-2` truncation. Close (X) and Confirm (Check) buttons. Changes are batched locally and only committed on confirm.

**Add Albums drawer sections** (vertically scrollable):
1. **Recently Added**: Top 20 albums by `dateAdded`, displayed as horizontal scroll thumbnail cards (`ThumbnailCard`, 88x88px artwork with title/artist text below, top-aligned with `alignItems: "flex-start"`). Checked albums show a dark overlay with yellow checkmark.
2. **Keeps**: Albums tagged "keep" in purge, same horizontal scroll thumbnail format.
3. **Browse Everything**: Full album list with sticky search bar + folder filter chips. Rows show 44x44px thumbnail, title/artist with inline truncation, and checkbox. Sorted artist A->Z. Active folder chips use blue style.

**Empty state** (no sessions): Headphones icon + "What's spinning tonight?" / "Set the order before the needle drops."

### 4b. Saved for Later

Not a separate data structure — "Saved for Later" is a regular session auto-created by the app when needed.

**Auto-creation**: When a user taps a bookmark icon and no sessions exist yet, `openSessionPicker` in `app-context.tsx` automatically creates a session named "Saved for Later" with the tapped album pre-added, and sets `firstSessionJustCreated` to true. This is the only special behavior — once created, it's a normal session that can be renamed, deleted, or reordered like any other.

**Sessions screen**: Appears as a regular session card (no pinned position, no special styling). Sorted by `lastModified` like all other sessions.

**Data**: Stored as a regular session in the `sessions` array. No separate `savedForLater` state.

### 4c. Session Picker — `session-picker-sheet.tsx`

A multi-session save UI triggered from bookmark icons on album cards.

**Trigger**: All card views (Grid, Artwork, List, Swiper, Feed) call `openSessionPicker(albumId)` from their bookmark icon tap handlers. The `album-detail.tsx` inline Save for Later accordion uses the same checklist pattern inline instead.

**Mobile (< lg)**: Bottom sheet with session checklist. Same visual pattern as album detail bottom sheet (rounded top corners, grab handle, drag-to-dismiss).

**Desktop (>= lg)**: Centered popover with same checklist content. Wrapped in a `position: fixed; inset: 0` flex-centered container.

**Content**:
- **Header**: "Add to Session" title (18px Bricolage Grotesque weight 600). Subtitle shows **bold album title** + em dash + artist name in a single line with inline truncation styles (13px, `var(--c-text-muted)`). Close button (X, 28px circle with `var(--c-chip-bg)` background).
- **Session rows**: Each row shows session name, album count, and checkbox. All sessions treated equally (no pinned "Saved for Later" row). Sessions sorted by `lastModified` descending.
- **New Session**: Inline row with "+" icon -> text input (`maxLength={100}`) + confirm button for creating a session and immediately adding the album.
- **Auto-check**: When opening, if the album is not in any session, it is automatically added to the most recently active session (`mostRecentSessionId`). If the picker was just opened via auto-creation (first bookmark ever, `firstSessionJustCreated`), the newly created session is pre-checked.

**Uncheck behavior**: When a session is **checked** (album added), `lastModified` is updated and the session moves to the top of the sorted list. When a session is **unchecked** (album removed), `lastModified` is **not** updated — the session stays in its current position in the list. This prevents the list from re-sorting on removal, which was disorienting.

**Checkbox styling**: `#EBFD00` background with `#0C284A` checkmark when checked. Empty circle with `var(--c-border-strong)` when unchecked.

**Bookmark icon state on cards**: Filled with accent color (`#ACDEF2` dark / `#00527A` light) when `isAlbumInAnySession(albumId)` returns true. Outline with muted color when not in any session.

**CSS variables**: Applied inline on the sheet/popover container because these components render outside the `<main>` element's CSS variable cascade.

**Context members** (`app-context.tsx`): `sessionPickerAlbumId`, `openSessionPicker`, `closeSessionPicker`, `isInSession`, `toggleAlbumInSession`, `createSessionDirect`, `isAlbumInAnySession`, `mostRecentSessionId`, `firstSessionJustCreated`, `reorderSessionAlbums`.

### 5. Wantlist — `wantlist.tsx`

Same four view modes as Collection (Grid, Artwork, List, Swiper). Default is Grid. View mode toggle uses same `ViewModeToggle` component from `crate-browser.tsx`.

**Simpler cards**: No purge controls, no condition data. Cover, artist, title, year, label.

**Grid cards** (`WantGridCard`): Same card layout as Collection Grid — title `line-clamp-1`, artist `line-clamp-1`, year on its own row. Below year: a "Discogs" link (mobile only, with ExternalLink icon) for quick access to the release page. **Marketplace data on hover**: On desktop, hovering a grid card lazily fetches marketplace stats via `fetchMarketData`. The hover overlay shows copies for sale count + lowest price (linking to the sell page on Discogs), a "No copies for sale" message, or a loading state. A "View on Discogs" button appears in the overlay.

**Priority bolt**: Each want list item has a Zap (lightning bolt) toggle. Tap to mark as high-priority. Filled yellow bolt for priority, outline for normal. This is app-local data (not synced back to Discogs). Toast confirmation on toggle ("Marked as priority." / "Removed from priority.").

**Filter options**:
- "All" pill (uses blue chip style, matching Collection filters)
- "Priority" pill (uses yellow style, `#EBFD00` background)
- Search by artist, title
- Mobile: Zap icon button toggles between All/Priority

**Wantlist List view**: Rows show 48x48px thumbnail (`w-12 h-12`), title/artist with inline truncation styles, label (hidden on small screens), "View on Discogs" link with ExternalLink icon (label text hidden below `lg`), and Zap priority toggle.

**Wantlist Artwork view**: Same 4-column grid as Collection Artwork. Padding: `px-[16px] lg:px-[24px]`. Zap priority button in top-right corner of each card.

**Wantlist Swiper view**: Same stacked-card pattern as Collection Swiper with lightbox dimming, wrapping navigation (loops around), and `hideGalleryMeta` support. Shows Discogs link in card overlay metadata. Zap priority button on the current card.

**Alphabetical index sidebar**: Present in both Grid and List views on mobile (always visible since wantlist is always sorted artist A->Z). Same component pattern as Collection but using `useWantAlphabetIndex` which doesn't check sort option.

**Tap to detail**: Same bottom sheet / side panel pattern.

### 6. Following — `friends-screen.tsx`

Browse other Discogs users' collections. The user-facing label is **"Following"** everywhere (nav items, section titles, feed activity header), though the internal screen ID and file name remain `friends` / `friends-screen.tsx` for code continuity.

**Following list**: Shows avatar, username, album/want count. Swipe-to-delete (Motion drag) reveals red delete action.

**Follow a user**: Form with @username input + Connect button. Connect button shows Disc3 spinner while loading. Progress text below with Disc3 spinner. Fetches user profile, collection, and want list via Discogs API. Handles private collections gracefully.

**User profile**: Back arrow, avatar, @username header. Collection/Want List tab toggle (using `#ACDEF2` active background). Search + view mode toggle (same four modes). Four smart filter chips:
- All
- In Common (albums you both have)
- They Want / You Cut (albums you tagged Cut that they want)
- You Want / They Have (albums from your want list in their collection)

Uses yellow active chip style for filters. Contextual banners for trade opportunities.

### 7. Feed — `feed-screen.tsx`

The app's home base. Tapping the logo in the header navigates here. Also accessible from the mobile bottom tab bar (Newspaper icon).

**Title**: Dynamic collection headline replaces a static "Feed" label. The headline is generated from collection size and uses the app's editorial voice — concise, opinionated, quietly amused. Examples: "30 records. Nice little stash." / "150 records. The shelves are filling up." / "No records yet. Let's fix that." Styled as a large Bricolage Grotesque heading (28px mobile, 36px desktop).

**Sections** (vertically scrollable):
1. **Collection Summary**: Card with warm one-liner (weekly additions or total count) and horizontal "Suggested Rotation" thumbnail row (3 random albums).
2. **Following Activity**: Preview with pink `#FF33B6` heart reactions and "See all" link to Following screen.
3. **Recently Added**: 3 most recently added albums in compact list format.
4. **Insights**: Tappable nudge rows (scissors/disc/tag icons with chevrons) linking to Purge, Collection, and Insights.
5. **Purge Tracker**: Card showing purge progress (X% rated — Y to go), gradient progress bar, keep/cut/maybe breakdown. Taps through to full Purge Tracker screen. This is the primary mobile entry point for Purge since it's not in the mobile bottom bar.

**Empty state**: "Nothing here yet. Sync your Discogs collection in Settings to get started."

### 8. Reports & Insights — `reports-screen.tsx`

Dashboard with collection analytics. Accessible from:
- Desktop top nav bar (BarChart3 icon, positioned between Purge and Following)
- Mobile bottom tab bar (BarChart3 icon)
- Reports button in Collection title bar
- Feature card in Settings

**Sections** (uses recharts library):
1. **Collection Value**: Hero median value in green, min/max range, area chart showing value over time, purge impact callout
2. **Collection Growth**: Total count, bar chart of albums added per month (pink bars), 3-month addition stat
3. **Collection Breakdown**: Tabbed (By Folder / By Decade / By Condition) with horizontal bar charts and recharts bar charts
4. **Listening Activity**: Stats grid (played this month, streak/days since last, no-play-recorded count), "No Spins on File" neglected album list, suggestion card with "Played Today" action
5. **Purge Progress**: Donut ring showing evaluation progress, 2x2 stat grid (Keep/Cut/Maybe/Unrated), cut pile estimated value

**Footer**: Source attribution, pricing coverage stats, sync timestamp.

### 9. Settings — `settings-screen.tsx`

**Developer / QA section**: Blue-tinted dashed-border card at top with "Load Placeholder Data" (loads 30 mock albums) and "Wipe All Data" (destructive pink) buttons. Marked with "Dev Only" badge. Will be removed before production.

**Discogs Connection**:
- Username field (auto-detected from token, read-only when token is set)
- Personal access token field (password-masked with show/hide toggle)
- Helper link: "Generate a token at discogs.com/settings/developers"
- "Sync Now" yellow CTA button with Disc3 disc-spinner (replaces old RefreshCw spinner)
- Sync status: error display (pink AlertTriangle), last synced timestamp with green CheckCircle2, stats ("X records * Y folders * Z want list items")

**Purge Tracker quick-access card** (mobile only): Blue-tinted tappable card linking to Purge Tracker with SquareArrowOutUpRight icon and ChevronRight. Since Purge is not in the mobile bottom bar, this provides an alternative entry point.

**CSV Import (Fallback)**:
- "Import Collection CSV" dashed-border upload button
- "Import Want List CSV" dashed-border upload button
- Helper: "Export from Discogs -> Settings -> Export"

**Appearance**:
- "Hide purge indicators" toggle (removes Keep/Maybe/Purge dots from collection views)
- "Hide swiper gallery metadata" toggle (removes metadata overlay from swiper cards)
- Both use blue (`#ACDEF2`) active / muted inactive toggle styling

**Data Management**:
- "Clear Purge Data" with confirmation modal
- "Clear Sessions" with confirmation modal
- "Clear All Local Data" with confirmation modal (destructive pink)
- Confirmation dialogs use AlertTriangle icon and two-button layout

**About**: Version label ("Holy Grails v0.2.4")

---

## Onboarding & Splash Flow

The app shows a splash/onboarding sequence when no data is loaded and no Discogs token is set. Managed in `App.tsx` via `splashView` state.

**SplashScreen** (`splash-screen.tsx`): Landing page with wordmark logo, background video (`SplashVideo`), Sign In / Create Account buttons, "Skip for now" link (loads demo data), and a dev-mode section with hardcoded QA credentials for quick sync testing (Disc3 spinner during sync).

**ConnectDiscogsPrompt** (`connect-discogs-prompt.tsx`): Post-signup/sign-in prompt encouraging users to connect their Discogs account. "Connect Discogs" button triggers simulated OAuth flow, "Skip for now" enters with empty state.

**CreateAccountScreen** (`create-account-screen.tsx`): Account creation form with name/email/password fields. On success, navigates to ConnectDiscogsPrompt.

**SignInScreen** (`sign-in-screen.tsx`): Email/password sign-in with "Forgot password" sub-view. On success, loads demo data and enters Feed.

**Re-entry**: If all data is wiped (via Settings), the splash screen reappears. In-app "Connect Discogs" requests (from `NoDiscogsCard` components) re-show the ConnectDiscogsPrompt directly.

---

## Navigation — `navigation.tsx`

### Mobile (< 1024px / `lg` breakpoint)

**Header bar** (`MobileHeader`, 58px, **transparent background** — the app-wide radial gradient shows through):
- Left: Dark/Light theme toggle (compact Sun/Moon switch)
- Center: SVG wordmark logo (tappable -> Feed). Fill color adapts to dark/light mode (`#E2E8F0` / `#0C284A`). Clicking the vinyl disc in the logo triggers a spin animation.
- Right: Following icon (Users, 18px) + Settings icon (UserRound, 18px or user avatar if synced). Both show active state with translucent background when their screen is active.
- **Hides on scroll** (on supported screens) via CSS transform/margin-bottom transition. A 12px breathing-room spacer appears when header is hidden.

**Bottom tab bar** (`BottomTabBar`, **floating pill** — `border-radius: 9999px`, positioned 12px from bottom with 10px side margins):
- Background: `linear-gradient(to bottom, rgb(33,69,100), rgb(1,41,77))` (fully opaque, no backdrop-filter)
- Box shadow: `0 4px 24px rgba(1,41,77,0.25)` + subtle `1px` inset highlight at `rgba(172,222,242,0.08)`
- Height: 60px

| Order | Label | Icon | Screen ID |
|---|---|---|---|
| 1 | Feed | Newspaper | `feed` |
| 2 | Collection | Library | `crate` |
| 3 | Wants | Heart | `wants` |
| 4 | Sessions | Headphones | `sessions` |
| 5 | Insights | BarChart3 | `reports` |

Active: `#EBFD00` icon + text, `bg-[rgba(172,222,242,0.12)]` background. Inactive: `#D1D8DF`.
Following and Settings are in the header, not the bottom bar.
**Purge is not in the mobile bottom bar** — it is accessible from the Feed screen (Purge Tracker card), Settings (quick-access card, mobile only), and the Album Detail "Rate for Purge" section.

### Desktop (>= 1024px)

**Horizontal top nav bar** (`DesktopTopNav`, 58px, **transparent background** — same radial gradient shows through):

Split into three zones:

| Zone | Items |
|---|---|
| Left group | Feed, Collection, Wants, Sessions |
| Center | SVG wordmark logo (tappable -> Feed) |
| Right group | Purge, Insights, Following, Settings + Theme toggle |

Both left and right groups are `flex-1` so the logo stays perfectly centered. Each nav item is a text button with icon (17px) + label (13px Bricolage Grotesque). Active state: translucent `rgba(226,232,240,0.1)` background (dark) or `rgba(12,40,74,0.08)` (light), with full-opacity text. Inactive: ~45% opacity text. Settings shows user avatar (from Discogs sync) instead of icon when available.

Active text color: `#E2E8F0` (dark) / `#0C284A` (light). Inactive: `rgba(226,232,240,0.45)` (dark) / `rgba(12,40,74,0.4)` (light).

---

## Responsive Layout Strategy

**Mobile (< 1024px)**:
- Floating pill bottom tab bar (5 items) + Following/Settings in header
- Full-width content
- Bottom sheet for album detail and filters
- Single-column list view, 2-column grids (4-column artwork)

**Desktop (>= 1024px)**:
- Horizontal top nav bar (8 items + theme toggle)
- Main content area centered with max-width 1280px, generous margins
- Right panel (380px) for album detail (persistent, animated, not overlay)
- Filter drawer appears as centered modal with backdrop
- 4-column grids, wider list rows

**Both breakpoints**: App-wide radial gradient background (`radial-gradient(ellipse 120% 60% at 50% 0%, ...)`)

---

## Z-Index Hierarchy

| Layer | Z-Index | Component |
|---|---|---|
| Mobile bottom tab bar | `z-[130]` | `navigation.tsx` |
| Album detail mobile backdrop | `z-[110]` | `album-detail.tsx` |
| Album detail mobile sheet | `z-[120]` | `album-detail.tsx` |
| Desktop side panel | `z-[110]` | `App.tsx` |
| Swiper/Crate Flip lightbox overlay | `z-[100]` | `crate-flip.tsx`, `wantlist.tsx` |
| Swiper/Crate Flip active card | `z-101` | `crate-flip.tsx`, `wantlist.tsx` |
| Scroll fade overlay | `z-100` | `App.tsx` |
| Delete confirmation modals | `z-[90]` | `sessions.tsx` |
| Session picker mobile sheet | `z-[85]` | `session-picker-sheet.tsx` |
| Session picker mobile backdrop | `z-[80]` | `session-picker-sheet.tsx` |
| Add Albums drawer | `z-[80]` | `add-albums-drawer.tsx` |
| Desktop session picker popover | `z-50` | `session-picker-sheet.tsx` |
| Alphabet index sidebar | `z-40` | `album-grid.tsx`, `album-list.tsx`, `wantlist.tsx` |

---

## File Reference

| File | Purpose |
|---|---|
| `App.tsx` | Root layout, screen routing, splash flow, side panel, scroll fade overlay |
| `app-context.tsx` | Global state provider (albums, sessions, purge, sync, session picker) |
| `navigation.tsx` | Mobile header, bottom tab bar, desktop top nav, SVG wordmark logo |
| `crate-browser.tsx` | Collection screen with view mode toggle, search, filters, `ViewModeToggle` component |
| `album-grid.tsx` | Grid view with alphabetical index sidebar |
| `album-bento.tsx` | Artwork-only grid view |
| `album-list.tsx` | List view with alphabetical index sidebar |
| `crate-flip.tsx` | Swiper/Crate Flip stacked-card view with lightbox |
| `album-detail.tsx` | Album detail bottom sheet (mobile) and panel content |
| `market-value.tsx` | "What It's Worth" marketplace section with condition grade comparison |
| `filter-drawer.tsx` | Filter bottom sheet / modal with folders, quick filters, sort |
| `purge-tracker.tsx` | Purge evaluation screen with swipe-to-tag |
| `purge-colors.ts` | Purge tag color utilities |
| `sessions.tsx` | Session list + detail with drag-to-reorder |
| `add-albums-drawer.tsx` | Add Albums bottom sheet / modal with sections |
| `session-picker-sheet.tsx` | Bookmark session picker bottom sheet / popover |
| `wantlist.tsx` | Wantlist screen with four views, marketplace hover, alphabetical index |
| `friends-screen.tsx` | Following screen with user profiles and smart filters |
| `feed-screen.tsx` | Feed home screen with collection summary and nudges |
| `reports-screen.tsx` | Reports & Insights dashboard with recharts |
| `settings-screen.tsx` | Settings with Discogs connection, appearance, data management |
| `accordion-section.tsx` | Shared expandable accordion component |
| `no-discogs-card.tsx` | Shared "no Discogs connected" empty state card |
| `splash-screen.tsx` | Onboarding splash with dev QA credentials |
| `splash-video.tsx` | Background video for splash/onboarding screens |
| `connect-discogs-prompt.tsx` | Post-signup Discogs connection prompt |
| `create-account-screen.tsx` | Account creation form |
| `sign-in-screen.tsx` | Email sign-in form |
| `discogs-api.ts` | Discogs API integration (fetch, market data, collection value) |
| `mock-data.ts` | Demo/placeholder data types and constants |
| `motion-tokens.ts` | Shared animation easing curves and durations |
| `last-played-utils.ts` | Date formatting utilities for last-played timestamps |
| `use-hide-header.ts` | Hook for hiding mobile header on scroll |
| `use-shake.ts` | Hook for shake-to-random gesture |
| `theme.ts` | Content area CSS variable token generator |