# CLAUDE.md — Holy Grails

This file is read by Claude Code at the start of every session. Follow everything here before making any decisions about architecture, design, or implementation.

---

## What This App Is

**Holy Grails** is a vinyl record collection management PWA that syncs with Discogs. It is not a Discogs clone. The core value is decision-making and curation — specifically the purge workflow (evaluating records as Keep / Cut / Maybe) and listening session building. These are things Discogs does not do.

The app is a passion project and portfolio piece built by a designer (Shawn) using vibe coding. Code quality matters, but preserving the design integrity matters more. When in doubt, match the existing visual and interaction patterns exactly.

Primary users: Shawn (catxdad19 on Discogs) and his friend Tyler for QA. 430 albums, 2x3 Kallax at capacity.

---

## Tech Stack

- **Framework**: React + TypeScript
- **Build tool**: Vite
- **Styling**: Tailwind CSS + CSS custom properties
- **Animation**: Framer Motion (imported as `motion` from `framer-motion`)
- **Icons**: Lucide React
- **Charts**: Recharts
- **UI components**: shadcn/ui (in `src/components/ui/`)
- **Fonts**: Bricolage Grotesque (display/headings) + DM Sans (body/UI) via Google Fonts
- **Backend**: Convex (all Holy Grails-exclusive data — purge tags, sessions, following, preferences, last played, want priorities)
- **Auth**: Discogs OAuth 1.0a — the Discogs username is the primary key for all Convex data. There is no separate Holy Grails account system.

Do not introduce new dependencies without flagging it first. The existing stack is intentional.

---

## Data Architecture

### What lives in Discogs (via API sync)
- Collection (albums, folders, conditions, notes, custom fields)
- Want list
- User profile (username, avatar)

### What lives in Convex (Holy Grails-exclusive)
- Purge tags (keep / cut / maybe + timestamps), keyed by `discogs_username` + `release_id`
- Listening sessions (name, album order, created/modified timestamps), keyed by `discogs_username`
- Following list (other Discogs users being followed in-app), keyed by `discogs_username`
- Want list priority bolts, keyed by `discogs_username` + `release_id`
- Last-played timestamps, keyed by `discogs_username` + `release_id`
- User preferences (theme, hide purge indicators, hide gallery meta), keyed by `discogs_username`
- OAuth tokens (access token + token secret), stored in the `users` table

### Rules
- Never use localStorage for any persistent data
- All Convex reads use `useQuery`, all writes use `useMutation`
- Use optimistic updates for writes wherever Convex supports it
- The public API of `app-context.tsx` must not change when wiring Convex — components should not need to update

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
      App.tsx            # (same as above)
      accordion-section.tsx
      add-albums-drawer.tsx
      album-bento.tsx
      album-detail.tsx
      album-grid.tsx
      album-list.tsx
      app-context.tsx    # Global state — do not refactor without discussion
      connect-discogs-prompt.tsx
      crate-browser.tsx
      crate-flip.tsx
      create-account-screen.tsx
      depths-album-card.tsx
      discogs-api.ts     # All Discogs API calls live here
      feed-screen.tsx
      filter-drawer.tsx
      friends-screen.tsx
      last-played-utils.ts
      market-value.tsx
      mock-data.ts
      motion-tokens.ts
      navigation.tsx
      no-discogs-card.tsx
      purge-colors.ts
      purge-tracker.tsx
      reports-screen.tsx
      session-picker-sheet.tsx
      sessions.tsx
      settings-screen.tsx
      sign-in-screen.tsx
      splash-screen.tsx
      splash-video.tsx
      theme.ts
      use-hide-header.ts
      use-shake.ts
      wantlist.tsx
      ui/                # shadcn components — do not modify directly
    imports/
    styles/
      fonts.css
      index.css
      tailwind.css
      theme.css
convex/                  # Convex backend functions and schema
  schema.ts
  users.ts
  purge_tags.ts
  sessions.ts
  last_played.ts
  want_priorities.ts
  following.ts
  preferences.ts
src/
  main.tsx
