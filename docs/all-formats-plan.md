# All Formats — Implementation Plan

**Status: planning only. No code changes yet.**
**Audience: an executing Claude Code session (Opus 4.8 or later). Written to be
followed phase by phase. Read CLAUDE.md first — this plan amends it.**

Goal: expand Holy Grails from vinyl-only to every media format Discogs
supports (CD, cassette, shellac, reel-to-reel, box sets, files, etc.). Today a
global filter (`formats[].name === "Vinyl"`, implemented as a substring check
on the flattened format string) discards non-vinyl items at the data layer, so
CDs and cassettes in a user's Discogs collection never reach the app.

This is a deliberate product-direction change by Shawn. It supersedes the
"Vinyl-Only Filter" section of CLAUDE.md, the CHANGELOG's "product decision"
note, and the vinyl-only enforcement rules in
`docs/discogs-standalone-search-plan.md`. Phase 5 updates those documents.

---

## 0. Open Decisions — Confirm With Shawn Before Executing

These are product/design calls, not engineering calls. Each has a
recommendation; do not silently pick differently.

| # | Decision | Recommendation |
|---|---|---|
| D1 | **All-formats always-on vs. per-user scope preference** | Store ALL formats in the Convex caches unconditionally; add a Settings preference `format_scope: "all" \| "vinyl"` applied at the client derive layer only. Default `"all"` (the expansion is the point). The preference makes the change reversible per user and cheap to ship — it's one `.filter()` at the existing derive site. |
| D2 | **Format visibility on cards** | Badge **non-vinyl only** — a small media-type chip (CD, Tape, …) on grid cards and list rows. Vinyl stays unbadged so the default aesthetic doesn't change for the 90%+ vinyl majority. Album detail already has a Format row; no change there. |
| D3 | **Cross-format `master_id` matching** | Keep as-is (format-agnostic). Owning the CD means "In Collection" lights up on a vinyl pressing of the same master. That is the honest semantic of master matching ("I have this album"). The pressing picker's per-version `inCollection` stats remain exact per release. |
| D4 | **Format Spotlight expansion** | Add media-type categories (CDs, Cassettes, Shellac/78s, Box Sets) to the existing vinyl-descriptor categories. The existing patterns (picture disc, colored, etched, 45 RPM…) only match vinyl descriptors, so they need no changes — they just stop being the whole list. Same 3-album eligibility floor. |
| D5 | **Look It Up scope** | Remove `format=Vinyl` from release search and from the pressing picker's versions call, and add a **Format facet chip** to the picker's filter row (the `/masters/{id}/versions` endpoint takes `format` natively, same as `country`/`released`/`label`). The picker's copy stays "pressings" — collector vernacular covers CD pressings fine. |
| D6 | **UX vocabulary** | Keep the vinyl voice ("crate", "grail", "pressing", "side A"). It's the brand, not a data constraint. Only copy that *asserts* vinyl-exclusivity changes (see §7 sweep list). The "plural of vinyl is vinyl" rule stays. |

---

## 1. Current State — Every Vinyl-Only Touchpoint

Verified against the codebase on 2026-07-11. The filter is a substring check:

```ts
// src/app/components/discogs-api.ts:127 (client)
// convex/discogs.ts:401 (server mirror — deliberate duplicate; Convex file
// keeps its own copy rather than importing from src/)
function isVinylFormat(format: string): boolean {
  return format.toLowerCase().includes("vinyl");
}
```

### Enforcement sites (the actual filter)

| Site | File | What it does |
|---|---|---|
| Own-collection sync | `convex/discogs.ts` (~line 885, in `syncSelf`) | `albums.filter(isVinylFormat)` before `collection.applyDiff` — non-vinyl never enters the Convex `collection` cache. The crossover-prompt release-id set (~line 939) and `albumCount` (~line 987) are built from the filtered array. |
| Followed-user sync | `convex/discogs.ts` (~line 1022, in `syncFollowedUser`) | Same filter before writing `followed_items` rows. |
| Client derive | `src/app/components/app-context.tsx:615` | `convexCollection.filter(row => isVinylFormat(row.format))` — safety net when deriving local `albums` from the cache subscription. |
| Release search | `convex/discogs.ts` (~line 1829, `proxySearchDatabase`) | Appends `&format=Vinyl` to `type=release` searches only (masters deliberately unfiltered — see comment there). |
| Pressing picker | `convex/discogs.ts` (~line 1890, `proxyFetchMasterVersions`) | Hard-codes `format=Vinyl` in the versions URL. This is the backstop that makes "nothing non-vinyl is ever addable" true today. |
| Format fallback | `convex/discogs.ts` (~line 336, `mapCollectionRelease`) | `format: formatParts.join("; ") \|\| "Vinyl"` — empty format strings default to "Vinyl". |

