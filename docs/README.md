# docs/

What lives here and what each file is for. **Shipped features are documented in
`CLAUDE.md`, not here** — implementation plans are deleted once executed
(precedent: the Session Builder and all-formats plans), so nothing in this
folder describes how the app currently works.

## Planning & strategy

| Doc | What it is |
|---|---|
| `BETA-PLAYBOOK.md` | The runbook for inviting testers — gate checklist, stages, exit criteria. Not in motion yet. |
| `feature-opportunities.md` | Ranked non-AI backlog, with scope decisions recorded so they stay decided. |
| `ai-opportunities.md` | Companion to the above for the Claude API integration. A brainstorming dock — nothing committed. |
| `growth-readiness.md` | Infrastructure lens: does the OAuth/Convex model scale, and the two named cliffs. |
| `monetization-plan.md` | Free/paid posture (cost-recovery) and the Discogs ToS gate that precedes any of it. |
| `competitor-landscape.md` | Market snapshot, July 2026. Pricing changes fast — re-verify before citing. |

## Reference

| Doc | What it is |
|---|---|
| `market-value-drip.md` | The one shipped feature with its own doc: the per-release market-value cron. Mechanics, currency, migration, scaling. |
| `native-app-plan.md` | Post-1.0 SwiftUI project. Deliberately not started. |
| `native-swift-features.md` | PWA platform walls hit and removed, logged for the native port (haptics so far). |

## `Discogs API V2 - *.md`

A local snapshot of Discogs' developer documentation, kept so API surface can be
checked without a network round trip. Two caveats:

- **It is a dated scrape and the live API has moved past it.** Fields the app
  relies on today — `cover_image` and `master_id` on search results, the filter
  facets on `/masters/{id}/versions`, `lowest_price`/`num_for_sale` on
  `/releases/{id}` — do not all appear in it. Treat the snapshot as a map, not
  as a contract, and verify shapes against a live response.
- **Seller-side pages were removed** (Inventory Export, Inventory Upload) —
  marketplace/seller tooling is permanently out of scope per `CLAUDE.md`.
  `Marketplace.md` is kept whole for its Price Suggestions and Release
  Statistics sections, which back the Value section and the drip.
