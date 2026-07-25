# Session Builder — Implementation Plan

**Status: PHASES 1–6 SHIPPED (2026-07-25). Product decisions in §0 confirmed by
Shawn the same day. Phase 7 ("3 records joined Late Night Jazz") remains
deferred — it is the only part that genuinely needs stored state.**

**Deviations from the plan as written, all deliberate:**
- The pure evaluator needed `mediaType` and `hasRating`, which lived in the
  client-only `discogs-api.ts`. Rather than mirror them (CLAUDE.md contemplates
  a mirror; two copies of a classifier is a bug waiting for an untested format
  string), they moved whole into a new pure `convex/albumFields.ts` that
  `discogs-api.ts` re-exports — no import site changed. `seededShuffle` landed
  in `stackRules.ts` for the same reason, re-exported from `utils/shuffle.ts`.
- §3.1's rule shape is unchanged, but the engine reads a normalized `RuleAlbum`
  rather than `Album` or a Convex row directly: the two disagree on casing and
  on where purge tags and play history live, so each side adapts into one shape.
- Rating gets a dedicated `rateAlbum` context function rather than riding
  through `updateAlbum`'s `Partial<Album>` spread — clearing a rating can't be
  expressed as `rating: undefined` through that path, and the write is not
  optimistic (a star the server rejected must never appear).
- §10 Q1 answered as recommended: **global cap only**, no per-session override.
- §10 Q2: the rotation offset shipped at the proposed ~10h, unchanged.

**Audience: an executing Claude Code session. Written to be followed phase by
phase. Read CLAUDE.md first — this plan amends it (Sessions, Data
Architecture, Reports & Insights).**

**Deploy note: phases 1 and 3 touch `convex/` and require `npx convex deploy`
to prod before the Vercel client ships.**

Goal: let a session define itself by criteria instead of by hand-picking —
"jazz, before 1980, four stars and up" — and stay current as the collection
changes. Adding a record to the collection should drop it into every session
whose criteria it meets, with no user action and no background job.

The inspiration is Mailchimp's audience segmentation: a saved query over data
you already hold, not a list you push things into. That framing is the whole
design.

---

## 0. Product Decisions — CONFIRMED

Reviewed and approved by Shawn on 2026-07-25. Settled — execute as written.

| # | Decision | Approved approach |
|---|---|---|
| D1 | **Derived vs. materialized membership** | **Derived.** Store the rule, not the album ids. Membership is computed at read time from the live collection. This is what makes "new record joins automatically" free — `albums` in `app-context.tsx` already re-derives from the Convex `collection` subscription, so a rule evaluated in a `useMemo` updates the instant a sync lands. No cron, no recompute-on-write, no drift between rule and stored ids. |
| D2 | **No second object type** | There are just **Sessions**. Some are filled by hand, some fill themselves. The difference is a property, not a category — one list, one mental model, no fork at creation. Avoids the "Smart Folders" collision with VinylBox and the AI connotation of "smart" (this is saved logic, not intelligence). |
| D3 | **Vocabulary** | The mechanism is a **verb in the copy, not a noun in the taxonomy**: "This session fills itself." Badge in the list: **AUTO**. The creation sheet is the **Session Builder** (names a tool, not a thing). If a proper noun is ever needed, the reserve pick is **Standing Session** — not "smart" anything. |
| D4 | **Caps** | Sessions are listening sets, not query results. A cap is on by default, expressed in listening terms — **One sitting** (10) / **An evening** (25) / **A deep dig** (50) / **No cap**. Global default in Settings; per-session override behind the builder's advanced disclosure. |
| D5 | **Rotation** | When the matching pool meaningfully exceeds the cap, the selection **rotates** on a period (off / daily / weekly) via a *seeded deterministic* shuffle — same seed all period, new set next period. No stored state, no job, and it evaluates identically on client and server so share links stay consistent. Same trick as the Following screen's From the Depths (seeded per user + 12h bucket). "Rotation" is collector vernacular ("heavy rotation"), so the word is native rather than borrowed. |
| D6 | **Rotation default** | **On** for capped sessions, **off** when there is no cap — conditional on the disclosure in §5.3 shipping with it. On-by-default without disclosure is the worst combination; the toggle must also live in an easily-found Settings preference. |
| D7 | **Rotation threshold** | Rotation only engages when `pool >= cap * 1.5`. Below that it reshuffles nearly the same records and reads as random noise rather than freshness. |
| D8 | **Session titles** | **Generate a default, always; make it editable.** A required blank-name step is friction at the moment of excitement, and the generated name doubles as a readback that lets the user verify they built what they meant. It regenerates live while building, then freezes permanently the moment the user types their own. |
| D9 | **Free-data scope** | One mapper pass picks up everything the collection response already returns and the app currently discards: **genres, styles, rating, format qty, artist ids** — collection *and* wantlist. Zero extra Discogs requests. |
| D10 | **What that data earns** | Rating and genre/style get real UI surface (§8). Disc count and artist ids are taken but **not surfaced** — quiet infrastructure. Extra labels are skipped. Explicitly **cut**: a genre spotlight section on the feed (three collection-random sections already exist there and CLAUDE.md warns against stacking them). |