### Already UNfiltered (pre-existing inconsistencies — the expansion resolves them)

- **Own wantlist**: `fetchWantlistInternal` (`convex/discogs.ts:512`) captures no
  format field at all and applies no filter. A CD on the user's Discogs
  wantlist already shows in Holy Grails today.
- **Following feed**: `proxyFetchUserCollectionPage` / `proxyFetchUserWantlistPage`
  (~lines 1439/1486) return slim rows with no format field and no filter —
  followed users' non-vinyl pickups already appear in Feed activity.
- **Followed `followed_items` slim rows**: no format field (the *sync* filters,
  but the stored shape couldn't badge or re-filter).
- **Collection value** (`/users/{username}/collection/value`): Discogs computes
  this over the user's ENTIRE collection, all formats. The "Med. Value" stat
  has always included CDs. Going all-formats makes the app's item counts
  finally consistent with this number.
- **`sync_status` totals**: progress counts come from Discogs pagination
  (all formats), so "Syncing collection (150 of 300)" already counts CDs.
  After expansion the final album count matches the progress total.

### Consumers of the `format` string (need review, not necessarily changes)

- `album-detail.tsx` — Format `DetailRow` (renders raw string; fine as-is).
- `reports-screen.tsx` (~line 669) — By Format tab tokenizer: splits on `,`/`;`,
  strips a fixed word set including "Vinyl". See §5.3.
- `format-spotlight.tsx` — pattern list over format descriptors. See §5.4.
- `convex/discogs.ts` `proxyFetchRelease` — `isUnofficial` check (format
  description === "Unofficial Release") — format-agnostic already, no change.

### Tests & fixtures touching vinyl

- `src/app/components/discogs-api.test.ts` — `isVinylFormat` cases.
- `src/test/factories.ts` — `makeAlbum` default `format: "Vinyl, LP"`.
- `convex/stacks.test.ts`, `convex/market_values.test.ts` — fixture rows with
  `format: "Vinyl, LP"` (cosmetic; keep).

### Docs & copy asserting vinyl-only

- `CLAUDE.md` — "Vinyl-Only Filter" section + several passing references.
- `CHANGELOG.md:361`, `README.md`, `docs/BETA-PLAYBOOK.md`.
- `index.html:13` — meta description "…managing your vinyl collection."
- `docs/discogs-standalone-search-plan.md` — vinyl-only enforcement sections
  (historical plan; add a superseded note rather than rewriting).

---

## 2. Target Architecture

**Principle: the data layer stores everything; scope is a display concern.**

Today the filter lives at the data layer (sync + derive). After this change:

1. **Sync stores all formats.** `syncSelf` and `syncFollowedUser` stop
   filtering. The Convex `collection` / `followed_items` caches become
   faithful mirrors of Discogs (vinyl-only rows today simply gain siblings on
   the next sync — `applyDiff` adds them; no migration script needed).
2. **The client derive applies the user's `format_scope` preference** (D1) at
   the exact site the vinyl filter sits today (`app-context.tsx:615`). With
   `"all"` (default) the filter is a no-op; with `"vinyl"` it reproduces
   current behavior from richer data.
3. **`isVinylFormat` is replaced by `mediaType()`** — a shared classifier from
   the raw format string to a small UI bucket set (below). The raw string is
   never discarded; `mediaType` powers badges, the filter drawer, Reports
   By Format, and the `"vinyl"` scope check (`mediaType(f) === "Vinyl"`).

### `mediaType()` — format classifier

New pure function in `src/app/components/discogs-api.ts` (replacing
`isVinylFormat`), mirrored in `convex/discogs.ts` per the existing
deliberate-duplicate pattern (Convex file keeps its own copy; add a comment
on both pointing at the other, as `isVinylFormat` does today).

```ts
export type MediaType =
  | "Vinyl" | "Shellac" | "CD" | "Cassette" | "Tape"
  | "DVD" | "Blu-ray" | "Digital" | "Box Set" | "Other";

/** Classify a Discogs format string into a UI media-type bucket.
 *  First match wins — order matters (e.g. "Box Set" strings usually also
 *  name the medium, so the medium checks come first). */
export function mediaType(format: string): MediaType { … }
```

Mapping from Discogs format *names* (the first token of the flattened
string — `mapCollectionRelease` joins `formats[].name` + descriptors with
`"; "` per format and `", "` within):

| Bucket | Discogs format names |
|---|---|
| Vinyl | Vinyl, Flexi-disc, Lathe Cut, Acetate |
| Shellac | Shellac, Pathé Disc, Edison Disc, Cylinder |
| CD | CD, CDr, CDV, SACD, Minidisc |
| Cassette | Cassette, Microcassette, 4-Track Cartridge, 8-Track Cartridge, DCC, Elcaset, PlayTape |
| Tape | Reel-To-Reel, DAT, NT Cassette |
| DVD | DVD, DVDr, HD DVD, Laserdisc, VHS, CED, VHD |
| Blu-ray | Blu-ray, Blu-ray-R, Ultra HD Blu-ray |
| Digital | File, Memory Stick, Floppy Disk |
| Box Set | Box Set (when no medium name present) |
| Other | anything unmatched, Hybrid, All Media |

Implementation notes:
- Match against lowercase substrings of the format string, medium names
  before "Box Set"/"All Media" (a "Box Set; Vinyl; LP" string is Vinyl).
- Keep it forgiving: unmatched → `"Other"`, never throw.
- Empty string → `"Other"` (see the fallback change in §4.2).
- Full unit test coverage in `discogs-api.test.ts` (replaces the
  `isVinylFormat` describe block — do not just delete the old tests; port
  their cases: "Vinyl, LP, Album" → Vinyl, "CD, Album" → CD, etc.).

### Preference (D1)

- `preferences` table: add `format_scope: v.optional(v.string())` — same
  loose-string convention as `view_mode` (no enum, no schema migration pain).
  `undefined` reads as `"all"`.
- Settings screen: a "Formats" row (near the theme/view preferences) — two
  options, "All formats" / "Vinyl only". Copy stays short: label "Formats",
  helper line "What syncs from Discogs shows here." or similar per UX rules.
- `app-context.tsx`: thread `format_scope` through the preferences
  hydration path; apply in the collection derive:

  ```ts
  .filter((row) => formatScope !== "vinyl" || mediaType(row.format) === "Vinyl")
  ```

- The wantlist derive gets the same scope filter **once wantlist rows carry a
  format field** (§4.3). Until then, scope applies to collection only —
  matching today's asymmetry.

---

## 3. Phasing Overview

| Phase | Scope | Ships alone? |
|---|---|---|
| 1 | Data layer: stop filtering sync, `mediaType()`, scope preference, derive change | Yes — app looks identical for `"vinyl"` scope users; `"all"` users see new items with raw format strings in detail view |
| 2 | Look It Up: remove `format=Vinyl`, Format facet in the pressing picker | Yes |
| 3 | UI surfacing: format badges, filter-drawer Format section | Yes |
| 4 | Insights + Format Spotlight rework | Yes |
| 5 | Copy/docs/tests sweep, CLAUDE.md amendment | With or immediately after 1–4 |

One concern per session (CLAUDE.md rule 6): each phase is one session, in
order. Commit per phase. **`npx convex deploy` after any phase touching
`convex/` (phases 1 and 2) before pushing to Vercel** (rule 9).

---

## 4. Phase 1 — Data Layer

### 4.1 Remove the sync filters (`convex/discogs.ts`)

- `syncSelf`: delete the `vinylAlbums` filter line (~885); use `albums`
  directly for `applyDiff`, the crossover `collectionRids` set, and
  `albumCount`. Rename nothing else.
- `syncFollowedUser`: delete the filter at ~1022.
- Delete the server-side `isVinylFormat` (~401) and add the server mirror of
  `mediaType` (only if something server-side still needs classification —
  as of this plan nothing does after the filters are gone; if so, skip the
  mirror and note that in the CLAUDE.md update).

### 4.2 Format fallback

`mapCollectionRelease` (~336): change `formatParts.join("; ") || "Vinyl"` to
`formatParts.join("; ")` (empty string). The old fallback labeled unknown
formats as vinyl to survive the filter; with the filter gone it's just wrong
data. `mediaType("")` → `"Other"`. Check the Format `DetailRow` in
`album-detail.tsx` renders nothing/— for an empty string rather than a blank
row (follow the existing conditional-DetailRow pattern used for year).

### 4.3 Capture format on wantlist + followed_items (schema additions)

Both are additive optional fields — safe for Convex schema validation, no
backfill required (old rows read `undefined` → badge omitted).

- `wantlist` table + `fetchWantlistInternal` + `WantItem` type
  (`discogs-api.ts`) + the wantlist derive in `app-context.tsx`: add
  `format: v.optional(v.string())`, mapped from `bi.formats` the same way
  `mapCollectionRelease` builds it (extract that flattening into a small
  shared helper inside `convex/discogs.ts` rather than duplicating).
- `followed_items` rows + the `slim()` mapper in `syncFollowedUser` +
  `proxyFetchUserCollectionPage` / `proxyFetchUserWantlistPage` return shapes
  + `FeedAlbum` type: add optional `format`. The `following_feed` cache rows
  inherit it via the existing upsert path. The existing cache-migration
  pattern in `syncFollowingFeed` (`needsMasterIdMigration` /
  `needsWantsMigration` in `app-context.tsx` ~1618) shows how stale cached
  rows get refreshed — add a `needsFormatMigration` check mirroring it so
  cached feed entries without format re-fetch once.
- `proxyAddToWantlist` call sites insert into local state + wantlist cache —
  make sure the inserted row carries the format from the source
  (`FeedAlbum`/search result), not a hardcoded "Vinyl".

### 4.4 Client derive + preference

As specced in §2: `mediaType()` in `discogs-api.ts` (with tests),
`format_scope` in `convex/preferences.ts` + Settings row + derive filter.
The derive change replaces `isVinylFormat` at `app-context.tsx:615`; delete
the client `isVinylFormat` and its import.

### 4.5 Backfill behavior (no migration script)

The Convex caches contain only vinyl rows today. After deploy, each user's
**next sync** (24h TTL or manual SYNC) backfills non-vinyl rows via
`applyDiff`'s normal add path. Followed users backfill on their 24h
`followed_items` TTL / next profile open. Expect: a user with 300 vinyl + 200
CDs sees 300 until their first post-deploy sync, then 500. No action needed;
mention it in the changelog entry.

Knock-on effects (verify, no code expected):
- `market_values.seedFromCollection` (daily drip cron) will seed the new
  releases and start pricing them — `/marketplace/stats` works for all
  formats. More rows share the same `MARKET_BATCH_SIZE` daily budget, so
  time-to-first-price for new rows lengthens. Acceptable; no change.
- Purge tags / last-played / want priorities are keyed by `release_id` and
  simply never existed for non-vinyl rows — they start blank. Fine.
- Sessions (`stacks`) join albums from the collection cache — non-vinyl
  becomes addable to sessions automatically. Shared-session `getShared`
  whitelists title/artist/year/cover/thumb only; unaffected.

### 4.6 Phase 1 tests

- `mediaType` unit tests (port + extend `isVinylFormat` cases).
- Factories: keep `makeAlbum` default `"Vinyl, LP"`; add a couple of CD/
  cassette fixtures where new tests need them.
- If a preferences read/write path gains logic beyond pass-through, cover it;
  otherwise the existing preferences pattern needs no new tests.

---

## 5. Phases 2–4 — Search + UI

### 5.1 Phase 2: Look It Up (`convex/discogs.ts` + `discogs-search-sheet.tsx`)

- `proxySearchDatabase`: drop the `formatParam` (`&format=Vinyl`) from
  release searches; delete the vinyl-enforcement comment block (~1824).
  Master search is already unfiltered.
- `proxyFetchMasterVersions`: replace the hard-coded `format=Vinyl` with an
  optional `format` arg (`v.optional(v.string())`), appended when present —
  identical to how `country`/`year`/`label` already work. Omitted = all
  formats.
- Pressing picker UI: add a **Format** chip group beside the existing
  country/year chips inside the Filter disclosure. Facet values come from
  the same filter-facets payload the endpoint already returns (decode via
  the existing `decodeFacetValue`); if the API omits facets, fall back the
  same way the country/year chips do. Selecting a format refetches page 1
  server-side, matching the existing chip behavior exactly.
- The barcode flow needs no change (a scanned CD barcode now actually finds
  its release instead of returning nothing — free win). Update the scanner's
  code comment ("Vinyl barcodes are 1D EAN/UPC only" → media barcodes).
- Convex deploy required before the client change ships (the new optional
  arg is backward-compatible, so deploy order within the phase is safe).

### 5.2 Phase 3: format badges + filter drawer

- **Badge component**: a small chip rendering `mediaType()` output, shown
  only when the type is not `"Vinyl"` (D2). Match existing chip styling
  (`--c-chip-bg`, 10–11px uppercase like eyebrow labels). Apply to: grid
  cards (`album-grid.tsx` — respect the windowed-render structure; badge
  inside the existing card, no layout size change), list rows
  (`album-list.tsx`), wantlist cards, followed-profile views, and
  `ReleaseDetailPanel`'s pressing rows if the picker rows don't already show
  format (they show the format column from the versions payload — verify).
  Rows whose data predates the Phase-1 format fields (`format === undefined`)
  render no badge.
- **Filter drawer** (`filter-drawer.tsx` + `use-filtered-albums.ts`): add a
  Format section — chips per `MediaType` present in the collection (derive
  facets from `albums`, only render types with ≥1 item; hide the whole
  section when the collection is single-type, which keeps the drawer
  unchanged for all-vinyl users). Plumb `formatFilter: MediaType[]` (or
  single-select, matching however `activeFolder` behaves — the drawer's
  existing single-select folder pattern is the precedent; follow it) through
  `FilterAlbumsOptions` + `filterAndSortAlbums`, with pure-function tests in
  the existing `use-filtered-albums` test file. Chips use the active-filter
  chip colors from CLAUDE.md. Wantlist screen gets the same treatment only
  if its filter surface already exists — do not build a new wantlist filter
  UI in this pass.

### 5.3 Phase 4a: Reports "By Format" rework (`reports-screen.tsx` ~669)

Today's tokenizer strips "Vinyl" and shows descriptor tokens (LP, 12", 7",
Box Set). With mixed media that reads wrong (a CD's "Album" token is
stripped; "CD" would dominate meaninglessly next to "LP").

