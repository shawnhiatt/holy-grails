# Standalone Discogs Search — Implementation Plan

**Status: planning only. No code changes yet.**

Goal: make Holy Grails fully self-sufficient so a user never needs to open the
Discogs app or website. Today the only way to add an album you don't already
own (or that no friend owns) is to leave the app, find it on Discogs, add it
there, and sync. This plan closes that gap with in-app Discogs database search.

---

## 1. Gap Analysis — What Still Requires Discogs Today

| Task | Covered in Holy Grails today? |
|---|---|
| Add arbitrary release to collection | ❌ Only via a followed user's copy (`ReleaseDetailPanel` → Add to Collection) |
| Add arbitrary release to wantlist | ❌ Same limitation |
| Check a record's value at the store | ❌ No per-release market data anywhere in the app (aggregate collection value only) |
| Edit condition / notes / folder | ✅ Album detail edit mode |
| Folder management | ✅ Settings → Tools → Folders |
| Remove from collection / wantlist | ✅ |
| Profile editing | ✅ `proxyUpdateProfile` |
| Collection value | ✅ |
| Browse artist/label discographies | ❌ — and stays out of scope (see §9) |
| Marketplace / selling | ❌ — explicitly out of scope |

The single missing capability is **search-to-add**: find any release in the
Discogs database and add it to collection or wantlist. Everything downstream
of that already exists.

---

## 2. API Foundation

### `GET /database/search` (the core new endpoint)

- **Auth required** (any authenticated user) — fits the existing OAuth proxy
  pattern perfectly. Counts against the shared 60 req/min limit.
- Free-text `q` plus fielded params: `artist`, `release_title`, `title`
  (combined "Artist - Title"), `label`, `catno`, `barcode`, `year`, `format`,
  `country`, `track`, `genre`, `style`.
- `type` param: `release`, `master`, `artist`, or `label`. We use `release`
  (Phase 1) and possibly `master` (Phase 2).
- Standard Discogs pagination (`page`, `per_page`).
- **Vinyl-only enforcement**: pass `format=Vinyl` on every search. Keep a
  client-side `formats`/format-string check as a safety net, mirroring the
  data-layer filter rule in CLAUDE.md.

Response caveats (from `docs/Discogs API V2 - Database.md` + live behavior):

- `title` is the combined **"Artist - Title"** string — split on the first
  `" - "` to populate `artist` / `title` separately.
- `year` is a **string** and may be absent → `Number(year) || 0`, then the
  standard `hasYear` guard everywhere it renders.
- `thumb` can be an **empty string**. Modern responses also include
  `cover_image` and `master_id` on release results — these are not shown in
  the 2014-era doc snapshot in `docs/`, so **verify against the live API
  during implementation** and fall back gracefully (`cover_image || thumb`,
  `master_id ?? 0`).
- `community.have` / `community.want` counts come free — nice row metadata.
- Complex queries can return `500 "Query time exceeded"` — needs a generic
  error state, not a crash.

### `GET /masters/{master_id}/versions` (core to the pressing picker)

Lists every pressing of a master, and critically, **filters server-side**:
`format=Vinyl`, `country`, `released` (year), and `label` are native query
params, plus `sort`/`sort_order` (`released`, `title`, `format`, `label`,
`catno`, `country`). A master with 302 vinyl pressings never has to be
loaded client-side — a filter tap is one request returning one short page.

- Per-version `stats.user.in_collection` / `in_wantlist` → "In Collection"
  badges in the picker come free.
- `pagination.items` gives the total pressing count for the picker header.
- The modern API also returns **filter facets** (available countries/years/
  labels with counts) on this endpoint — the 2014-era doc snapshot in `docs/`
  predates this, so verify against the live API. If present, filter chips
  build themselves; if not, derive options from loaded pages.
- Also relevant: `GET /masters/{master_id}` provides `main_release` — the
  canonical (usually earliest) pressing, used for the pinned "Original
  pressing" row in the picker.

### Already proxied, reused as-is

- `GET /releases/{id}` → `proxyFetchRelease` (enriched detail)
- `POST .../collection/folders/{id}/releases/{release_id}` → `proxyAddToCollection`
- `PUT /users/{u}/wants/{id}` → `proxyAddToWantlist`

---

## 3. Architecture

