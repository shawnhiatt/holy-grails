# Holy Grails — Changelog

## v0.2.2 — Session Picker, AccordionSection, & Bottom Sheet Fixes (Feb 2026)

### New Components

- **`session-picker-sheet.tsx`** — Multi-session save UI triggered from bookmark icons on album cards. Bottom sheet on mobile, centered popover on desktop. Includes session checklist with Saved for Later pinned first, user-created sessions, inline new session creation, and auto-check behavior. Replaces direct `toggleSavedForLater` on card-level bookmark icons.
- **`accordion-section.tsx`** — Shared expand/collapse accordion component with `rounded-[10px]` container, `border-strong` border, `surface-alt` background, icon + label + chevron header, and `AnimatePresence`-driven expand/collapse. Used by both "What It's Worth" (`market-value.tsx`) and "Save for Later" (`album-detail.tsx`).

### Session Picker / Bookmark Flow

- All card views (`album-grid.tsx`, `album-bento.tsx`, `album-list.tsx`, `crate-flip.tsx`, `feed-screen.tsx`) now call `openSessionPicker(albumId)` from bookmark icon tap handlers instead of `toggleSavedForLater`
- Bookmark icon filled state on all cards now uses `isAlbumInAnySession(albumId)` — filled accent color when album is in any session (Saved for Later or user-created), outline when not
- New context members in `app-context.tsx`: `sessionPickerAlbumId`, `openSessionPicker`, `closeSessionPicker`, `isInSession`, `toggleAlbumInSession`, `createSessionDirect`, `isAlbumInAnySession`
- Checkbox styling: `#EBFD00` background with `#0C284A` checkmark (checked), empty circle with `var(--c-border-strong)` (unchecked)
- CSS variables applied inline on sheet/popover containers (render outside `<main>` cascade)

### Album Detail Updates

- Content order updated: Cover art → Title/artist/year → Detail rows → Notes → Discogs link → Mark as Played → What It's Worth accordion → Draft session button → Save for Later accordion → Rate for Purge
- "Save for Later" refactored from standalone button to `AccordionSection` with inline session checklist
- "Save for Later" label dynamically changes to "Saved" when `isAlbumInAnySession` is true
- "What It's Worth" refactored to use shared `AccordionSection` component
- `Coins` icon (lucide-react) added to "What It's Worth" accordion header — established as canonical icon for all collection value UI
- `isDesktop` state, `matchMedia` effect, and `openSessionPicker` import cleaned out of `album-detail.tsx`

### Bottom Sheet Fixes

- **iOS safe area gap**: Sheet outer container changed from `bottom: calc(72px + env(safe-area-inset-bottom, 0px))` to `bottom: 0` with `paddingBottom: env(safe-area-inset-bottom, 16px)` — sheet background now extends to true screen edge on notched devices
- **Content clipping**: Inner scrollable content area now has `paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 120px)` — ensures Rate for Purge section scrolls fully into view above floating bottom tab bar
- **Gradient overlay obstruction**: App-wide scroll fade overlay in `App.tsx` (z-index 100) now conditionally hidden with `{!showAlbumDetail && ...}` — prevents gradient from sitting on top of album detail sheet (z-index 70)

### Styling & UI Fixes

- `text-wrap: pretty` applied unlayered in `theme.css` targeting `p`, `li`, `span`, `h1`–`h6`, `label`, `td`, `th`, `figcaption`
- Album artwork thumbnails in `album-list.tsx` increased from `w-12 h-12` (48px) to `w-16 h-16` (64px) across all list view instances
- iOS-style alphabetical index sidebar added to `album-list.tsx` (mobile only, `lg:hidden`) for artist/title sorts with scrub-to-scroll, `env(safe-area-inset-right)` safe area handling, and conditional right padding

### Guidelines Updated

- Album Detail section (§2) fully rewritten with new content order, accordion pattern, and bottom sheet fixes
- New section 4c (Session Picker) added with full spec
- Section 4b (Saved for Later) updated to reflect accordion-based entry point
- List view description updated with 64px thumbnails and alphabetical index sidebar
- Icons section updated with intentional fill exceptions (Bookmark saved state, Zap priority state) and `Coins` canonical icon assignment
- Component map updated with `accordion-section.tsx` and `session-picker-sheet.tsx`
- Version updated to v0.2.2

### Known Gaps (Not Addressed)

- Alphabetical index sidebar only wired into Collection screen (`crate-browser.tsx`), not yet into wantlist, purge tracker, or following screens
- Desktop Session Picker renders centered rather than anchored near the clicked bookmark icon (anchor positioning unimplemented)
- `Coins` icon established as canonical for value UI but not yet adopted in `reports-screen.tsx` Collection Value section header or `crate-browser.tsx` title bar value display

---

## v0.2.1 — Post-Duplication Audit (Feb 2026)

**This version was created by duplicating the previous development file for versioning purposes.** The audit below documents the current state of the app at the time of duplication and all housekeeping changes made.

### Guidelines & Documentation