Rework: group by `mediaType()` first. If the collection is ≥90% one type
(typical), keep today's descriptor grid for that majority type and add a
one-line "plus N CDs, M cassettes" style footer; otherwise show a
media-type breakdown grid with the vinyl descriptor grid beneath it. Keep
the existing 2+ distinct types threshold semantics. This is the fuzziest
item in the plan — build it data-first and screenshot it for Shawn before
polishing.

### 5.4 Phase 4b: Format Spotlight (`format-spotlight.tsx`)

Add categories to the existing list (D4), e.g.:
`{ patterns: [/* mediaType-based, not substring */], header: "CDs" }`,
"Cassettes", "78s & Shellac", "Box Sets". The existing entries match
descriptor substrings; media-type categories should classify via
`mediaType()` instead of substrings (a "CD" substring would false-positive
inside other words). Keep the 3-album eligibility floor and rotation
behavior. Headers follow the existing plain-name convention.

Collection facts (`collection-facts.ts`): review "oldest pressing" — it can
stay (pressing is fine for CDs in collector speech per D6), but confirm the
year guard behaves with shellac-era years (it already filters year < 1900 in
reports; facts has its own gating — just verify, no change expected).

---

## 6. What Deliberately Does NOT Change

- **Purge workflow, sessions, following, last-played, priorities** — all
  keyed by `release_id`, format-agnostic already.
