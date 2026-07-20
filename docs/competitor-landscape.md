# Holy Grails — Competitor Landscape, July 2026

Research snapshot, **as of July 2026**. Web sources linked inline; app-store pricing changes frequently, so re-verify before any pricing decision. Feeds `docs/feature-opportunities.md` (ideas) and `docs/monetization-plan.md` (pricing benchmarks).

---

## Direct competitors — vinyl/music collection managers

| App | Platform | Pricing | Positioning |
|---|---|---|---|
| **Discogs (official app)** | iOS/Android | Free | The database + marketplace itself. Rebuilt app shipped Aug 2025. |
| **CLZ Music** | iOS/Android/Mac/Win/Web | $1.99/mo or $19.99/yr, 7-day trial | The heavyweight cataloger: CDs + vinyl, custom fields, storage locations, CLZ Cloud sync on every platform. |
| **Record Scanner** | iOS/Android | Subscription (scan-metered) | Scan-and-value: cover/barcode/catno identification, instant market valuation for vinyl/CD/cassette. |
| **Groovv** | iOS/Android | Free ≤100 records; Pro unlocks unlimited + AI cover scans | Visual-browsing-first tracker, strong Android presence. |
| **Spinstack** | iOS | **One-time $9.99** Pro | Design-forward "collection, beautifully managed": bulk scan, insights, price watchdog, Last.fm scrobbling, NFC tags. |
| **SnapVinyl** | iOS | Freemium | Third-party Discogs client — real-time collection/wantlist sync. Same category as Holy Grails. |
| **Discographic** | iOS | Paid app | Third-party Discogs client: full collection/wantlist CRUD, barcode scan, condition edits, collection value. |
| **MusicBuddy** | iOS/Android | Freemium | Private library manager; lending tracking is its differentiator. |
| **My Vinyl+** | iOS | Freemium | Vinyl-native tracker; publishes the comparison content that ranks for this whole category. |
| **Milk Crate** | — | **Dead** | Was the beloved vinyl-native Discogs-integrated app; no longer available. Its users are unhoused — and a cautionary tale about solo-maintained Discogs clients. |

Sources: [Record Scanner comparison](https://recordscanner.com/blog/which-vinyl-tracker-to-choose-in-2026), [My Vinyl+ 2026 roundup](https://myvinyls.app/blog/2026/07/best-vinyl-collection-apps-2026/), [CLZ pricing](https://app.clz.com/music/pricing), [Spinstack](https://spinstackios.app/), [Restless Soul roundup](https://restlesssoul.co.nz/blogs/media-room/best-apps-to-catalogue-your-vinyl-collection), [Analog guide](https://analogapp.co/journal/guides/best-apps-for-vinyl-collectors).

### The Discogs app's open wound

The Aug 2025 redesign generated sustained complaints that are directly Holy Grails' opportunity: search breaking between queries, the Wants surface buried/removed, genre and catalog numbers stripped from views, and **no way to see prices across a collection without opening records one at a time** ([App Store reviews](https://apps.apple.com/us/app/discogs/id1036449551), [justuseapp review aggregate](https://justuseapp.com/en/app/1036449551/discogs/reviews), [Discogs forum: "What happened to the app??"](https://www.discogs.com/forum/thread/807944)). Holy Grails already does the collection-wide value view (Insights + market drip) that app reviewers ask for.

---

## Adjacent inspiration

- **Last.fm Pro — $4.99/mo** ([last.fm/pro](https://www.last.fm/pro)): the cleanest proof that *insights on data you already have* is a sellable premium. Their paywall is reports/customization depth, not core scrobbling. Direct analog: Holy Grails Insights as a premium surface. (Also note: they raised $3→$5/mo and survived it.)
- **Airbuds** ([TechCrunch](https://techcrunch.com/2025/09/17/airbuds-is-the-music-social-network-apple-and-spotify-wish-they-had-built/), 1.5M DAU): social presence via home-screen widgets, reactions on friends' listening, a weekly shareable recap. The Following feed is Holy Grails' embryo of this; the lesson is *make the social loop ambient and shareable*, not another screen to visit.
- **Receiptify-style share culture**: single-image, aesthetically distinct summaries that people post. Holy Grails' collection facts ticker, golden-era callout, and Top Shelf are one export-to-image button away from this. The shared-session page (`/s/{shareId}`) is already the app's first outward-facing artifact.

---

## Where Holy Grails wins

1. **The purge workflow.** No competitor has Keep/Cut/Maybe curation. Everyone catalogs; nobody helps you *decide*. This is the identity — nothing in the research touches it.
2. **Sessions.** Playlist-like physical-listening planning with shareable capability links — unique in the category.
3. **Design integrity.** Spinstack is the only competitor competing on craft; the rest are utilitarian. HG's design system is a durable differentiator.
4. **Collection-wide market value** without opening records one by one — the exact gap Discogs app users complain about.
5. **Look It Up** — search-to-add + price lookup makes it a record-store companion, the highest-intent moment a collector has.

## Where Holy Grails loses (today)

1. **No native app / App Store presence.** Every competitor is installable from the store; PWA discovery is near zero. (Native is a planned post-1.0 separate project — `docs/native-app-plan.md`.)
2. **Camera-first cataloging.** Record Scanner/Groovv lead with cover-photo recognition; HG has barcode scan only inside Look It Up. Cover recognition is the category's table-stakes race right now.
3. **Discogs dependency** as a single point of failure — shared with SnapVinyl/Discographic, but CLZ/MusicBuddy own their databases. (Mitigation, not escape: cached mirrors in Convex already soften API outages.)
4. **Offline** — the caches help reads, but competitors with local-first databases work fully offline in a basement record fair. Real-world digging happens in dead zones.
5. **No lending, no storage-location, no custom-field editing** — CLZ's power-collector features. Deliberate scope, but it's where heavy catalogers land.

## Worth stealing (feeds `feature-opportunities.md`)

- Shareable image exports of stats/moments (Receiptify/Airbuds recap pattern) — cheap, viral, on-brand.
- Price Watchdog (Spinstack): alert when a wantlist item's ask drops below a threshold — HG already fetches the data.
- Cover-photo recognition as an alternative to barcode scan (most 60s–80s pressings have no barcode).
- A weekly recap moment (Airbuds Sunday recap) built from data HG already derives.
- One-time-purchase pricing (Spinstack) as a credible alternative to subscription — collectors grumble about subscriptions.
