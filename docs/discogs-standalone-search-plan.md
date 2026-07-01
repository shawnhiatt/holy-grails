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

### `GET /masters/{master_id}/versions` (Phase 2)

Lists every pressing of a master. Supports `format=Vinyl`, pagination, and
per-version `stats.user.in_collection` / `in_wantlist` — ideal for both a
"pick your pressing" step and an "Other pressings" section in the detail
panel.

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
args: { sessionToken, query, page? }        // fielded params added in Phase 2
```

- Authenticates via `getUserCredentials`, signs with HMAC-SHA1, uses the
  existing `discogsFetch` (which already retries 429s honoring Retry-After).
- Appends `format=Vinyl&type=release&per_page=25&page={page}` server-side —
  the client cannot opt out of the vinyl filter.
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
  panel/sheet). Title: **"Add a Record"**. Desktop: same panel pattern as the
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
- Tap row → map to `FeedAlbum` → `setSelectedFeedAlbum(...)` →
  `ReleaseDetailPanel` opens above the sheet (z-[120] > z-[85]). After a
  successful add, the row badge updates reactively since collection state
  changed.
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

**Recommendation: Phase 1 ships release-level search (`type=release`).**

- *For*: a collector adding a record is usually holding a specific pressing —
  catno/barcode/year queries resolve to exact releases; results are directly
  addable with no second hop; zero extra API calls.
- *Against*: popular albums return dozens of pressings. Mitigated by showing
  `catno · country · year` on every row so pressings are distinguishable.

**Phase 2 adds the master layer where it pays off most** — an "Other
pressings" section inside `ReleaseDetailPanel` (fed by
`proxyFetchMasterVersions`, action #21). This helps beyond search: when a
friend owns the UK pressing and you own the US one, you can jump to your
version before adding. A full master-grouped search mode (search masters →
version picker) is optional after that and shouldn't block anything.

---

## 6. Rate Limiting & Failure Modes

- Search shares the 60 req/min budget with sync. Debounce + 3-char minimum
  keeps a typical search session to a handful of requests.
- `discogsFetch` already retries 429 twice honoring `Retry-After`; if retries
  exhaust, surface the generic error state — don't queue.
- Searching mid-sync may be slow (sync paces at ~54 req/min). Acceptable; the
  spinner covers it. No special handling in Phase 1.
- Discogs `500 Query time exceeded` on gnarly queries → same error state.

---

## 7. Phasing

**Phase 1 — MVP (one focused session)**
- `proxySearchDatabase` in `convex/discogs.ts` (+ `npx convex deploy`)
- `discogs-search-sheet.tsx` component (SlideOutPanel-based)
- Plus-button entry points on Collection + Wantlist headers (mobile variant
  wiring in `navigation.tsx`, context callback, desktop buttons)
- Empty-state CTAs
- Handoff to `ReleaseDetailPanel` via `setSelectedFeedAlbum`

**Phase 2 — Pressings**
- `proxyFetchMasterVersions` (action #21)
- "Other pressings" section in `ReleaseDetailPanel` / `WantItemDetailPanel`
- Fielded search refinements (explicit catno / barcode / year chips)

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

## 8. Open Questions for Shawn

1. **Folder at add time** — keep "always Uncategorized, edit after" (current
   `addToCollection` behavior), or add a folder picker to the add flow?
   Recommend: keep, revisit in Phase 4.
2. **Search results default** — flat release list (recommended) vs
   master-grouped with a version picker?
3. **Recent searches** — persist per-user in Convex, or session-only?
   Recommend session-only for MVP (no schema change).
4. **Feed entry point** — should the home feed also expose "Add a Record"
   (e.g. in the header or as a feed card), or is Collection/Wantlist enough?

---

## 9. Scope & CLAUDE.md Amendments at Rollout

CLAUDE.md currently lists **"Full Discogs database browsing (link out to
Discogs instead)"** as explicitly out of scope. Search-to-add is *not*
browsing — no artist pages, no label discographies, no marketplace — but the
scope line should be amended when this ships to avoid future confusion:

> Full Discogs database browsing (artist/label discographies) — link out.
> Database **search-to-add** is in scope.

Other CLAUDE.md updates at rollout:
- Proxy actions list: add `proxySearchDatabase` (#20) — and note the count
  (the doc currently says both "18" and "19" in different places; fix while
  in there).
- Z-Index Hierarchy table: add the search sheet at z-[85]/z-[80].
- File structure: add `discogs-search-sheet.tsx`.
- MobileHeader variants: document the Plus button on Collection/Wantlist.

Still explicitly out of scope, unchanged: marketplace/seller tools, listening
logs, native iOS, artist/label browsing, submitting releases to the Discogs
database, release ratings.