```

---

## Design System

### Color Palette

#### Brand / Navigation (fixed, does not change with theme)
| Usage | Value |
|---|---|
| Active nav icon + label | `#EBFD00` (bright yellow) |
| Nav background | `#01294D` (dark navy) |
| Nav border | `#214564` |
| Logo vinyl element | `#EBFD00` |
| Inactive nav icon + label | `#D1D8DF` |

#### Content Area — Light Mode (default)
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
| `--c-text-muted` | `#6B7B8E` |
| `--c-text-faint` | `#8494A5` |
| `--c-border` | `#D2D8DE` |
| `--c-border-strong` | `#74889C` |
| `--c-chip-bg` | `#EFF1F3` |
| `--c-input-bg` | `#F9F9FA` |
| `--c-card-shadow` | `0 4px 20px rgba(12,40,74,0.08)` |

#### Content Area — Dark Mode
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
| `--c-chip-bg` | `#1A3350` |
| `--c-input-bg` | `#0F2238` |
| `--c-card-shadow` | `0 4px 20px rgba(0,0,0,0.25)` |

#### UI Accent Colors
| Color | Value | Usage |
|---|---|---|
| Blue | `#ACDEF2` | Active view toggles, active filter chips, maybe purge tag (dark) |
| Yellow | `#EBFD00` | CTA buttons, active nav, Sync Now, New Session. Hover: `#d9e800` |
| Pink | `#FF98DA` | Cut purge indicator (dark mode), chart accent |
| Green | `#009A32` | Collection value display |
| Green (keep) | `#3E9842` | Keep purge tag |
| Purple (cut light) | `#9A207C` | Cut purge tag (light mode) |
| Teal (maybe light) | `#00476C` | Maybe purge tag (light mode) |

#### Yellow CTA Buttons
```tsx
// Always use this pattern for primary CTAs
className="bg-[#EBFD00] text-[#0C284A] hover:bg-[#d9e800]"
```

#### Active Filter Chips
```tsx
// Light mode
className="bg-[rgba(172,222,242,0.5)] text-[#00527A]"
// Dark mode
className="bg-[rgba(172,222,242,0.2)] text-[#ACDEF2]"
```

#### Condition Grade Color Spectrum
Maps vinyl condition grades to a pink-to-green spectrum:
- **M / NM**: Green (`#3E9842` dark, `#2D7A31` light)
- **VG+**: Blue-green (`#2D8A6E` dark, `#1E7A5A` light)
- **VG**: Blue (`#4A90C4` dark, `#2A6FA0` light)
- **G+ / G**: Pink-blue (`#8A6AAE` dark, `#6B4D91` light)
- **F / P**: Pink (`#C44A8A` dark, `#9A207C` light)

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

### Safe Area Insets
All bottom sheets and floating elements must account for iOS safe areas:

```tsx
paddingBottom: "env(safe-area-inset-bottom, 16px)"
```

The bottom tab bar floats 12px from the bottom with 10px side margins. Inner scrollable content in bottom sheets needs `paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 120px)` to scroll fully above it.

### Input Font Size (iOS Auto-Zoom Prevention)
All `<input>` elements must have `font-size: 16px` minimum. iOS Safari auto-zooms on inputs smaller than 16px. This is a hard rule.

---

## Navigation Structure

### Mobile (< 1024px)
Floating pill bottom tab bar with 5 items:

| Order | Label | Icon | Screen |
|---|---|---|---|
| 1 | Feed | Newspaper | `feed` |
| 2 | Collection | Library | `crate` |
| 3 | Wants | Heart | `wants` |
| 4 | Sessions | Headphones | `sessions` |
| 5 | Insights | BarChart3 | `reports` |

Following and Settings are in the mobile header, not the bottom bar.
**Purge is not in the mobile bottom bar** — it's accessed from the Feed screen card, Settings quick-access card, and Album Detail.

### Desktop (>= 1024px)
Horizontal top nav with 8 items split left/center/right. Logo centered. Both groups are `flex-1`.

---

## Z-Index Hierarchy