---

## 1. Why derived is the whole design

The instinct is to build a job: on sync, evaluate rules, write album ids into
the session. Don't. In Mailchimp a segment isn't a list things get pushed
into — it's a saved query that gets re-run, and membership is a consequence.

Going derived removes, rather than adds, machinery:

- **Auto-add is free.** No trigger, no cron, no write path.
- **No drift.** The rule is the only source of truth; stored ids can't go stale.
- **No write amplification.** A 3000-record sync doesn't rewrite every session.
- **No cross-device races.** Nothing to reconcile.

The cost is that contents aren't pinned — pull a record from the collection and
it leaves the session silently. For a self-filling session that is the correct
semantic, not a bug.

Performance is a non-issue: a handful of predicates over a few thousand albums
inside a `useMemo` is nothing.

The one consequence that *does* cost something is sharing — see §7.

---

## 2. Phase 1 — The free-data mapper pass

**This ships first, on its own, and is useful even if the builder never
ships.** It is a `convex/` change: deploy before the client.

### 2.1 What is being dropped today

Verified against `convex/discogs.ts` and
`docs/Discogs API V2 - User Collection.md` on 2026-07-25.

| Field | Where it arrives | Current handling | Value |
|---|---|---|---|
| `rating` | Top-level on the collection release object (API doc line 449) | **Declared on the `DiscogsRelease` interface at `convex/discogs.ts:138` and then never read** — the mapper return at line 329 omits it | The user's own 1–5 star rating. The single best session criterion available, and it unlocks four small surfaces (§8.1) |
| `basic_information.genres` | API doc line 484 | Not on the interface, not mapped | Session criteria, filter facet, Insights tab |
| `basic_information.styles` | API doc line 488 | Not on the interface, not mapped | **The more useful half** — "Hard Bop" and "Modal" are session-shaped in a way "Jazz" isn't |
| `basic_information.formats[].qty` | — | `flattenFormats` (`convex/discogs.ts:255`) keeps `name` + `descriptions`, drops `qty` | Disc count. A 2×LP is indistinguishable from a single. Take the data, build no UI (D10) |
| `basic_information.artists[].id` | — | Only names kept; `mapRelease` joins `anv \|\| name` | Exact artist matching instead of string-fuzzy. Discogs disambiguates with " (2)" suffixes that Insights already has to strip. Invisible infrastructure |
| `basic_information.labels[1..n]` | — | Only `labels[0]` survives | Skipped (D10) |

### 2.2 Changes

1. **`convex/discogs.ts`** — add `genres`, `styles`, `formats[].qty`,
   `artists[].id` to the `DiscogsRelease` and `DiscogsWant` interfaces
   (lines 139 / 161); map them plus the already-declared `rating` in
   `mapRelease` (return block at line 329) and the wantlist mapper
   (line 559 / 1582). `flattenFormats` is shared by both — extend it to
   carry qty, or return a structured disc count alongside the string.
2. **`convex/schema.ts`** — add to `collection` and `wantlist`, all
   `v.optional`: `genres` (`v.array(v.string())`), `styles`, `rating`
   (`v.number()`), `discCount` (`v.number()`), `artistIds`
   (`v.array(v.number())`).
3. **`convex/collection.ts` / `convex/wantlist.ts`** — carry the new fields
   through `applyDiff`, `addItem`, `updateInstance`.
4. **`discogs-api.ts`** — add the fields to `Album` and `WantItem`.

### 2.3 The rating-zero footgun

**`rating: 0` means *unrated*, not zero stars.** This is the same trap as
Discogs returning year `0`, which CLAUDE.md already codifies a `hasYear`
convention for. Give it the same treatment: optional field, `0` renders
nothing, and the rule engine exposes an explicit `unrated` operator rather
than letting anyone write `rating < 1`.

### 2.4 Backfill

None of this appears until each user re-syncs (24h TTL, or manual SYNC). The
all-formats change had the same property and CLAUDE.md accepts it — a missing
format badge is invisible.