- **Condition grading** — Discogs uses the same M→P scale for all media;
  sleeve condition maps to case/J-card condition. `CONDITION_GRADES`,
  `condition-colors.ts`, and the Condition report stay untouched.
- **Value section rules** — unofficial-release suppression, Tier 1/Tier 2
  presentation, no outbound links: all unchanged and already format-safe.
- **The Disc3 spinner, vinyl brand voice, logo, Rock Salt moments** — brand,
  not data. Do not "de-vinyl" the aesthetic.
- **Multi-folder dedup (one copy per release)** — unchanged. Vinyl + CD of
  the same album are different release_ids, so both appear; that's correct.
- **Adaptive rate limiting / sync pagination** — same number of API pages;
  we just stop discarding rows. No budget impact.
- **Out-of-scope list** — marketplace tools, listening logs, database
  browsing: still out.

---

## 7. Phase 5 — Copy, Docs, Tests Sweep

- `CLAUDE.md`: replace the "Vinyl-Only Filter" section with a "Formats"
  section describing §2 (all formats at the data layer, `mediaType()`,
  `format_scope` display preference); update the Look It Up and
  `proxySearchDatabase`/`proxyFetchMasterVersions` descriptions; update the
  Reports By Format and Format Spotlight sections; keep the UX vocabulary
  rules. Search CLAUDE.md for "vinyl" and audit every hit.
