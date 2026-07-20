# Holy Grails — Feature Opportunities, July 2026

What the data already collected — plus unused Discogs API surface (see `docs/Discogs API V2 - *.md`) — could unlock. Each candidate names its data source, an effort ballpark (S = one session, M = a few, L = a spec + multiple sessions), and whether it crosses the explicit out-of-scope lines in CLAUDE.md (those are flagged **SCOPE DECISION**, never assumed). Competitor provenance is in `docs/competitor-landscape.md`.

**Ranking lens:** the moat is decision-making and curation (purge, sessions). Features that deepen the moat outrank features that add breadth.

---

## Tier 1 — deepen the moat (do these first)

### 1. Smart purge candidates — S/M
A "Needs a verdict" queue ranked by signals the app already has: zero plays recorded + long-unplayed (`last_played`), low/no market ask (`market_values`), duplicate master (see #3), still unrated. Pure derivation on cached data, zero API calls. Turns the purge from browsing into triage — no competitor has anything like it. Natural home: Purge Tracker and/or a feed section.

### 2. Cut-list exit path — CSV export — S
The purge produces a Cut pile, then abandons the user at the finish line. Minimum viable exit: export Cut records (title, artist, pressing, condition, lowest ask) as CSV/text for a sale listing anywhere. Data is all cached. *Drafting actual Discogs marketplace listings via the Inventory endpoints is seller tooling — **SCOPE DECISION**, explicitly out of scope today; the CSV sidesteps it.*

### 3. Duplicate detection — S
Same `master_id` appearing on 2+ collection rows (different pressings). Already matchable with the existing master-id logic and Sets. Surface as an Insights line and a purge-candidate signal. (Note: the sync's one-copy-per-release dedup is per *release*; cross-pressing duplicates per *master* are untouched and real.)

### 4. Personal star ratings — S/M
Discogs collection instances carry a 0–5 `rating` HG never reads or writes, and `POST .../collection/folders/{folder}/releases/{release}/instances/{instance}` changes it (User Collection doc, "Change Rating Of Release"). Read it at sync (it's already in the payload), show/edit it in album-detail edit mode alongside conditions. A second, gentler curation axis beside the purge verdict — and it round-trips to Discogs, so the data outlives the app.

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

## Flagged, not recommended now

- **Cover-photo recognition** — ~~SCOPE DECISION~~ **decided and shipped (July 2026)**: built as the Look It Up scanner's Cover mode, powered by the Claude API (`convex/vision.ts`, `claude-haiku-4-5`). Shawn approved the external-service dependency explicitly.
- **Artist/label discography pages** (Artist/Label endpoints): explicitly out of scope (database browsing). The Look It Up master/versions flow already covers the add-and-price path.
- **Listening logs beyond last-played**: explicitly out of scope; #1/#7 deliberately use only the existing `playCounts`/`last_played` data.
- **Push notifications**: real PWA capability (iOS 16.4+), but a scope and infra decision (service, permissions UX) — decide alongside #8, not inside it.

## Suggested sequencing

1. **#1 + #3** (one arc: purge intelligence) — pure derivation, deepens the moat immediately.
2. **#9 + #10** (album-detail freebies riding existing fetches).
3. **#5** (share cards) — then #6, #7 build on it.
4. **#4** (ratings) when next touching album-detail edit mode.
5. **#8 + #11** as the utility pass; #2 alongside the next purge session.