**Here it has a sharper edge**: a session built on genre before the backfill
lands doesn't look stale, it looks *broken*. §6.2's "presets generated from the
actual collection" handles this for free — only offer a Jazz preset if the
collection actually has genre data. Build the builder that way deliberately,
not incidentally.

---

## 3. The rule model

### 3.1 Shape

```
rule = {
  match: "all" | "any",
  conditions: { field: string, op: string, value: ... }[],
  sort: string,
  limit?: number,
  rotation: "off" | "daily" | "weekly",
}
```

Keep `field` and `op` as loose `v.string()` inside conditions — the same call
CLAUDE.md already documents for `view_mode` (`v.optional(v.string())`, "adding
new values requires no schema change and no `npx convex deploy`"). A pure
validator **ignores conditions it doesn't recognize**: forward-compatible, and
an unknown field fails safe rather than throwing.

### 3.2 Fields available at v1

Free from the collection cache after phase 1, or already in context:

| Field | Ops | Source |
|---|---|---|
| `artist` / `artistId` | is, contains | collection cache |
| `title` | contains | collection cache |
| `label` | is, contains | collection cache |
| `year` | before, after, between, is | collection cache |
| `decade` | is | derived from year |
| `genre` / `style` | includesAny, excludesAll | **phase 1** |
| `mediaType` | is, isNot | `mediaType()` |
| `format` | contains | raw descriptor ("45 RPM", "Picture Disc") |
| `folder` | is, isNot | collection cache |
| `mediaCondition` | is, atLeast | ordered via `CONDITION_GRADES` |
| `rating` | atLeast, is, unrated | **phase 1** |
| `purgeTag` | is, isNot, untagged | Convex, already in context |
| `lastPlayed` | never, withinDays, notWithinDays | Convex, already in context |
| `playCount` | atLeast | Convex, already in context |
| `dateAdded` | withinDays, before, after | collection cache |
| `marketValue` | atLeast, atMost | drip; **sparse — gate the UI on it** |

**Deliberately out of scope**: country, tracklist, runtime, credits, community
rating. These come only from `/releases/{id}` — one request per release against
a 60/min budget. That is the market-value drip problem again, and it would mean
a second drip table. "Sessions under 40 minutes" is a lovely idea that costs a
whole subsystem.

### 3.3 Evaluation order

Specified precisely, because client and server must agree exactly (§7):

1. Filter the collection by `conditions`, honoring `match`.
2. Remove `excluded_ids`.
3. If `rotation !== "off"` **and** `limit` is set **and**
   `pool >= limit * 1.5`: seeded-shuffle by `stack_id + period bucket`, take
   `limit`. Otherwise: sort by `sort`, take `limit`.
4. Sort the resulting set by `sort` for display order.

Step 4 runs in both branches, so **rotation picks *which* records and the sort
rule always decides the *running order***. Keeping those independent means a
daily-rotating jazz session can still play oldest-first.

### 3.4 The seeded shuffle

`utils/shuffle.ts` has Fisher–Yates on `Math.random()`. Add a **seeded**
variant (mulberry32 or xmur3 — pure, ~10 lines, testable). Note that
`Math.random()` sort-shuffles are lint-banned; a seeded Fisher–Yates is the
correct addition, not an exception.

**Period bucket:** `floor((Date.now() - ROTATION_OFFSET_MS) / 86_400_000)` for
daily. A naive UTC-day bucket flips at 4–5pm US time — mid-evening, prime
listening, the worst possible moment for the set to change under someone.
Offset by ~10 hours so the flip lands in the early morning for the beta's
actual users, and keep it a named constant.

### 3.5 Where the evaluator lives

`convex/stackRules.ts` — **pure, no Convex deps**, following the
`marketValue.ts` / `admin.ts` / `coverIdentity.ts` precedent. Client already
imports across that boundary (`app-context.tsx:4`), so one implementation
serves the live view and the share link both. Unit-tested in the node
environment alongside `insights.ts` and `accounts.ts`.

---

## 4. Schema

No new table. Four optional fields on `stacks`, so every existing row reads as
a hand-filled session:

```
kind:         v.optional(v.union(v.literal("manual"), v.literal("auto")))  // undefined = manual
rule:         v.optional(v.object({ ... }))
excluded_ids: v.optional(v.array(v.number()))
name_generated: v.optional(v.string())   // see §6.3
```

`album_ids` stays required and is `[]` for an auto session — deliberately not a
cached materialization, so there is exactly one source of truth.

**Exclusions key on `release_id`**, matching `album_ids` semantics (note that
client-side `Stack.albumIds` is `string[]` and hydration maps
`s.album_ids.map(String)` at `app-context.tsx:838`).

Two new preference fields (`preferences`, both `v.optional(v.string())`, no
deploy needed per the `view_mode` precedent): `session_cap` and
`session_rotation`.

---

## 5. Caps and rotation

### 5.1 Cap tiers

Named in listening terms, not numbers: **One sitting** (10) · **An evening**
(25) · **A deep dig** (50) · **No cap**. Global default in Settings; the
per-session override sits behind the builder's advanced disclosure. Ship the
global first — it keeps the builder light, which matters more on mobile than
the flexibility does.

### 5.2 Settings

A new **Sessions** section in `settings-screen.tsx` holding both preferences —
default session length and rotation default. It sits alongside Gestures and
Formats, which is where someone already goes looking for this kind of toggle.
This section is a **precondition for D6** (rotation on by default).

### 5.3 Disclosure — required, not optional

Rotation on by default is only honest if it is stated up front. Three places,
all cheap:

1. **At build time**, once a cap is set and the pool clears the threshold, a
   live line under the match count: *"148 records match. This session plays 25,
   rotating daily."* — read before they ever hit save, as part of the readback
   they are already reading.
2. **On the session itself**, permanently: *"In rotation · 25 of 148."*
3. **In Settings**, per §5.2.

Without (2) especially, someone who saw a record in there yesterday and can't
find it today concludes the app lost it.

### 5.4 Freeze

"Freeze" materializes the current membership into `album_ids`, clears `rule`,
and the session becomes an ordinary hand-filled one. Nearly free to build, and
it earns a second job under rotation: *"I love today's roll — keep it."*

---

## 6. UI

### 6.1 Sessions screen

One list. Auto sessions carry an **AUTO** badge and, when rotating, the
"In rotation · N of M" line. The "+" offers **Add records** or **Set the
rules**.

Auto sessions must be **excluded as targets** in `stack-picker-sheet.tsx` and
in album-detail's "Add to a Session" section — you cannot hand-add to a query.
Show them locked with a one-line reason rather than hiding them, or the user
wonders where the session went.

### 6.2 The builder — two layers

A Mailchimp-style condition-row builder on a phone is punishing. So:

1. **Presets carry the 80%**, and are **generated from the actual collection** —
   only offer Jazz if he owns jazz, only offer star ratings if anything is
   rated. This is also what makes the phase-1 backfill invisible (§2.4).
   Candidates: "Never played", "Tagged Keep", "Four stars and up", "Recently
   added", "The 1970s", "Neglected favorites" (highly rated, not played in a
   year).