| Layer | Z-Index | Component |
|---|---|---|
| Mobile bottom tab bar | `z-[130]` | navigation.tsx |
| Album detail mobile sheet | `z-[120]` | album-detail.tsx |
| Album detail mobile backdrop | `z-[110]` | album-detail.tsx |
| Desktop side panel | `z-[110]` | App.tsx |
| Swiper lightbox overlay | `z-[100]` | crate-flip.tsx |
| Swiper active card | `z-101` | crate-flip.tsx |
| Scroll fade overlay | `z-100` | App.tsx |
| Delete confirmation modals | `z-[90]` | sessions.tsx |
| Session picker mobile sheet | `z-[85]` | session-picker-sheet.tsx |
| Session picker mobile backdrop | `z-[80]` | session-picker-sheet.tsx |
| Add Albums drawer | `z-[80]` | add-albums-drawer.tsx |
| Desktop session picker | `z-50` | session-picker-sheet.tsx |
| Alphabet index sidebar | `z-40` | album-grid.tsx, album-list.tsx |

Do not introduce new z-index values outside this hierarchy without checking for conflicts.

---

## Current State of the Codebase

### What's Real
- Full component and screen architecture
- Design system (colors, typography, motion tokens)
- All UI interactions and animations
- Navigation structure
- Four view modes (Grid, Artwork, List, Swiper/Crate Flip)

### What's Mocked / Simulated
- Collection data comes from `mock-data.ts` — not a live Discogs API
- Authentication is simulated (no real OAuth or token validation)
- Discogs sync is stubbed — `discogs-api.ts` may have partial implementation
- Pricing / market data is not live
- The dev QA section in Settings (hardcoded credentials, Load Placeholder Data button) is intentional and should remain until production

### What's Explicitly Out of Scope
- Listening logs — do not add any listen tracking beyond last-played timestamp
- Seller/marketplace tools
- Full Discogs database browsing (link out to Discogs instead)
- Native iOS app — this is a PWA only

---

## Rules for Claude Code Sessions

1. **Read before writing.** Understand the existing pattern before adding new code. Check how similar components are built and match them.

2. **Never modify `src/components/ui/`** unless explicitly asked. These are shadcn components.

3. **Never change the design system.** Colors, typography, motion tokens, and spacing are locked. If something looks wrong, fix the implementation, not the tokens.

4. **Preserve iOS Safari compatibility.** Test truncation with inline styles. Test inputs at 16px. Test safe area insets.

5. **Match the voice.** UX copy follows the Holy Grails tone — collector vernacular, short, direct, no corporate filler. When adding any user-facing text check the UX writing guidelines.

6. **One concern per session.** Don't combine a bug fix with a feature addition. Keep sessions focused.

7. **Commit after each working phase.** Don't let sessions pile up uncommitted.

8. **Flag before refactoring.** `app-context.tsx` and `discogs-api.ts` are load-bearing files. Do not refactor their APIs without explicit instruction.

---

## Key UX Writing Rules

- Short. Shorter than you think.
- Use vinyl vocabulary naturally: pressing, crate, grail, side A, VG+
- No exclamation points, no emoji, no "Hey there!" energy
- Avoid: "seamlessly," "powerful," "experience," "journey"
- Toast notifications: under 4 words where possible, no punctuation except a period for emphasis
- The plural of vinyl is vinyl

---

## Discogs API Reference

**Base URL**: `https://api.discogs.com`

**Auth header** (OAuth access token):
```
Authorization: OAuth oauth_token="{token}", oauth_signature="{sig}", ...
```

Do NOT set a custom `User-Agent` header — browsers block it as a forbidden header and it causes CORS preflight failures.

**Rate limit**: 60 requests/minute authenticated.

**Key endpoints**:
- Collection: `GET /users/{username}/collection/folders/0/releases`
- Folders: `GET /users/{username}/collection/folders`
- Want list: `GET /users/{username}/wants`
- Collection value: `GET /users/{username}/collection/value`
- Price suggestions: `GET /marketplace/price_suggestions/{release_id}`
- Market stats: `GET /marketplace/stats/{release_id}`
- User profile: `GET /users/{username}`

All API integration code goes in `discogs-api.ts`. No Discogs fetch calls anywhere else.
