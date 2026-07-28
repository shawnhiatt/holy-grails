# Holy Grails — Feature Opportunities, July 2026

What the data already collected — plus unused Discogs API surface (see `docs/Discogs API V2 - *.md`) — could unlock. Each candidate names its data source, an effort ballpark (S = one session, M = a few, L = a spec + multiple sessions), and whether it crosses the explicit out-of-scope lines in CLAUDE.md (those are flagged **SCOPE DECISION**, never assumed). Competitor provenance is in `docs/competitor-landscape.md`.

**Ranking lens:** the moat is decision-making and curation (purge, sessions). Features that deepen the moat outrank features that add breadth.

**Companion doc:** `docs/ai-opportunities.md` covers what the Claude API integration (shipped for the Cover scan) could be used for beyond it — plus the gamification direction, which is mostly plain derivation and belongs on this list once it's shaped.

---

## Tier 1 — deepen the moat (do these first)

### 1. Smart purge candidates — S/M
A "Needs a verdict" queue ranked by signals the app already has: zero plays recorded + long-unplayed (`last_played`), low/no market ask (`market_values`), duplicate master (see #3), still unrated. Pure derivation on cached data, zero API calls. Turns the purge from browsing into triage — no competitor has anything like it. Natural home: Purge Tracker and/or a feed section.

### 2. Cut-list exit path — CSV export — S
The purge produces a Cut pile, then abandons the user at the finish line. Minimum viable exit: export Cut records (title, artist, pressing, condition, lowest ask) as CSV/text for a sale listing anywhere. Data is all cached. *Drafting actual Discogs marketplace listings via the Inventory endpoints is seller tooling — **SCOPE DECISION**, explicitly out of scope today; the CSV sidesteps it.*

### 3. Duplicate detection — S
Same `master_id` appearing on 2+ collection rows (different pressings). Already matchable with the existing master-id logic and Sets. Surface as an Insights line and a purge-candidate signal. (Note: the sync's one-copy-per-release dedup is per *release*; cross-pressing duplicates per *master* are untouched and real.)

### 4. Personal star ratings — ~~S/M~~ **SHIPPED (July 2026)**
Landed with the Session Builder's free-data pass. The rating is read at sync and written back through `proxyUpdateCollectionInstance` (the "Change Rating Of Release" POST goes to the instance URL, the same shape `proxyMoveToFolder` uses). Surfaces: the purge evaluator, album detail's Your Copy row, a Rating sort, an Unrated filter, and a rating×purge line in Insights. See the Star Ratings section in CLAUDE.md.

## Tier 2 — social & shareable (the growth loop)

### 5. Shareable stat cards — M
Receiptify/Airbuds-style image export of moments the app already derives: collection facts, golden era, Top Shelf, purge progress. Client-side canvas render → `navigator.share`. The capability-link share (`/s/{shareId}`) proved the outward-artifact pattern; this is its viral sibling. Biggest marketing lever available at zero infra cost.

### 6. Collection overlap with followed users — M
"You both own 14 records" / "Grails your friends have": intersect own collection/wantlist with `followed_items` via existing `master_id` Sets. All data is already cached server-side; zero new API calls. Deepens Following from a feed into a relationship. Must respect the Cross-User Data Pattern (only followed users, only data already exposed there).

### 7. Year-end recap ("your year in the crate") — M/L
`dateAdded` bucketing (exists in `insights.ts`), plays, purge stats, value growth → a seasonal, shareable, multi-card moment. Seasonal deadline makes it a good v1.0-era flagship. Builds directly on #5's rendering work.

## Tier 3 — utility wins

### 8. Wantlist price watchdog — M
Extend the market-value drip to wantlist releases (same `market_values` table — it's keyed by release, not user; `seedFromCollection` just needs a wantlist sibling), then surface "ask dropped below ~$X" as an in-app prompt (crossover-prompt pattern). Spinstack charges for exactly this. *Push notifications are a separate **SCOPE DECISION** — in-app surfacing needs none.*

### 9. Release videos in the detail panels — S
`proxyFetchRelease` already receives `videos[]` (YouTube links) and drops it. Add to the Listen On section. Zero extra requests. YouTube hrefs are fine — the outbound-link ban is discogs.com-specific.

### 10. Rarity signal — S
`proxyFetchRelease` already returns community have/want; a derived want:have ratio badge ("rare — wanted 4× more than owned") on album detail adds collector delight for free. Label carefully (it's a proxy, not a price).

### 11. Collection insurance/backup export — S
Full-collection CSV (pressing, condition, notes, folder, ask value). Adult-collector need (insurance riders, estate lists), trivially served from cache, and doubles as the "how do I leave" data-portability story the beta playbook wants.

### 12. Discogs Lists import — M
User Lists endpoints are entirely unused. One-shot import of a Discogs list into a Session fits session-building; ongoing list sync probably isn't worth it. *Borderline database-browsing — the import framing keeps it in scope.*

### 13. "3 releases joined Late Night Jazz" — M
The one deferred piece of the Session Builder (its plan's phase 7), and the only part of that feature that genuinely wants stored state.

An auto session's membership is derived at read time and deliberately never stored, which is what makes auto-add free. The cost is that nothing knows what *changed*: to say "3 releases joined," you need a membership snapshot to diff against, which means the one write path and the one background job the rest of the design avoids.

Shape, if it's built:
- A `stack_snapshots` table (`stack_id` + `release_ids` + `taken_at`), written after a sync completes rather than on every evaluation — the diff people care about is "since my collection changed," not "since I last opened the app."
- Diff on read, surface as a badge on the Sessions row and/or a feed line. Keep it a *notice*, not a feed section: three collection-random sections already sit on the feed and CLAUDE.md warns against stacking them.
- Only for sessions with a rule, obviously — and suppress it on a rotating session, where the set changing is the expected behavior rather than news.

**Do not** let the snapshot become the source of truth for membership. It exists solely to answer "what's new," and `stackMembership` stays derived. If that boundary ever blurs, the drift the whole design avoids comes straight back.

Worth doing only once there are real auto sessions with real churn to look at — on a collection that isn't growing, it has nothing to report.

### 14. Track favorites, and the DJ pull list — S + S/M
Asked for as one feature ("favorite songs, add songs to a session — build playlists from physical media"). It is three, with wildly different costs: one worth doing, one that is the actual win, and one that forks the session model. Splitting them is the whole assessment.

**14a. Track favorites — S.** A new `track_favorites` table, near-identical in shape to `purge_tags`: `discogs_username` + `release_id` + `position` + `favorited_at`, indexed `by_username` and `by_release`. `position` ("A2", "B1") is the stable per-release key and already arrives on every enriched fetch — `proxyFetchRelease` maps it at `convex/discogs.ts:1527`. `TracklistSection` (`album-detail.tsx:1808`) is shared by all three detail panels, so one row affordance ships in three places. **Zero new Discogs requests** — the tracklist is already in hand whenever the panel is open, which is the only place a favorite can be set.

- **Denormalize the display data onto the favorite row** (`title`, and `duration` if wanted). This is not an optimization, it is load-bearing. Tracklists are persisted *nowhere* — `releaseDataCache` is a module-level `Map` that dies with the session. Without denormalization, rendering a favorites list outside an open panel means re-fetching every release: N calls against a 60/min budget, a nonstarter. It also keeps favorites readable offline, where the enriched fetch simply fails.
- **Key on `release_id`, never `master_id`** — and write that down, because it looks like a bug later. Everywhere else the app deliberately matches across pressings via `master_id` (hearts, "in collection"). Favorites must not: tracklists genuinely differ between pressings. "A2" on the LP is not track 2 on the CD, bonus tracks shift positions, and running orders diverge. Release-keyed is the correct semantic, not an oversight.

**14b. Favorites inside session detail — the pull list — S/M. This is the actual feature.** A DJ working physical media is not building a playlist, they are building a *pull list*: which releases go in the bag, and which cut on each. The app already ships the first half — a session is exactly that list, and `album_ids` is already ordered with `reorderStackAlbums` for set order. The missing half is annotation, not membership. Rendering a session member's favorited tracks inline — *"Kind of Blue · A2, B1"* — is a read-only join of two per-release things, **needs no change to the `stacks` schema at all**, and works identically for manual and auto sessions. Small, and it is what turns a session into a gig list.

**14c. Do not build track-level session membership.** `stacks.album_ids` is `v.array(v.number())` — release ids, and that assumption runs through `stackMembership`, `isInStack`, `isAlbumInAnyStack`, the picker sheet, and `getShared` (which joins against the `collection` cache and returns album display fields). Making a session hold tracks means either a heterogeneous member type threaded through all of it or a second object type, which CLAUDE.md forbids outright. The part that actually kills it: **auto sessions cannot produce tracks.** `evaluateStackRule` operates on `RuleAlbum` fields — genre, rating, year, format, purge tag — and no track-level data exists to query. Discogs offers no BPM, no key, no per-track genre, and never will. Track sessions would therefore be manual-only, forking the model precisely where the design says there is no fork. The cap tiers stop meaning anything too ("A deep dig (50)" — 50 what?).

**Things easy to miss:**

- **The word "playlist" is already banned copy.** CLAUDE.md's Session Builder rules forbid "smart", "folder", and "playlist" for sessions. "Song" should be **track** (Discogs' noun, and what the tracklist footer already says); the generic for an item stays **release**, never "record". The feature is *track favorites*, and a session annotated with them is still a session.
- **Both obvious icons are taken, and this is a real design problem.** Heart means wantlist app-wide — `wantlist-add-icon.tsx` exists *specifically* because a bare heart reads as "favorite this." Star means the user's own Discogs rating (`star-rating.tsx`, amber `#FFC107`), sitting on the same panel. A third meaning on either glyph will collide. This wants a deliberate design pass before implementation, not a pick-one-at-build-time.
- **A `favoriteTrackCount` rule field is nearly free, and it is the best DJ session in the app.** `RuleAlbum` already folds `purgeTag` and `playCount` on from their own tables (`stackRules.ts:72-75`), and `getShared` already does the server-side equivalent for the share path. A "releases where I've starred something" condition follows that precedent exactly — one optional field, one `case` in `evaluateCondition`, no new machinery. Worth considering in the same arc as 14a, since it lands the auto-session half of the ask *without* track-level membership.
- **Default the share payload to excluding favorites.** `getShared` has a strict whitelist and `stacks.test.ts` asserts the payload leaks nothing beyond it. Favorites are private annotation; shipping them is a deliberate product decision plus a test update, not a default.
- **`users.deleteAllUserData` must delete the new table** (`convex/users.ts:259+`, one block per table) — "removes everything on our side" has to stay literally true. And per CLAUDE.md's testing rule, a new guarded Convex function ships with its auth-guard test in the same session.
- **Position is not perfectly clean.** `proxyFetchRelease` filters to `type_ === "track"`, so headings and index tracks are already dropped — good, positions stay consistent with what renders. But `position` can be an empty string (the mapper defaults `t.position || ""`), CDs use bare numbers, multi-disc uses `"1-1"` forms. Needs an array-index fallback key. Separately, Discogs tracklists are community-editable and *can* be revised under you — another reason the denormalized title, not the position, is the display truth.
- **It is not a listening log.** A favorite is a preference marker, not play tracking, so it does not touch the out-of-scope line above. If it ever drifts toward "log which track I played," that is the line.
- **Sample size of one.** 14a is generally useful — anyone marks standout cuts. 14b is DJ-specific but nearly free once 14a exists. 14c serves one user at the highest cost of the three, which is exactly the ranking lens this doc uses: moat over breadth.
- **The drift line is a global Favorites screen.** Favorites on album detail and joined into session detail keep this an annotation feature. A top-level browsable list of loose tracks is where it quietly becomes a playlist app, and where 14c starts looking reasonable again.

## Flagged, not recommended now

- **Cover-photo recognition** — ~~SCOPE DECISION~~ **decided and shipped (July 2026)**: built as the Look It Up scanner's Cover mode, powered by the Claude API (`convex/vision.ts`, `claude-sonnet-5`). Shawn approved the external-service dependency explicitly.
- **Artist/label discography pages** (Artist/Label endpoints): explicitly out of scope (database browsing). The Look It Up master/versions flow already covers the add-and-price path.
- **Listening logs beyond last-played**: explicitly out of scope; #1/#7 deliberately use only the existing `playCounts`/`last_played` data.
- **Push notifications**: real PWA capability (iOS 16.4+), but a scope and infra decision (service, permissions UX) — decide alongside #8, not inside it.
- **Track-level session membership / true playlists** — **SCOPE DECISION**, assessed July 2026, see #14c. Sessions are lists of releases down to the schema (`album_ids: v.array(v.number())`), auto sessions have no track-level data to evaluate against, and a track-holding session forks the "there is no second object type" rule. The want behind it is served by #14a + #14b at a fraction of the cost. Distinct from the Spotify/Apple Music item below, which is about getting sessions *out* to a streaming service.
- **Spotify / Apple Music playlist export** — **deferred, assessed (July 2026)**. Attempted once before and abandoned as complex; the assessment below concluded that judgment was correct. Spotify is feasible, Apple Music is materially harder, and neither is a feature — it's a project:
  - **Two OAuth systems.** Spotify supports Authorization Code + PKCE from a pure client (no secret; a Settings "Connect Spotify" is architecturally clean, tokens stored in Convex like Discogs creds). Apple Music (MusicKit JS) *additionally* needs a paid Apple Developer membership and a server-minted developer JWT — Convex can sign it, but that's real key management before any user auth happens.
  - **The matching problem is the actual work.** A session is a list of *vinyl releases*; a playlist is a list of *streaming tracks*. Per album: search the catalog by artist+title (normalizing Discogs' disambiguation suffixes), disambiguate remasters/deluxe/regional/compilation results, fetch the tracklist, append. Expect a real miss rate and therefore a review-before-create UI ("12 of 15 matched — review") — **that UI is most of the feature**.
  - **Scope-creep risk** into "streaming integration" (playback, an expanded Listen On), which the app has deliberately kept to two dumb brand-icon buttons.
  - **Recommendation: park it.** If picked up: Spotify only, as its own multi-session project with a dedicated plan doc, phased as (1) PKCE connect + token storage, (2) match engine + review UI, (3) playlist creation. Apple Music only if the Spotify version earns it. Note the session-share page already covers a chunk of the underlying want — getting a session out of the app and into the room — at roughly 5% of the cost.

## Suggested sequencing

1. **#1 + #3** (one arc: purge intelligence) — pure derivation, deepens the moat immediately.
2. **#9 + #10** (album-detail freebies riding existing fetches).
3. **#5** (share cards) — then #6, #7 build on it.
4. ~~**#4** (ratings)~~ — done, shipped with the Session Builder.
5. **#8 + #11** as the utility pass; #2 alongside the next purge session.
6. **#13** ("3 releases joined") only after auto sessions have been in real use — it needs churn to have anything to say.
7. **#14a + #14b** (track favorites, then the session pull list) as one arc — 14b is most of the value and costs little once 14a lands. Settle the icon collision in a design pass first. The `favoriteTrackCount` rule field folds in cheaply alongside. #14c stays parked.