2. **Build your own** behind a disclosure — condition rows reusing the chip
   vocabulary already in `filter-drawer.tsx`.

A **live match count** while building ("42 records match") is essential and
free — it is just the evaluator running on the client.

### 6.3 Titles

Generate a default; make it editable.

- The name is a **compact natural-language render of the top two or three
  criteria** — "Jazz before 1980". Don't cram five conditions into a title; it
  becomes a query string, not a name. The *full* criteria always render as
  chips underneath.
- It **regenerates live while building**, so it functions as a readback.
- It **freezes the moment the user types their own**. Store the last generated
  name in `name_generated`; if `name === name_generated`, keep regenerating, else
  stop. (Comparing against a freshly-computed generation would also work and
  needs no field — but storing it survives a change to the generator.)

Renaming already exists (`renameStack`), so the edit path is free.

### 6.4 Reuse note

`filterAndSortAlbums` (`use-filtered-albums.ts:27`) is the ancestor of this
evaluator. **Do not merge them** in this work — the collection filter is a
fixed set of UI-bound filters; the rule engine is generic. The engine could
back the filter drawer later. Noted, not done.

---

## 7. Sharing (its own phase)

`stacks.getShared` (`convex/stacks.ts:152`) reads `album_ids` server-side. An
auto session has none, so the server must evaluate the rule against the
sharer's `collection` rows.

This is the one genuinely expensive piece, and it is why phase 1 puts genre and
rating in the **Convex table** rather than only on the client `Album` type. The
pure evaluator (§3.5) has to run over both shapes.

Constraints that carry over unchanged: the whitelist stays exactly as it is
(`name`, `last_modified`, and per-album `title`/`artist`/`year`/`cover`/`thumb`
only — never usernames, tokens, notes, conditions, or release ids); unknown and
revoked share ids both return `null`. The existing `stacks.test.ts` invariants
must keep passing, with new cases added for an auto session's share payload.

Deterministic rotation matters here: a shared link must show the same set the
owner sees, which the seeded bucket gives for free.

---

## 8. What the free data earns