- `index.html` meta description → "…managing your record collection." (or
  similar — Shawn approves final copy).
- `README.md`, `docs/BETA-PLAYBOOK.md` — same audit.
- `docs/discogs-standalone-search-plan.md` — add a header note:
  "Superseded in part by docs/all-formats-plan.md — vinyl-only enforcement
  removed."
- `CHANGELOG.md` — entry noting the backfill-on-next-sync behavior (§4.5).
- Lint/tests/typecheck green per phase (`npm run typecheck && npm run lint &&
  npm test`). No new lint rules needed; nothing in the guardrail set blocks
  this work.

---

## 8. Risks & Gotchas for the Executor

1. **Deploy ordering** (the classic failure): convex functions deploy before
   the Vercel client in phases 1–2. All new args/fields are optional, so a
   new server with an old client is safe; an old server with a new client is
   not. `npx convex deploy` targets prod — `npx convex dev` is NOT enough.
2. **Do not filter at write time anywhere.** If a review comment or old
   habit suggests re-adding a format check "for safety" in `applyDiff` or
   the derives, that recreates the bug class this plan removes. Scope is
   display-only (§2).
3. **`app-context.tsx` is load-bearing** (CLAUDE.md rule 8). The derive
   change is small and surgical — do not restructure the derive effect, and
   keep its public API identical.
