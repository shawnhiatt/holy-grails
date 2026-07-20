# Holy Grails — Hygiene Audit, July 2026

**Scope:** everything shipped since `AUDIT-2026-07.md` (v0.5.6 → v0.6.0 + unreleased all-formats and gray-retheme work). Design-token drift, deprecated/dead code, copy consistency, and doc-vs-code mismatches. **Nothing in this document has been changed in code** — findings only, each with the execution path for a future session.

**Baseline at audit time** (branch `claude/holy-grails-review-planning-l7ikvw`, commit `b7897ce`):
`npm run typecheck` ✓ clean · `npm run lint` ✓ 0 errors, 14 warnings (all `react-hooks/exhaustive-deps`, the documented backlog) · `npm test` ✓ 102/102.

The lint-enforced guardrails (Phosphor imports, storage whitelist, discogs.com hrefs, `Math.random` shuffles, `h-screen`) all hold — those categories were verified by the passing lint run and are not re-listed below.

---

## Ranked findings

### H1 — Installed PWA is still navy: manifest colors missed the gray retheme

The v0.7 gray retheme replaced the navy surface family everywhere in app code, but the PWA shell wasn't updated:

- `public/site.webmanifest` — `"theme_color": "#0c284a"` and `"background_color": "#0c284a"` (retired navy). The installed PWA's launch background and Android status chrome still paint navy before the app renders.
- `index.html:12` — the light-scheme `<meta name="theme-color">` is `#0C284A`.

**Fix:** set manifest `background_color` to the dark canvas (`#0A0B0C` family) or light canvas depending on intent, `theme_color` per scheme, and the light meta to the retheme's light chrome value. One-file-each change, no deploy ordering concerns. This is the most user-visible finding in the audit.

### H2 — Two `rgba(19,43,68,…)` navy leftovers in app code

The retired navy family survives as dark-mode avatar borders:

- `src/app/components/feed-screen.tsx:1120` — `border: 2px solid rgba(19,43,68,0.65)` (dark)
- `src/app/components/following-screen.tsx:1848` — same value

**Fix:** replace with a `--c-border-strong` token reference or an Oklab derivation from the `#14171D` anchor, per Color System rule 1/5.

### M1 — Dead shadcn-era token block in `theme.css` (~65 lines)

`src/styles/theme.css:14–78` still carries the full shadcn/ui token layer: `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive: #DC2626`, `--input`, `--switch-background: #BAC2CB`, `--ring`, `--chart-1..5`, `--radius`, plus the entire `@theme inline` mapping block. Grep confirms **zero component consumers** — no `var(--card)` etc., no `bg-primary`/`text-foreground`-style utility classes anywhere in `src/`.

Only three internal uses keep it alive:
- `theme.css:82` — `outline-color` uses `--color-ring`
- `theme.css:93` — `body` color uses `--color-foreground`
- `--font-weight-medium/normal` used by the base `h4`/`label`/`button`/`input` rules

Also dead: `theme.css:1` `@custom-variant dark (&:is(.dark *))` — dark mode is JS-driven and no `.dark` class is ever set on the tree (`src/styles/index.css:7` says so itself). `--font-family-sans`/`--font-family-display` map to `font-sans`/`font-display` utilities that no component uses.

**Fix:** repoint the three internal consumers at `--c-*` tokens (outline ring → a link/accent token decision, body color → `var(--c-text)`), inline the two font weights, then delete lines 14–78 and line 1. Pure CSS change; verify with a visual pass since `#DC2626`-red never renders anywhere today, nothing should shift.

### M2 — `tw-animate-css` is a dead dependency

`package.json` ships `tw-animate-css`, imported once at `src/styles/tailwind.css:4` — but no `animate-in`/`animate-out`/`fade-in`/`slide-in-*`/`zoom-*` class appears anywhere in `src/`. It's a shadcn-era leftover (it shipped alongside the removed `ui/` directory). Every user downloads its CSS for nothing.

**Fix:** remove the import line and `npm uninstall tw-animate-css`. Check the built CSS size before/after to confirm the win.

### M3 — Legacy Convex schema fields: a deletion schedule

All documented as legacy in CLAUDE.md; none are load-bearing for new writes. Grouped by when they can actually go (every one is a schema change → `npx convex deploy` on **both** deployments, and each should be its own session):

| Field(s) | Where | Safe to delete when |
|---|---|---|
| `users.session_token`, `users.session_created_at` + the `by_session_token` index and the legacy fallback in `authHelper.ts:24–56` | `convex/schema.ts:30,54` | ~October 2026 — 90 days after the `auth_sessions` migration (v0.6.0, July 2026), when every legacy single-token session has aged past `SESSION_TTL_MS`. Check prod for any user rows still lacking an `auth_sessions` row first. |
| `collection.marketValue`, `collection.marketValueFetchedAt`, `users.market_cursor` + the migration read in `market_values.ts:38` | `convex/schema.ts:51,161` | Once the one-time `seedFromCollection` migration is confirmed complete in **prod** (every legacy per-user value has a `market_values` row). Verify in the Convex dashboard, then drop the fields and the migration branch. |
| `preferences.hide_gallery_meta` | `convex/schema.ts:202`, plus write plumbing at `convex/preferences.ts:25,48–49,67` | Now. The swiper view and its Settings toggle are gone; nothing reads it. Delete the schema field and the three plumbing sites together. |
| `collection.pricePaid` | `convex/schema.ts:143` + ~10 plumb-through sites (`convex/discogs.ts:246,350,944`, `convex/collection.ts:38,91,123,145,327,359`, `app-context.tsx:648,1219,1250`, `discogs-api.ts:33`, `following-screen.tsx:98,1525`, test factories) | Decision needed. It is schema-**required**, always `""`, and the Spending feature built on it was deleted. Either drop it end-to-end (larger diff, cleanest) or leave it as documented-dead (current state). If kept, nothing further; if dropped, note the `stacks.test.ts:67` fixture also fakes a value. |