### 8.1 Rating — and the write is nearly free

Discogs' **"Change Rating Of Release"** (API doc line 545) is a `POST` to
`/users/{u}/collection/folders/{f}/releases/{r}/instances/{i}` with a `rating`
param — **the same endpoint and call shape `proxyMoveToFolder` already uses**
(`convex/discogs.ts:1274`) when it moves a record between folders. So editable
ratings are not a new action or new auth work.

Recommended: extend `proxyUpdateCollectionInstance` (`convex/discogs.ts:1178`)
with an optional `rating`, issuing one additional POST to the instance URL
(note: *not* the `/fields/{id}` URL its other writes use). That keeps "edit this
copy" as one action. `updateAlbum` in app-context and `collection.updateInstance`
carry the field through, per CLAUDE.md's reactive-hydration rule.

Surfaces, in order of value:

1. **The purge flow** — seeing your own star rating while deciding Keep/Cut is
   directly in service of the app's stated core value. Likely the best
   placement of all.
2. **Album detail** — display and edit, fitting the existing inline edit-mode
   pattern.
3. **Sort option** — "Rating: Highest first": one line in `SORT_OPTIONS`
   (`filter-drawer.tsx:16`) and one case in `filterAndSortAlbums`.
4. **Filter drawer** — an "Unrated" quick filter, pairing with the existing
   "Play Not Recorded".
5. **Insights** — *not* a ratings histogram, which is vanity. The version that
   earns its place is **rating × purge**: "You've rated 12 records two stars or
   lower and never tagged them." That is a decision prompt, which is what the
   app is for.

Do not conflate this with the **community** average rating album detail already
shows from the enriched fetch. Different number, different meaning, and they
will sit near each other.

### 8.2 Genre and style — existing surfaces only

Session criteria; a Genre facet in the filter drawer beside Format; a **By
Genre** tab inside the existing Breakdown card in Insights. All three slot into
surfaces that already exist.

Album detail already renders genres from the enriched fetch, so there is no new
surface there — just a free perceived-speed win, since they would come from
cache instantly instead of after the lazy release fetch.

**Cut:** a genre spotlight section on the feed (D10).

---

## 9. Phases

| # | Scope | Notes |
|---|---|---|
| 1 | **Free-data mapper pass** — genres, styles, rating, qty, artist ids; collection *and* wantlist; schema + `Album`/`WantItem` | `convex/` — deploy first. Useful standalone |
| 2 | **Rating surfaces** — write path, purge flow, album detail, sort, unrated filter, rating×purge insight | Earns its keep even if the builder never ships |
| 3 | **Rule engine + schema + presets only** — no custom builder | Proves the model on the smallest surface |
| 4 | **Custom builder** — condition rows, live count, generated titles, exclusions | The real design work |
| 5 | **Caps + rotation + Settings section + disclosure** | §5.3 is a precondition for D6, not a follow-up |
| 6 | **Server-side evaluation for share links** | §7 |
| 7 | *(later)* **"3 records joined Late Night Jazz"** | The only part that genuinely needs stored state — a membership snapshot to diff — and the only part that wants a job |

Genre/style facets in the filter drawer and the By Genre Insights tab (§8.2)
can land any time after phase 1; they are independent of the builder.

Per CLAUDE.md rule 6, each phase is its own session and its own commit.

---

## 10. Open questions

1. **Per-session cap override — ship it, or global only?** Recommended global
   first (D4). Revisit once there are real sessions to look at.
2. **Rotation period offset** (§3.4) — the ~10h constant is a judgment call
   about where the beta's users are. Worth a look before it's baked in.
3. **Pins** ("always include this one, regardless of rule") — deferred to a
   later phase. Exclusions ship in phase 4; pins would union in before the cap
   in §3.3 step 3.
4. **Does the rule engine eventually back the filter drawer?** (§6.4) Noted as
   a possibility, deliberately not done here.

---

## 11. Naming (internal identifiers)

Per CLAUDE.md's Sessions naming note, internal names stay `stack*` — they must
not be renamed to `session*` (collides with `sessionToken` / `auth_sessions`,
and the `stacks` table cannot be renamed at all).

- Convex table: `stacks` (unchanged), new fields `kind` / `rule` /
  `excluded_ids` / `name_generated`
- Pure evaluator: `convex/stackRules.ts`, `evaluateStackRule`
- Builder component: `stack-builder.tsx`, alongside `stack-picker-sheet.tsx`
- Types: `StackRule`, `StackRuleCondition`

**All user-facing copy says Session** — "this session fills itself", the AUTO
badge, the Session Builder. Never "smart", never "folder", never "playlist".
