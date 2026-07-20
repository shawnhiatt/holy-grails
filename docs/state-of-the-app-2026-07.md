# Holy Grails — State of the App, July 2026

The output of a full step-back review at v0.6.0: codebase hygiene, market position, feature runway, monetization, and growth readiness. **Documentation only — no code changed.** Re-read this doc before planning any future session; the deep-dives carry the detail:

- `docs/hygiene-audit-2026-07.md` — token drift, dead code, deletion schedule
- `docs/competitor-landscape.md` — who else is out there, what they charge
- `docs/feature-opportunities.md` — what the data + API could unlock, ranked
- `docs/monetization-plan.md` — exploratory free/paid tiers + the ToS gate
- `docs/growth-readiness.md` — OAuth/Convex scaling verdict + infra priorities

---

## Where the app stands

**Healthy.** Typecheck clean, lint 0 errors, 102/102 tests, all lint-enforced guardrails holding, zero TODO markers in source. The v0.5.6 audit's remediation held up; the architecture (server-side sync, per-device sessions, cached mirrors, capability-link sharing) is the right shape for growth. The app is beta-ready per the playbook and differentiated in a real market gap: **nobody else does curation** — competitors catalog; Holy Grails decides.

The market moved favorably this year: the official Discogs app's 2025 redesign generated sustained user anger (broken search, buried wantlist, no collection-wide pricing), and Milk Crate — the beloved vinyl-native client — died, leaving its users unhoused. The purge workflow, Sessions, and collection-wide value view answer exactly the complaints Discogs app reviewers write.

## Top findings

1. **The installed PWA still paints retired navy.** `site.webmanifest` + the light `theme-color` meta missed the gray retheme (`#0c284a` everywhere), and two `rgba(19,43,68,…)` borders survive in code. Most user-visible fix on the list. *(hygiene H1/H2)*
2. **~65 lines of dead shadcn-era CSS tokens and a dead `tw-animate-css` dependency** ship to every user. Straight deletions. *(hygiene M1/M2)*
3. **Legacy Convex fields now have a deletion schedule** — `hide_gallery_meta` deletable now; legacy session fields ~Oct 2026; market-drip migration fields after a prod check; `pricePaid` needs a keep-or-drop decision. *(hygiene M3)*
4. **Monetization has one gate before any design work: Discogs' API terms.** Marketplace data (the whole Value system) is contractually non-commercial, and charging for an API-integrated app requires written permission. Competitors charge, so permission is obtainable — but the email to Discogs comes first. *(monetization)*
5. **OAuth is fine to scale with.** Per-token rate limits mean each user brings their own budget; recovery = logging into Discogs again. The real account-model gap is **no comms channel** — an optional email field becomes mandatory the day money moves. *(growth)*
6. **Two scaling cliffs, both fixable in-place:** the market drip's fixed 40/day batch (caps out at ~1,200 fresh releases — big single collections already outrun it) and `followed_items` storing a full mirror per follower. *(growth)*
7. **The feature runway is deep and cheap.** The highest-leverage ideas are pure derivations on data already cached: smart purge candidates, duplicate detection, collection overlap with friends, shareable stat cards. Several album-detail wins (release videos, rarity signal, personal star ratings) ride API responses the app already fetches and discards. *(features)*

## Recommended order of operations

**Now (pre-beta, each one session):**
1. PWA manifest/theme-color retheme fix + the two navy borders (hygiene H1/H2)
2. Delete the shadcn token block + `tw-animate-css` (hygiene M1/M2)
3. Scale the market-drip batch with the token pool (growth cliff 2 — testers with big collections will hit it first)
4. Finish Sentry setup + verify Convex backups (playbook gate; 30 minutes)
5. Changelog truth-up: retheme entry, decide the 0.7.0 cut (hygiene L3)

**Next (feature arc, deepens the moat):**
6. Smart purge candidates + duplicate detection (features #1/#3)
7. Album-detail freebies: release videos, rarity signal (features #9/#10)
8. Shareable stat cards (features #5) — the growth loop starter

**Decided (July 2026, same session):**
- Monetization posture: **cost-recovery** — free until usage grows past a couple of friends, then charge to cover infra. Discogs outreach approved; draft email in `docs/monetization-plan.md`. Shawn-owned action: send it.
- `pricePaid`: **drop end-to-end** — queued in the hygiene execution checklist.
- Cover-photo recognition: **approved and built** — shipped as the Look It Up scanner's Cover mode (`vision.identifyCover`, Claude API). Shawn setup remaining: create the Anthropic API key, `npx convex env set ANTHROPIC_API_KEY` on both deployments, deploy.

**Calendared:**
- ~Oct 2026: delete legacy session fields (after prod verification)
- Stage 2 of beta: spec `followed_items` de-duplication; real `/privacy` page

## What this review deliberately did not do

No code was touched; every finding above maps to a future single-concern session per house rules. The out-of-scope lines (listening logs, seller tools, database browsing, native app) all held — where a feature idea brushed one, it's flagged as a scope decision in `feature-opportunities.md`, not smuggled in.