4. **Windowed grid**: badges must not change card dimensions — the
   IntersectionObserver windowing and A–Z jump math in `album-grid.tsx`
   assume consistent card heights.
5. **Cached feed rows without `format`** will linger up to 24h (or until the
   migration check from §4.3 triggers). Badge code must treat missing format
   as "no badge", never as vinyl.
6. **`format_scope: "vinyl"` + Look It Up**: a vinyl-scoped user can still
   search and add a CD (search is global). Adding it succeeds on Discogs and
   in the cache, then the derive hides it locally — confusing. Guard: when
   scope is `"vinyl"`, keep the picker's Format facet pre-set to Vinyl
   (user can still change it, but then the add toast can say what happened —
   defer exact copy to Shawn). Cheapest acceptable v1: pre-set the facet and
   ship; do not build a warning system.
7. **Reports By Format** is the only genuinely open-ended design item (§5.3)
   — timebox it and screenshot for review rather than iterating blind.

---

## 9. Suggested Session Breakdown for Execution

1. **Session A (Phase 1)** — `mediaType()` + tests, sync filter removal,
   fallback fix, schema field additions, scope preference + Settings row,
   derive change. Convex deploy. Manual QA: sync a test account with CDs,
   confirm backfill + scope toggle.
2. **Session B (Phase 2)** — search/versions changes + Format facet chip.
   Convex deploy. QA: barcode-scan a CD, add it, see it in collection.
3. **Session C (Phase 3)** — badges + filter drawer. QA on iOS Safari
   (chip tap targets, windowed grid scroll).
4. **Session D (Phase 4)** — Reports By Format + Format Spotlight +
   collection-facts audit. Screenshot review with Shawn.
5. **Session E (Phase 5)** — docs/copy sweep, CLAUDE.md amendment,
   changelog.