### M4 — Surface-tinting rule violations (Color System rule 5)

- `src/app/components/following-screen.tsx:841` and `:891` — `rgba(255,255,255,0.03)` / `rgba(22,24,28,0.03)` as row/chip surface tints. Should be tokens or Oklab derivations from the nearest surface.
- The broader `rgba(255,255,255,…)` population (~48 sites after excluding obvious scrims) is dominated by **legitimate** image-overlay/lightbox contexts (`album-detail.tsx` lightbox controls, gradient scrims) which rule 5 explicitly exempts. Only the two sites above are clear violations; a future audit pass can triage the remainder, but nothing else jumped out.

### L1 — Minor color-list stragglers

- `src/app/components/purge-colors.ts:51` — light-mode "cut" text is `#9BA4B2`, a one-off gray that's on no permitted list (the v0.6.x audit migrated this hex out of `crate-browser.tsx` but this site remained). Candidate: `var(--c-text-tertiary)`-family token or add to the permitted purge palette explicitly.
- Detached components hardcode more than the documented surface pair: `#333941`/`#2A2E36`/`#191C22`/`#E2E8F0` appear as border/chip/text equivalents in `slide-out-panel.tsx:238`, `purge-tracker.tsx:231–241`, `add-albums-drawer.tsx:516`, `stack-picker-sheet.tsx:173`, `wantlist-crossover-prompt.tsx:61`. This is the same detached-context reasoning CLAUDE.md documents for `#181B21`/`#FFFFFF` — acceptable, but CLAUDE.md only blesses the surface pair. Either extend the documented exception to name these values or migrate them during the next token audit pass.

### L2 — Stale comment in `oauth-helpers.ts`

`src/app/components/oauth-helpers.ts:12` — "All persistent data lives in Convex — no localStorage is used anywhere." False since the session-token persistence and multi-account work (`hg_session_token`, `hg_accounts`, `hg_install_nudge_dismissed`). One-line comment fix.

### L3 — CLAUDE.md doc drift

- **File tree:** `private-data-card.tsx` (real, used by crate-browser and wantlist empty/private states) is missing from the File Structure listing.
- **Phantom action:** the "Self-operation username derivation" paragraph lists `proxyFetchCollection` among cross-user read actions — no such export exists in `convex/discogs.ts` (the real cross-user reads are `proxyFetchUserProfile`, `proxyFetchWantlist`, `proxyFetchUserCollectionPage`, `proxyFetchUserWantlistPage`).
- **Version labeling:** CLAUDE.md's header says v0.6.0 but describes the "v0.7 gray retheme" as shipped (it is, in code) — while `package.json` is `0.6.0` and **CHANGELOG.md has no retheme entry at all** (the `[Unreleased]` section covers only all-formats). The retheme is real, released-in-code, and invisible in the changelog. Fix: add the retheme to `[Unreleased]` and cut `0.7.0` covering retheme + all-formats when ready.

### L4 — Copy and naming: clean

Verified: no "Stacks" leaked into user-facing strings (Settings label maps `"stacks"` → "Sessions" correctly); no "want list"/"want-list" spellings; toast copy follows the `"[Title]" kept.` convention; ask-vs-value labeling holds in the Value sections. Zero `TODO`/`FIXME`/`HACK` markers in `src/` or `convex/` — genuinely unusual and worth keeping that way.

### L5 — Z-index registry: matches

All global-layer values in code match the CLAUDE.md hierarchy table. Remaining `z-10`/`zIndex: 1–3`/`z-20`/`z-40` uses are local stacking contexts as documented. (A comment in `discogs-search-sheet.tsx:209` mentions "z-130"/"z-85" — comment text only, not classes.)

---

## Execution checklist (one session each, roughly in order of value)

- [ ] **PWA/manifest retheme colors** — `site.webmanifest` + `index.html` theme-color metas (H1) and the two `rgba(19,43,68,…)` borders (H2). Small enough to be one session.
- [ ] **Delete the shadcn token block** in `theme.css` + `@custom-variant dark` (M1) and remove `tw-animate-css` (M2). Same session is fine — both are "remove dead styling layer."
- [ ] **Drop `preferences.hide_gallery_meta`** (M3, the "now" row). Schema change → `npx convex deploy` both deployments.
- [ ] **Changelog/version truth-up** — retheme entry in `[Unreleased]`, decide the 0.7.0 cut (L3).
- [ ] **CLAUDE.md corrections** — file tree, phantom `proxyFetchCollection`, oauth-helpers comment (L2/L3). Doc-only session.
- [ ] **October 2026: legacy session fields** — calendar item; verify prod, then delete fields + fallback (M3).
- [ ] **After prod migration check: legacy market-value fields** (M3).
- [ ] **Decide `pricePaid`:** drop end-to-end or keep documented-dead (M3).
- [ ] **Token stragglers** — `purge-colors.ts:51`, the two rule-5 tints, detached-component hex documentation (M4/L1). Fits the next dedicated color-audit pass.
