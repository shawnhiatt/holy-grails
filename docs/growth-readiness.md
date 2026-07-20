# Holy Grails — Growth Readiness, July 2026

Is the architecture ready to grow — and specifically, is the Discogs-OAuth account model okay to scale with? Infrastructure/business lens; the user-facing rollout stages live in `docs/BETA-PLAYBOOK.md` and are not repeated here.

---

## Verdict up front

**Yes, OAuth 1.0a scales — it's the right model for this app — with three named risks to manage** (single consumer key, no user comms channel, Discogs as identity provider). The architecture after the v0.5.6 remediation (server-side sync, per-device sessions, cached mirrors, adaptive rate limiting) is genuinely growth-shaped. The two concrete scaling cliffs found are the market-value drip batch size and `followed_items` row duplication — both fixable inside the current design.

## Discogs API & OAuth at scale

**What holds:** rate limits are **per token** — 60 req/min per authenticated user ([Discogs developers](https://www.discogs.com/developers)). Every new user brings their own budget; sync cost per user is constant. The adaptive throttling in `discogsFetch` already honors the headers. There is no documented per-consumer-key aggregate limit.

**Risk 1 — one consumer key.** All users ride `DISCOGS_CONSUMER_KEY`. Discogs can throttle or revoke a key that misbehaves or violates terms (see the ToS gate in `docs/monetization-plan.md`). Mitigations: stay conspicuously ToS-clean (the app's request patterns are user-initiated and cached — good), follow the [application naming policy](https://www.discogs.com/help/doc/naming-your-application), and introduce the app to Discogs before scale rather than after (same email as the monetization ask).

**Risk 2 — OAuth 1.0a is legacy tech, but it's Discogs' only offering.** The API has been stable for years (effectively maintenance mode — also means no new capabilities coming). The implementation cost is already paid and server-side. Nothing to do; just don't expect Discogs to modernize, and treat any Discogs auth-change announcement as a drop-everything event.

**Risk 3 — Discogs IS the identity provider.** No email, no password, no HG account. Consequences:
- *Account recovery is actually fine*: recovery = log into Discogs again; sessions re-mint per device. The user's Discogs account is the durable identity.
- *No comms channel at all*: can't email users about breaking changes, security incidents, or receipts. Acceptable for a free friends-app; **not acceptable for a paid product** — collecting an optional email (Convex field + Settings input, or Stripe's receipt email as a side effect) becomes mandatory the day money moves.
- *Discogs outage = no new logins* (existing 90-day sessions keep working against cached data — the mirrors earn their keep here).
- *A banned/closed Discogs account orphans the HG data.* Rare; the insurance-export feature (`feature-opportunities.md` #11) is the practical mitigation.

## Convex scaling

Per-user row footprint (15 tables): the collection cache dominates — one row per album (a 500-record collection ≈ 500 rows) plus wantlist, purge tags, plays, priorities. Call it **~1–2k rows / active user**, small rows. Function-call volume is subscription-driven and modest; the server-side sync writes diffs, not full payloads.

| Scale | Rough shape | Assessment |
|---|---|---|
| ~100 users | ≲200k rows | Free tier territory (per BETA-PLAYBOOK Stage 2's projection advice — watch the dashboard, not estimates) |
| ~1k users | ~1–2M rows | Convex paid tier (~$25/mo class); still no architectural changes |
| ~10k users | ~10–20M rows + the two cliffs below | Paid tier + the fixes below; also revisit list virtualization (AUDIT-2026-07 §5.2) for whale collections |

**Cliff 1 — `followed_items` duplication.** Rows are stored **per (follower, followed-user) pair** — two followers of the same collector store his collection twice (cleanup-on-unfollow confirms the keying). At 1k users × 10 follows × 500 records that's ~5M rows of duplicated mirrors, the largest table by far. Fix inside the current design: key followed mirrors by followed-username alone (shared, like `market_values` did for prices) with a follower-count refcount for cleanup. Not urgent below ~1k users; write the spec when Stage 2 of the beta starts.

**Cliff 2 — market-value drip throughput.** `MARKET_BATCH_SIZE = 40/day` with 30-day staleness (`convex/marketValue.ts`) keeps at most **~1,200 unique releases** fresh — right for a handful of friends, hopeless at 100+ users (a single 2k-record collection can't even price itself once). The design already round-robins across user tokens, so the budget grows with users; the batch size just doesn't. Fix: scale batch with the token pool (e.g. `min(40 × activeTokens, cap)`) and/or run the cron more often. Small spec, one session, already anticipated in `docs/market-value-drip.md`'s scaling notes.

**Convex ops posture:** enable/verify scheduled backups in the dashboard; the deploy discipline (dev vs prod, `npx convex deploy` before Vercel) is documented and CI-guarded — good. No admin tooling exists (inspecting/cleaning a user's rows means the dashboard); acceptable now, and `users.deleteAllUserData` covers the user-initiated case.

## Other operational readiness

- **Vercel/PWA**: static hosting + Convex scales trivially; nothing to do. The `/img-proxy/` rewrite rides Vercel's edge — watch its bandwidth line item at scale since every dominant-color card proxies artwork.
- **Monitoring**: Sentry is wired but the account/DSN/alert rule are still pending (BETA-PLAYBOOK gate #2) — that's the actual blocker to putting strangers on the app, more than anything in this doc.
- **Bus factor = 1** and the codebase is AI-assisted with excellent internal docs (CLAUDE.md is the mitigation itself). The Milk Crate precedent (`competitor-landscape.md`) is what winding down without warning looks like — if the app ever has real strangers depending on it, the insurance-export feature is also the ethical exit story.
- **Legal surface**: privacy note shipped; the real `/privacy` page and terms are Stage-2 items in the playbook; both become non-optional the day either money or 100+ strangers arrive.

## Priority order (infrastructure only)

1. Finish Sentry setup (playbook gate #2 — pre-beta).
2. Verify Convex backups are on (5 minutes, do it now).
3. Spec + ship the drip batch scaling (before Stage 1 invites even — testers with big collections will notice empty Insights).
4. Spec `followed_items` sharing (trigger: Stage 2 / ~500 users).
5. Optional-email field (trigger: any money).