The guiding insight: **`ReleaseDetailPanel` already is the "add from outside
your collection" surface.** It takes a `FeedAlbum`, lazy-loads enriched data
via `proxyFetchRelease`, and has working Add to Collection / Add to Wantlist /
View Your Copy buttons. `App.tsx`'s sheet gate already opens on
`selectedFeedAlbum`. Search only needs to produce `FeedAlbum` objects and call
`setSelectedFeedAlbum` — zero new detail UI, zero context API changes.

### New Convex action — `proxySearchDatabase` (action #20, `convex/discogs.ts`)

```
args: { sessionToken, query, searchType?, page? }   // searchType: "master" | "release", default "master"
```

- Authenticates via `getUserCredentials`, signs with HMAC-SHA1, uses the
  existing `discogsFetch` (which already retries 429s honoring Retry-After).
- Appends `format=Vinyl&type={searchType}&per_page=25&page={page}`
  server-side — the client cannot opt out of the vinyl filter. `searchType`
  is validated against the two allowed values (`artist`/`label` search stays
  out of scope).
- Maps results **server-side** to a trimmed shape so the client payload stays
  small and the "Artist - Title" split lives in one place:

```ts
{
  results: Array<{
    release_id, master_id, title, artist, year,   // year already numeric
    thumb, cover,                                  // cover_image || thumb
    label, catno, country, format,                 // format: joined descriptions
    have, want,                                    // community counts
  }>,
  page, totalPages, totalItems,
}
```

### New Convex action — `proxyFetchMasterVersions` (action #21)

```
args: { sessionToken, masterId, page?, country?, year?, label? }
```

- Appends `format=Vinyl` unconditionally; passes filters through to the
  versions endpoint's native params; sorts `released asc`.
- Returns trimmed version rows (`release_id, title, format, label, catno,
  country, year, thumb, inCollection, inWantlist`) plus pagination totals and
  facets (if the live API provides them).
- A small `proxyFetchMaster` (or a `mainRelease` field folded into the first
  versions response) supplies `main_release` for the pinned row — decide the
  cheaper shape at build time.

### Client mapping → `FeedAlbum`

`FeedAlbum` needs `release_id, master_id?, title, artist, year, thumb, cover,
label, dateAdded`. Search results map 1:1; `dateAdded: ""` is safe —
`ReleaseDetailPanel` never reads it (verified: only `AlbumDetailPanel` renders
`dateAdded`, behind a truthiness guard).

### What does NOT change

- `app-context.tsx` public API — `addToCollection(releaseId)`,
  `addToWantList`, `setSelectedFeedAlbum`, `isInCollection`/`isInWants` (with
  `master_id` matching) are all sufficient as-is.
- `addToCollection` already inserts into local state + Convex collection cache
  with no full re-sync, defaulting to folder 1 (Uncategorized).
- Toast copy already follows the writing rules (`"[Title]" added.` /
  `"[Title]" added to Wantlist.`).

---

## 4. UX Design

### Entry points (no new nav tab — the 5-tab bar stays)

1. **Collection screen** — yellow Plus button in the MobileHeader, exactly the
   Variant C (Stacks) pattern: `w-8 h-8 rounded-full bg-[#EBFD00]`, wired via
   a context callback registered with the double-arrow pattern
   (`setOnAddRecord(() => () => setSearchOpen(true))`). Desktop: a button in
   the Collection screen's header area.
2. **Wantlist screen** — same Plus. One search flow serves both intents,
   since the detail panel offers both Add buttons.
3. **Empty states** — Collection and Wantlist empty states get a
   "Search Discogs" CTA (yellow CTA pattern).

### The search sheet

- Built on **`SlideOutPanel`** (per CLAUDE.md: use it for any new mobile
  panel/sheet). Title: **"Look It Up"** — lookup-first framing (see §6);
  adding to collection/wantlist is an action inside the detail panel, not the
  frame of the feature. Desktop: same panel pattern as the
  stack picker's desktop variant, or a modal — decide at build time by
  matching `add-albums-drawer.tsx`.
- **Sticky search input** at top (mirrors add-albums-drawer): 16px font
  (iOS zoom rule), placeholder `"Artist, title, catalog #"`.
- Results list reuses the list-row idiom: 48px `thumb`, title/artist with
  inline-style truncation, meta line `catno · country · year` (with `hasYear`
  guard via `visibility`), `have/want` counts optional and muted.
- **Badges**: "In Collection" check and filled heart via `isInCollection` /
  `isInWants` with `master_id` matching — build `ownMasterIds`/`wantMasterIds`
  Sets like Feed/Following do.