- **Updated `/guidelines/Guidelines.md`** — comprehensive corrections to align documentation with current code:
  - Color token tables updated to match actual values in `theme.ts` (light mode `--c-text-muted` was `#9BA4B2`, now correctly `#6B7B8E`; `--c-text-faint` was `#BAC2CB`, now `#8494A5`; dark mode equivalents also corrected)
  - Added missing tokens to both light and dark tables: `--c-surface-hover`, `--c-surface-alt`, `--c-text-tertiary`, `--c-input-bg`, `--c-card-shadow`
  - Bottom tab bar specs corrected: height `60px` (was `64px`), gradient is fully opaque `rgb()` (was `rgba()` with `backdrop-filter: blur`), margins corrected to `10px` side / `12px` bottom (was `12px` / `20px`)
  - Mobile nav order corrected to: Feed (Newspaper), Collection (Library), Wants (Heart), Sessions (Headphones), Insights (BarChart3) — Feed icon was listed as "Home", now correctly "Newspaper"
  - Version number updated to `v0.2.1` (was `v0.1.3`)
  - Toast notification docs expanded to describe the semantic color-coding system (success/green, error/pink, warning/yellow, info/blue) using Sonner's `richColors` mode
  - Sessions empty state subtext updated to include "Set the order before the needle drops."
  - Added 6 missing components to the component map: `splash-screen.tsx`, `splash-video.tsx`, `connect-discogs-prompt.tsx`, `create-account-screen.tsx`, `sign-in-screen.tsx`, `no-discogs-card.tsx`
  - Added new "Onboarding / Splash Flow" section documenting the `splashView` state machine, forced dark mode, video backgrounds, Dev Mode shortcut, and in-app connect flow
- **Consolidated guidelines** — moved the updated living reference from `/Guidelines.md` (root) into `/guidelines/Guidelines.md`, replacing the outdated original v2 brief that was there previously. There is now a single guidelines file at `/guidelines/Guidelines.md`.
- **Created `/CHANGELOG.md`** — this file

### File Organization

- All 27 app components are clearly named and actively used
- No duplicate components found — each has a single purpose
- Internal code identifiers (`friends`, `Friend`, `addFriend`) intentionally retained for code continuity per Guidelines policy; all user-facing strings correctly read "Following"
- Logo SVG asset (`/src/imports/svg-uhymsl4ur0.ts`) confirmed present and imported by `connect-discogs-prompt.tsx`
- Fonts confirmed: Bricolage Grotesque + DM Sans via Google Fonts in `/src/styles/fonts.css`

### Orphaned Files (Not Removed — Noted for Awareness)

- `/src/app/components/ui/` — Contains ~40 scaffolded shadcn/ui component files (accordion, alert, badge, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input-otp, input, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toggle-group, toggle, tooltip, use-mobile, utils). **None of these are imported by any app component.** They are dead code from the initial project scaffold. Left in place because they don't affect the build (tree-shaking excludes them) and removing them is cosmetic. The `sonner.tsx` wrapper is particularly notable — the app imports directly from the `sonner` package, not from this UI wrapper (which also references `next-themes`, a package not used in this app).

### Navigation & Flow Verification

All critical navigation paths confirmed intact in code:
- Splash screen → Create Account, Sign In, Connect Discogs Prompt, Dev Mode shortcut
- Holy Grails logo tap → Feed screen (via `onLogoClick` in `WordmarkLogo`)
- Users icon (multi-user) → Following screen
- UserRound icon (single-user) → Settings screen (or user avatar when synced)
- All 5 bottom tab bar items: Feed, Collection, Wants, Sessions, Insights
- Desktop top nav: Feed, Collection, Wants, Sessions | Logo | Purge, Insights, Following, Settings
- In-app "Connect Discogs" requests from `NoDiscogsCard` and Feed empty state re-trigger onboarding

### Screen States Verified

- **Feed**: Populated state (with data) and empty/no-Discogs state (shows `NoDiscogsCard`)
- **Following**: Empty state (connect form) and populated state (user list + profile view)
- **Splash**: Default state with Dev Mode shortcut; all 4 views (splash, connect-prompt, create-account, sign-in-email)
- **All tab screens**: Empty states present when `albums.length === 0`
- **All splash/auth screens**: Force `isDarkMode={true}` regardless of user preference

### Ready for Next Feature

The codebase is clean and stable. The next planned feature is **"Saved for Later"**. No outstanding issues block development.

---

## Pre-v0.2.1 Development History

Comprehensive development history is documented in the background section of the project prompt. Key milestones include:

- Initial implementation from Figma Prototype Brief (v2)
- Four view modes (Grid, Bento, List, Swiper/Crate Flip)
- Purge tracking system with centralized color module
- Last-played tracking with "Play Not Recorded" language rule
- Following system (formerly "Friends")
- Feed screen as home base with dynamic headlines
- Reports & Insights dashboard with recharts
- Desktop layout overhaul: sidebar replaced with horizontal top nav
- Mobile UI chrome overhaul: floating pill bottom tab bar
- Onboarding flow: Splash, Create Account, Connect Discogs, Sign In
- Toast notification color-coding by semantic type
- Custom logo SVG with click-to-spin animation
- Fullscreen video backgrounds on splash/auth screens
- Text contrast audit, styling parity audit, dark mode audit
- Developer/QA reset buttons in Settings