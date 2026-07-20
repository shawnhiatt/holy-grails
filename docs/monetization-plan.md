# Holy Grails — Monetization Plan, July 2026

**Status: posture decided — cost-recovery.** Shawn's call (July 2026): free for himself and one or two others; if usage grows beyond that, charging becomes necessary because database/storage/monitoring costs scale with users. Revenue goal is covering infrastructure, not profit — option C below now, escalating toward B (one-time unlock) or A (subscription) only if costs demand it. **Discogs outreach is approved** — Shawn will send the email (draft in the appendix). This maps what a free/paid split could look like, what it would cost to build, and the one hard gate that comes before any of it. Pricing benchmarks come from `docs/competitor-landscape.md`; scaling economics from `docs/growth-readiness.md`.

---

## The gate: Discogs API terms come first

Research findings (as of July 2026 — verify against the live [API Terms of Use](https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use) before acting):

- Discogs **catalog data is CC0** (titles, tracklists, formats, identifiers, credits, label info) — commercial use fine.
- **Restricted Data** — user data (usernames, profiles), user-uploaded **images**, and **"Marketplace Data"** (pricing suggestions, sales history, inventory) — "may not be used for any commercial purposes."
- Prohibited commercial uses include **"charging a fee to use or access any part of an application that integrates with the API if Discogs provides that access to users free of charge, without express written permission."**

What this means concretely for Holy Grails:

1. Collection/wantlist sync, cover images, and the entire market-value system (Value section, drip, Top Shelf, price suggestions) run on Restricted/Marketplace Data. **A paid tier that gates any of that needs written permission from Discogs** (historically via api@discogs.com).
2. Features that are HG-native derivations (purge workflow, sessions, share cards) are the *defensible* premium surface — but even they sit inside "an application that integrates with the API," so the safe reading is: **ask Discogs before charging anything.** Third-party Discogs clients (Discographic, SnapVinyl, Record Scanner) do charge, so permission is evidently obtainable — but each presumably asked, and asking is cheap.
3. **Action item #1 of any monetization path: email Discogs describing the app and the proposed paid tier, and get the answer in writing.** Everything below assumes a yes (possibly with conditions, e.g. marketplace data staying free-tier).

## What must stay free

The identity of the app cannot go behind a paywall without killing it:

- Discogs sync, collection/wantlist browsing (Discogs gives this away free — charging for it is both prohibited-by-default and pointless)
- The purge workflow (Keep/Cut/Maybe) — the reason the app exists; free purge is the acquisition story
- One account, core Look It Up search

## Candidate premium surfaces

Ranked by defensibility (HG-native derivation > convenience > restricted-data-dependent):

| Surface | Exists? | ToS exposure | Notes |
|---|---|---|---|
| Insights depth (Top Shelf, growth, folder values, purge×value) | Yes | High (marketplace data) | The Last.fm Pro analog — but the most ToS-entangled |
| Share cards / year-end recap | Planned (`feature-opportunities.md` #5/#7) | Low | Premium "pro cards" tier works; keep basic share free for virality |
| Smart purge candidates / purge intelligence | Planned (#1/#3) | Low | Most defensible: pure HG derivation on the user's own choices |
| Multi-account | Yes | Low | Clean pro-user gate; hobbyists have one account |
| Wantlist price watchdog | Planned (#8) | High (marketplace data) | Spinstack's premium item; strong willingness-to-pay |
| Session limits (e.g. >5 sessions) or session sharing | Yes | Low | Sharing drives growth — gate *count*, never the share link itself |
| Follow count above N | Yes | Medium (user data) | Weak lever; social caps feel punitive |
| CSV/insurance export | Planned (#11) | Low | Classic pro utility |

## Three structures to react to

**A. "Crate Club" — single subscription.** Free: everything today minus Insights depth; Pro (~$20/yr or $2.49/mo, in the CLZ band, below Last.fm's $60/yr): full Insights, watchdog, multi-account, pro share cards, exports. *Pros: recurring revenue matches recurring costs (Convex, sync). Cons: collectors visibly grumble about subscriptions; the strongest gates are ToS-entangled.*

**B. One-time unlock (Spinstack model).** Everything today stays free; a **$14.99 one-time "Holy Grails Pro"** unlocks the *new* pro features as they ship (watchdog, recap, exports, multi-account). *Pros: collector-culture-friendly, no entitlement-expiry logic, trivially simple. Cons: revenue doesn't track ongoing costs; must keep shipping pro features to sell to new cohorts.*

**C. Stay free + patronage.** Free app, optional supporter tier (Ko-fi/GitHub Sponsors style, or an in-app "buy the dev a record" with a supporter badge). *Honest assessment: for a portfolio piece serving a small circle, this is the highest joy-per-effort path, avoids the ToS question entirely, and leaves A/B open later. The cost math in `growth-readiness.md` says the app runs on low-double-digit dollars/month up to ~1k users — patronage plausibly covers it.*

**Recommendation:** C now; decide between A and B only if beta retention (BETA-PLAYBOOK Stage 1 exit criteria) proves strangers stick. If charging: B fits the audience better unless costs at scale demand A.

## Infra it would require (deliberately not specced yet)

- **Entitlement**: one field on `users` (e.g. `pro_until` / `pro: boolean`), checked server-side in the guarded functions that serve gated surfaces, mirrored into `getLatestUser`'s safe payload for UI gating. Fits the existing auth pattern with no new tables.
- **Payments**: Stripe Checkout + a webhook → Convex HTTP action setting the entitlement. No App Store cut applies (PWA) — but see `growth-readiness.md` on the account-recovery problem *before* taking anyone's money: a paying user who loses Discogs access currently loses everything.
- **Refund/support surface**: a support email at minimum. Selling creates obligations the current zero-comms setup can't meet.

## Decisions (answered July 2026)

1. ~~Revenue vs sustainability?~~ **Sustainability.** Costs covered = success; the tier design should be the lightest structure that recoups infra spend at each scale step.
2. ~~Email Discogs?~~ **Yes — approved.** Draft below; Shawn sends it from hello@shawnhiatt.com.
3. Still open: if charging starts, are early friends grandfathered free? (Recommend yes — decide when the first invoice from Convex/Sentry actually arrives.)

## Appendix — draft Discogs outreach email

To: api@discogs.com (verify the current contact on discogs.com/developers before sending) · From: hello@shawnhiatt.com

> Subject: Commercial-use permission question — Holy Grails (personal Discogs companion app)
>
> Hi,
>
> I'm Shawn Hiatt, an independent designer. I built Holy Grails (holygrails.app), a web app that helps collectors curate their collections — deciding what to keep or sell, planning listening sessions, and looking up pressings while digging. It syncs with Discogs via OAuth: every user authenticates with their own Discogs account and their own token, requests respect the per-token rate limits, and no Discogs data is redistributed — each user only sees their own collection (plus friends who opt in).
>
> Today it's free and serves a handful of friends. If it grows, hosting and database costs will scale with users, and I'd want to charge a modest fee purely to cover those costs. Before doing that, I want to make sure I'm on the right side of your API Terms of Use, so two questions:
>
> 1. May I charge users of an app that integrates the Discogs API in this way (personal collection tools built on each user's own OAuth token)?
> 2. If yes — may marketplace data (lowest ask, price suggestions) appear in the paid app, or must those surfaces stay free / be removed?
>
> Happy to share more detail about the app or adjust anything about how it uses the API. Thanks for the database — it's the foundation this whole hobby runs on.
>
> Shawn