- Tap a master row → **drill into the pressing picker** (see below), a second
  view inside the same sheet with a back button — no new z-index layer.
- Tap a pressing → map to `FeedAlbum` → `setSelectedFeedAlbum(...)` →
  `ReleaseDetailPanel` opens above the sheet (z-[120] > z-[85]). After a
  successful add, badges update reactively since collection state changed.

### The pressing picker (drill-in view)

Albums like *Let It Bleed* have ~300 vinyl pressings — a flat release list is
unusable for them. Discogs' own UI answers this with a master card + a
filterable versions table; the picker is the mobile-native mirror of that.

- **Header**: thumb + album title + "{N} pressings" (from
  `pagination.items`). Back chevron returns to search results.
- **Pinned first row — "Most collected pressing"**: visually distinguished.
  Covers the "I just want this album, any version" intent in one tap (the
  wantlist is release-based, so *some* release must be chosen). API
  constraint: the versions endpoint cannot sort by community have-count, so
  pick the max `stats.community.in_collection` across the first 1–2 loaded
  pages (exact for masters with ≤50 pressings; approximate beyond that, which
  is fine — dominant pressings surface early). Fall back to the master's
  `main_release` if stats are missing.
- **Filter chips**: Country, Year, Label — each applies server-side via the
  versions endpoint's native params (one request per change, never filtering
  302 rows client-side). Options from filter facets if the live API provides
  them, else derived from loaded pages. Active chip styling follows the
  existing active-filter-chip pattern.
- **Sort**: `released asc` (original first). No sort UI in Phase 1.
- **Rows**: thumb, format descriptions (e.g. "LP, Album, Stereo, Terre Haute
  Pressing"), label – catno, country, year, "In Collection" badge from
  `stats.user`. These are exactly the fields that distinguish pressings.
- **Pagination**: "Load more", 25/page.

### Escape hatches the master flow serves poorly

- **"I'm holding this exact pressing"** — catalog # / barcode queries should
  hit release search directly and skip the master hop. Cheap heuristic: if
  the query is digit-heavy or matches a catno shape, run a release search
  (or run both and show a "Pressings" result group). Exact-identifier queries
  return few results, so noise isn't a concern.
- **Releases with no master** (`master_id` = 0 — bootlegs, some singles,
  regional oddities) are invisible to `type=master` search. When master
  results are empty or thin, show a "Search pressings instead" fallback that
  reruns the query as `type=release`.
- **Search behavior**: debounce ~500 ms, minimum 3 characters, stale-request
  guard (`let stale = false` + cleanup — the established pattern), `Disc3`
  spinner while in flight, "Load more" button for pagination (25/page).
- **Session cache**: module-level `Map<string, SearchPage>` keyed by
  `query|page`, matching the `releaseDataCache` pattern. No Convex
  persistence — search results are ephemeral.
- **Empty state**: `No matches.` **Error state**: `Search failed. Try again.`
  (voice rules: short, no exclamation points).

### Z-index

Reuse the **z-[85] sheet / z-[80] backdrop** slot (stack picker and Add
Albums drawer live there; all three are mutually exclusive). Album detail
sheet (z-[120]) and its backdrop (z-[110]) correctly layer above. Add the new
component to the Z-Index Hierarchy table in CLAUDE.md at rollout.

---

## 5. Release-Level vs Master-Level Search

**Recommendation: master-first search with the pressing picker, in Phase 1.**

An earlier draft of this plan recommended a flat release list for the MVP.
The *Let It Bleed* case killed that: ~302 vinyl pressings of one album would
flood the results for exactly the classic records people search for most. A
flat list only works for obscure titles; the master → picker flow works for
both, and the versions endpoint's server-side filtering keeps it cheap.

How each collector intent routes:

| Intent | Path |
|---|---|
| "Add this album" (most common) | Master row → picker → pinned "Original pressing" or a filtered pick |
| "Add the exact pressing in my hand" | Catno/barcode query → direct release search, no master hop |
| "Want it, any version" | Master row → picker → pinned "Original pressing" → Add to Wantlist |
| Masterless oddities | "Search pressings instead" fallback (`type=release`) |

**"Other pressings" inside `ReleaseDetailPanel` moves to Phase 2** — same
`proxyFetchMasterVersions` action, second consumer. It helps the
followed-user flow too: a friend owns the UK pressing, you own the US one —
jump to your version before adding.

---

## 6. The Record-Store Lookup (the real headline use case)

The most common reason a collector opens Discogs in the wild is not adding —
it's standing in a record store checking what a record is worth against the
sticker price. The search flow above already does the finding; the missing
piece is **per-release market value in `ReleaseDetailPanel`**.

**Correction to earlier drafts / CLAUDE.md:** CLAUDE.md references
`market-value.tsx`, `proxyFetchMarketData`, and `MarketData` /
`ConditionPrice` / `MarketplaceStats` types as existing. **None of these are
in the codebase** — only the aggregate `CollectionValue` exists. The lookup
feature builds per-release market data fresh; CLAUDE.md's stale references
should be corrected at rollout.

### Two tiers of value data (verified against `docs/` API reference)

**Tier 1 — available to every authenticated user, zero extra requests:**
`/releases/{id}` already returns `lowest_price` and `num_for_sale`, and
`proxyFetchRelease` already calls it — it just drops those fields today.
Extend its return shape and the detail panel can always show:

> **Lowest listed: $22.50 · 58 for sale**

**Tier 2 — condition-tiered price suggestions (the true sticker-price
comparison):** `/marketplace/price_suggestions/{release_id}` returns a
suggested price per condition grade ("VG+ → $28"), which is exactly the
store question. **Caveat: it requires the user to have filled out Discogs
seller settings**; users who never sell get nothing back. New action
`proxyFetchMarketData` (#22) wraps it (optionally alongside
`/marketplace/stats` for buyer-currency-correct lowest price). On 403/empty,
the section silently shows Tier 1 only — no error state, no nag to configure
seller settings.

### Value section in `ReleaseDetailPanel`

- New "Value" section in the panel body (below Community, mirroring where
  CLAUDE.md's section order expects market value to live in
  `AlbumDetailPanel`). Lazy-loaded on panel open with the skeleton pattern;
  session-scoped in-memory cache keyed by `release_id`, like
  `releaseDataCache`.
- Condition rows use the `conditionGradeColor` spectrum from
  `src/lib/condition-colors.ts` (the established rule: never re-declare).
- Currency follows the user's Discogs settings by default (`curr_abbr`
  available if this ever needs a control — not in scope).
- Once built, the same section can later serve `AlbumDetailPanel` ("what's my
  copy worth") and `WantItemDetailPanel` — separate decision, not part of
  this feature.

### Store-speed implications elsewhere in the plan

- **Entry point**: at the store, the flow must be reachable the moment the
  app opens. Recommend the Feed header (MobileHeader Variant A) gains a
  Search icon next to the Users icon → one tap from cold open. The
  Collection/Wantlist Plus buttons remain the add-framed entries.
- **Pressing accuracy matters more**: the value of a UK first pressing vs. a
  70s reissue differs by an order of magnitude — which the pressing picker's
  catno/country/year rows already handle. This is another argument for
  master-first + picker over a flat list.
- **Barcode scanning gets more weight**: typing a barcode works day one
  (digit-heavy query → direct release search — barcodes are on most post-70s
  sleeves and identify the exact pressing). The camera scanner (Phase 3)
  becomes more attractive for store use, but the iOS `BarcodeDetector` gap
  and new-dependency rule still apply — same decision as before, higher
  stakes.

---

## 7. Rate Limiting & Failure Modes

- Search shares the 60 req/min budget with sync. Debounce + 3-char minimum
  keeps a typical search session to a handful of requests.
- `discogsFetch` already retries 429 twice honoring `Retry-After`; if retries
  exhaust, surface the generic error state — don't queue.
- Searching mid-sync may be slow (sync paces at ~54 req/min). Acceptable; the
  spinner covers it. No special handling in Phase 1.
- Discogs `500 Query time exceeded` on gnarly queries → same error state.
- Market value adds at most one extra request per detail-panel open (Tier 1
  rides free on `proxyFetchRelease`; Tier 2 is one `price_suggestions` call,
  cached per session).

---

## 8. Phasing

**Phase 1 — MVP (likely two focused sessions: backend + sheet, then picker
polish)**
- `proxySearchDatabase` + `proxyFetchMasterVersions` in `convex/discogs.ts`
  (+ `npx convex deploy`)
- `discogs-search-sheet.tsx` (SlideOutPanel-based): master search results +
  drill-in pressing picker with pinned "Original pressing" row and
  Country/Year/Label filter chips
- Catno/barcode heuristic → direct release search; "Search pressings instead"
  fallback for masterless releases
- Plus-button entry points on Collection + Wantlist headers (mobile variant
  wiring in `navigation.tsx`, context callback, desktop buttons) + Search
  icon in the Feed header for store-speed lookup
- Empty-state CTAs
- Handoff to `ReleaseDetailPanel` via `setSelectedFeedAlbum`
- **Value section**: extend `proxyFetchRelease` with
  `lowest_price`/`num_for_sale` (Tier 1) + `proxyFetchMarketData` (#22) for
  condition-tiered suggestions (Tier 2, silent fallback without seller
  settings)

**Phase 2 — Pressings everywhere + refinements**
- "Other pressings" section in `ReleaseDetailPanel` / `WantItemDetailPanel`
  (second consumer of `proxyFetchMasterVersions`)
- Fielded search refinements (explicit catno / barcode / year chips)
- Sort control in the picker if oldest-first proves wrong in practice

**Phase 3 — Barcode scanning (optional, needs a decision)**
- Typing a barcode into the search box already works in Phase 1 (Discogs
  matches digit strings well; a dedicated `barcode=` param exists).
- A camera scanner is genuinely useful in a record store, but the native
  `BarcodeDetector` API is Chromium/Android-only — **iOS Safari does not
  support it**, so the primary PWA platform would need a JS library (a new
  dependency, which CLAUDE.md requires flagging first). Recommendation: ship
  text barcode search, revisit the scanner as its own decision.

**Phase 4 — Add-time details (optional)**
- Folder/condition picker at add time. Recommendation: skip — default to
  folder 1 + the existing edit mode covers it. A post-add toast or "Edit
  details" affordance is a cheaper 90% solution.

---

## 9. Open Questions for Shawn

1. **Folder at add time** — keep "always Uncategorized, edit after" (current
   `addToCollection` behavior), or add a folder picker to the add flow?
   Recommend: keep, revisit in Phase 4.
2. ~~Search results default — flat release list vs master-grouped?~~
   **Decided: master-first with pressing picker** (the *Let It Bleed* ~302
   pressings case settled it). ~~Pinned row: original vs most collected?~~
   **Decided: most collected pressing** (max community have-count across the
   first 1–2 loaded pages; `main_release` fallback).
3. **Recent searches** — persist per-user in Convex, or session-only?
   Recommend session-only for MVP (no schema change).
4. ~~Feed entry point?~~ **Decided: yes** — the record-store lookup use case
   (§6) needs one-tap access from cold open. Search icon in the Feed header
   (Variant A).
5. **Value section reach** — once built for `ReleaseDetailPanel`, should the
   same section ship in `AlbumDetailPanel` ("what's my copy worth") and
   `WantItemDetailPanel` in the same phase, or later? Recommend later — keep
   the session focused per the one-concern rule.

---

## 10. Scope & CLAUDE.md Amendments at Rollout

CLAUDE.md currently lists **"Full Discogs database browsing (link out to
Discogs instead)"** as explicitly out of scope. Search-to-add is *not*
browsing — no artist pages, no label discographies, no marketplace — but the
scope line should be amended when this ships to avoid future confusion:

> Full Discogs database browsing (artist/label discographies) — link out.
> Database **search-to-add** is in scope.

Other CLAUDE.md updates at rollout:
- Proxy actions list: add `proxySearchDatabase` (#20),
  `proxyFetchMasterVersions` (#21), `proxyFetchMarketData` (#22) — and fix
  the count (the doc currently says both "18" and "19" in different places).
- **Correct the stale market-data references**: CLAUDE.md mentions
  `market-value.tsx`, `proxyFetchMarketData`, `MarketData`/`ConditionPrice`/
  `MarketplaceStats` types, and "MarketValueSection removed from
  WantItemDetailPanel and ReleaseDetailPanel" — none of this exists in the
  code today. Rewrite those references to describe what this feature actually
  ships.
- Z-Index Hierarchy table: add the search sheet at z-[85]/z-[80].
- File structure: add `discogs-search-sheet.tsx`.
- MobileHeader variants: document the Plus button on Collection/Wantlist and
  the Search icon on Feed (Variant A).
- `proxyFetchRelease` return shape: note the added `lowest_price` /
  `num_for_sale` fields.

Still explicitly out of scope, unchanged: marketplace/seller tools, listening
logs, native iOS, artist/label browsing, submitting releases to the Discogs
database, release ratings.
