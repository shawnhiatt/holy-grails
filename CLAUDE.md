# CLAUDE.md — Holy Grails v0.7.0

This file is read by Claude Code at the start of every session. Follow everything here before making any decisions about architecture, design, or implementation.

---

## What This App Is

**Holy Grails** is a vinyl record collection management PWA that syncs with Discogs. It is not a Discogs clone. The core value is decision-making and curation — specifically the purge workflow (evaluating records as Keep / Cut / Maybe) and session building. These are things Discogs does not do.

The app is a passion project and portfolio piece built by a designer (Shawn) using vibe coding. Designed for a small circle of friends today with potential to scale. Code quality matters, but preserving the design integrity matters more. When in doubt, match the existing visual and interaction patterns exactly.

---

## Tech Stack

- **Framework**: React + TypeScript
- **Build tool**: Vite
- **Styling**: Tailwind CSS + CSS custom properties
- **Animation**: Framer Motion (imported as `motion` from `"motion/react"`)
- **Icons**: Phosphor Icons (`@phosphor-icons/react`) — imported EXCLUSIVELY through the alias shim `src/app/components/icons.ts`, which re-exports Phosphor icons under the legacy Lucide names the components were written against (e.g. `VinylRecordIcon as Disc3`, `CardsThreeIcon as GalleryVerticalEnd`). Never import from `@phosphor-icons/react` directly in a component, and never reintroduce `lucide-react`. Phosphor has no `strokeWidth` prop — boldness comes from `weight`: `regular` is the global default (set via `IconContext.Provider` in `main.tsx` with `size: 24`, matching Lucide's implicit defaults), `fill` marks active states (selected nav tab, filled heart/bolt/star, solid Play triangles), `light` is the deliberately airy stroke (inactive nav, header buttons, outline hearts/stars — replaces the old fractional strokeWidths 1.2–1.5), `bold` replaces the old strokeWidth 2.25–3 emphasis (small confirm checks, the feed Shuffle button). `thin` and `duotone` are unused — do not introduce them without a design pass.
- **Charts**: Recharts
- **Barcode decoding**: zxing-wasm — used ONLY by the Look It Up barcode scanner. Lazy-loaded (dynamic import) with the .wasm bundled locally via `?url` so nothing fetches from a CDN; excluded from the SW precache. Do not import it anywhere else or statically.
- **Cover identification**: `@anthropic-ai/sdk` — SERVER-ONLY, imported exclusively by `convex/vision.ts` (`"use node"`). Powers the Look It Up scanner's Cover mode: a downscaled camera frame goes to the `vision.identifyCover` action, which asks Claude (`claude-sonnet-5`, structured JSON output — model constant in `convex/coverIdentity.ts`) for `{artist, title}` and feeds the existing search. Requires the `ANTHROPIC_API_KEY` Convex env var; without it the action returns `unconfigured` and the client toasts "Cover scan isn't set up." Never import this SDK in client code — it must stay out of the browser bundle.
- **Fonts**: Bricolage Grotesque (display/headings) + DM Sans (body/UI) via Google Fonts
- **Backend**: Convex (all Holy Grails-exclusive data — purge tags, sessions, following, preferences, last played, want priorities)
- **Auth**: Discogs OAuth 1.0a — the Discogs username is the primary key for all Convex data. Session-token-based auth guards on all Convex functions (see Authentication Architecture). There is no separate Holy Grails account system.

Do not introduce new dependencies without flagging it first. The existing stack is intentional.

---

## Data Architecture

### What lives in Discogs (via API sync)
- Collection (albums, folders, conditions, notes, custom fields)
- Want list
- User profile (username, avatar, location, bio, buyer/seller ratings, registered date, contributions)

### What lives in Convex (Holy Grails-exclusive)
- Purge tags (keep / cut / maybe + timestamps), keyed by `discogs_username` + `release_id`
- Sessions (name, album order, created/modified timestamps, optional `share_id`, plus the Session Builder's `kind`/`rule`/`excluded_ids`/`name_generated`), keyed by `discogs_username` — stored in the `stacks` table (see the Sessions naming note below). A session can be shared via a **capability-token link**: `stacks.enableShare` mints an unguessable `share_id` (128-bit) indexed by `by_share_id`; `stacks.getShared` is **deliberately unauthenticated** (the `share_id` IS the capability) and returns only whitelisted display fields. For an **auto session** it evaluates the rule server-side against the sharer's `collection` rows (folding in purge tags and play history from their own tables, and market values only when the rule asks for them) — this is why the free-data pass wrote genres/rating into the Convex table rather than only onto the client `Album` type. Deterministic rotation is load-bearing here: the seed is a function of `stack_id` and the clock, never of stored state, so a viewer sees the same set as the owner. An unreadable rule shows **nothing**, never the whole collection (`name`, `last_modified`, and per-album `title`/`artist`/`year`/`cover`/`thumb` joined from the sharer's `collection` cache) — never usernames, tokens, notes, conditions, price paid, or release ids. Unknown and revoked (`disableShare`) share ids are both `null`, following the Cross-User Data Pattern.
- Following list (other Discogs users being followed in-app + `avatar_url`), keyed by `discogs_username`
- Following feed cache (`following_feed` table — 50 most recent albums per followed user, 24h TTL per user, up to 25 users)
- Wantlist cache (`wantlist` table — mirrors Discogs wantlist for offline/fast reads, 24h TTL synced alongside collection). Carries `dateAdded` and the free-data fields; note the sync's `applyDiff` projection in `convex/discogs.ts` must list them explicitly — it silently dropped the free-data fields from the wantlist half of that pass until v0.7.x, so add any new field to the projection as well as to the schema, the mutation args, and `wantSignature`.
- Want list priority bolts, keyed by `discogs_username` + `release_id`
- Last-played timestamps, keyed by `discogs_username` + `release_id`
- Collection cache (`collection` table — mirrors Discogs collection for offline/fast reads; local `albums`/`wants` state is reactively derived from these cache subscriptions).

### Free data (Session Builder phase 1)
Five fields ride along on the collection/wantlist responses the sync already makes and used to be discarded. **Zero extra Discogs requests.** All are `v.optional` on `collection`/`wantlist` and on `Album`/`WantItem`: `genres`, `styles`, `rating`, `discCount`, `artistIds` (wantlist has no `rating` — Discogs only rates copies you own). The wantlist also stores **`dateAdded`** (Discogs' `date_added`, normalized to `"YYYY-MM-DD"` so one parser reads it and the collection's alike) — it powers the identity block's recent-adds delta. Mapped in `convex/discogs.ts` via the shared `tagListOf`/`ratingOf`/`discCountOf`/`artistIdsOf` helpers next to `flattenFormats`.

- **`rating: 0` means UNRATED, not zero stars** — the same trap as `year: 0`. The mapper strips the 0 at the boundary, so a stored rating is always a real 1–5 and `undefined` is the only representation of unrated. Read through the exported **`hasRating`** guard in `discogs-api.ts` (exported, unlike the per-file `hasYear`, because client and server rule evaluation need the identical predicate). Never write `rating < 1` to find unrated records, and never store a 0. Distinct from the **community** average rating album detail shows from the enriched release fetch — different number, different meaning, and they sit near each other.
- **The fields are in `albumSignature`/`wantSignature`** (`convex/collection.ts`, `convex/wantlist.ts`). That is deliberate and load-bearing: the signature is what decides whether `applyDiff` patches an existing row, so leaving them out would mean already-cached records never backfill and the data would only appear on records added after the deploy.
- **Backfill is per-user on next sync** (24h TTL or manual SYNC), same as the all-formats change. Sharper edge here: a session built on genre before the backfill lands looks *broken*, not stale — which is why session presets are generated from the collection's actual data.
- `discCount` and `artistIds` are stored but **deliberately unsurfaced** — quiet infrastructure for rules. Extra labels beyond `labels[0]` are still skipped.
- Market values (`market_values` table — Spec 6A.1). Lowest-ask price stored **once per Discogs release**, shared across every user who owns it (a release's ask is the same for everyone, so per-user storage was duplicated data + duplicated fetches). Filled by a **daily drip**: the `marketValueDrip` cron (`convex/crons.ts` → internal action in `convex/discogs.ts`) seeds the set from all collections (`market_values.seedFromCollection`, which also migrates the legacy per-user values), then prices a `MARKET_BATCH_SIZE` batch of the stalest releases (`market_values.getDripBatch`, ordered by `fetchedAt` — no cursor) from `/marketplace/stats?curr_abbr=USD`, **round-robin across users' tokens** so each user's 60/min budget stays intact. `value` is `v.union(number, null)` — `null` = fetched-but-no-listings, `undefined` = never fetched (excluded from rankings). Client reads via `market_values.getForUser` (Session B, Insights). The legacy `collection.marketValue`/`marketValueFetchedAt` + `users.market_cursor` fields are kept only for the one-time migration and are otherwise dead. Full write-up (mechanics, currency, migration, scaling) in `docs/market-value-drip.md`.
- Followed collections cache (`followed_items` table — slim rows of each followed user's collection + wantlist, written server-side by `discogs.syncFollowedUser`, read per-profile; sync metadata `is_private`/`collection_synced_at` lives on the `following` table)
- Sync progress (`sync_status` table — one doc per user, written by the server-side sync loop, subscribed by the client for per-page progress)
- User preferences (theme, hide purge indicators, shake to random, view mode, want view mode, default screen, default collection sort, recent Look It Up searches, format scope, session cap + session rotation), keyed by `discogs_username`. The `hide_gallery_meta` field is legacy — its swiper view was removed and the Settings toggle deleted with it. Its write plumbing (`preferences.ts`) is gone and the schema field is now `v.optional` (nothing reads or writes it); the schema line can be deleted after a clear-then-redeploy pass strips it from existing docs. Do not resurface it.
- Bug reports and ideas (`bug_reports` table — the reporter's note, `kind` (`bug`/`idea`), `status` (`new`/`known`/`fixed`), an optional admin `resolution_note`, an optional `screenshot_id` in Convex file storage, plus `diagnostics` and `recent_errors` captured client-side). Keyed by `discogs_username`. See the Bug Reports section below.
- OAuth tokens (access token + token secret), `session_token`, `session_created_at`, `collection_value`, `collection_value_synced_at`, `discogs_avatar_url`, `created_at`, `last_synced_at`, stored in the `users` table

### Session Builder (sessions that fill themselves)

A session can define itself by criteria instead of by hand-picking — "jazz, before 1980, four stars and up" — and stay current as the collection changes. The model is Mailchimp audience segmentation: a saved query over data you already hold, not a list you push things into. The implementation plan has been retired now that it shipped — this section is the spec. The one deferred follow-up is in the Backlog.

**There is no second object type.** There are just Sessions; some are filled by hand, some fill themselves. That is a property (`kind`), not a category — one list, one mental model, no fork at creation. `kind: undefined` reads as manual, so every session predating this is already correct.

**Membership is DERIVED, never stored.** `album_ids` stays `[]` for an auto session and the rule is the only source of truth. This is the whole design, and it *removes* machinery rather than adding it: auto-add is free (no cron, no trigger, no write path), nothing can drift, a 3000-record sync doesn't rewrite every session, and there are no cross-device races. Because `albums` in `app-context.tsx` already re-derives from the Convex collection subscription, the `stackMembership` memo updates the instant a sync lands. **Do not add a materialized cache of matching ids** — the accepted cost is that contents aren't pinned (pull a record from the collection and it leaves the session silently), which is the correct semantic for a session that fills itself.

- **The evaluator is `convex/stackRules.ts`** — pure, no Convex deps, so one implementation serves the live view and the share link. `field`/`op` are loose strings (the `view_mode` precedent): unrecognized conditions are **ignored**, so an old deployment reads a new rule. The one exception: a rule whose conditions are *all* unrecognized matches **nothing** — an empty session is recoverable, one that silently swallowed the whole collection is not.
- **Evaluation order is specified and must not be reordered** (client and server have to agree exactly): filter by conditions → remove `excluded_ids` → if rotating and `pool >= limit * 1.5`, seeded-shuffle by `stack_id + period bucket` and take `limit`, else sort and take `limit` → sort for display. **Rotation picks *which* records; the sort rule always decides the *running order*.** Keeping them independent is what lets a daily-rotating jazz session still play oldest-first.
- **Caps are on by default, named in listening terms** — One sitting (10) · An evening (25) · A deep dig (50) · No cap. Sessions are listening sets, not query results: "148 releases match" is a search, not an evening. `CAP_TIERS`/`capToLimit` live in `stackRules.ts`; the global default is Settings → Sessions (`session_cap`), and it applies to **newly built sessions only** — changing it never rewrites a session that already has its own rule.
- **Rotation defaults ON for capped sessions and OFF with no cap**, and that default is only honest because the disclosure ships with it. Three surfaces, all required: (1) the builder states it before saving — *"148 releases match. This session plays 25, rotating daily."*; (2) every rotating session carries **"In rotation · 25 of 148"** permanently, in the list and on the detail header — without this, someone who saw a release yesterday and can't find it today concludes the app lost it; (3) Settings → Sessions. Do not turn rotation on anywhere these are missing.
- **Rotation engages only at `pool >= limit * 1.5`.** Below that it reshuffles nearly the same records and reads as random noise rather than freshness.
- **Rotation stores nothing.** `rotationBucket` is `floor((now - ROTATION_OFFSET_MS) / period)` — same number all period, one higher next. `ROTATION_OFFSET_MS` is 10h so the flip lands in the early morning US rather than at 00:00 UTC, which is mid-evening — prime listening, the worst moment for a set to change under someone.
- **Access membership through `stackMembership` from context**, never `stack.albumIds` — the map covers both kinds so call sites need no special-casing. `isInStack`/`isAlbumInAnyStack` already read through it.
- **You cannot hand-add to a query.** `toggleAlbumInStack` refuses auto sessions as a backstop; the pickers show them **locked with "Fills itself"** rather than hiding them. Removing a record from an auto session records an *exclusion* (`excluded_ids`), since un-adding it would just be re-matched.
- **Freeze** (`stacks.freeze`, "Keep this set") materializes the current contents into `album_ids`, drops the rule, and leaves an ordinary hand-filled session. The client passes the ids because it has already evaluated them for display — re-deriving server-side could disagree with what the user is looking at.
- **Titles are generated, always, and editable.** A required blank-name step is friction at the moment of excitement, and the generated name doubles as a readback that lets the user verify they built what they meant. It carries only the **first three criteria** — cram five in and it stops being a name and becomes a query string — with the full set always rendered as chips underneath, on the builder and on the session itself. It **regenerates live while building and freezes permanently the moment the user types their own**: `shouldRegenerateName` compares `name` against the stored `name_generated` rather than a fresh generation, so a later change to the generator can't un-freeze a name someone chose.
- **Builder fields hide when they'd be no-ops** (`availableFields`): genre until something carries one, rating until something is rated, format for a single-medium collection. Same reasoning as the presets — before the free-data backfill reaches a user, offering the field would only produce a rule that matches nothing.
- **Presets are generated from the real collection** (`utils/stack-presets.ts`), never a fixed list. That is a product call (a preset yielding nothing is worse than no preset) and it is also what makes the free-data backfill invisible: before a user re-syncs, the genre and rating presets simply don't appear.
- **Never call it "smart"** — this is saved logic, not intelligence, and it would collide with VinylBox's Smart Folders. The badge is **AUTO**; the sheet is the **Session Builder**; the copy is a verb ("this session fills itself"). Reserve proper noun, if one is ever needed: **Standing Session**.

### Sessions Naming Note (feature name vs. internal names)
The listening-sessions feature is called **Sessions** in all user-facing copy and documentation. It was briefly renamed "Stacks" (June 2026) and then rolled back to Sessions — but ONLY the verbiage rolled back. Internal names keep the stack-era naming and must not be renamed:
- Convex table: `stacks` (in `convex/stacks.ts`). It CANNOT be renamed to `sessions` — an undeclared legacy `sessions` table from before the rename still holds old rows in both deployments, and declaring that name fails Convex schema validation.
- Files: `stacks.tsx`, `stack-picker-sheet.tsx`, `stack-builder.tsx`, `convex/stacks.ts`, `convex/stackRules.ts`, `utils/stack-presets.ts`
- Code identifiers: the `Stack` type, `stacks` state, `createStackDirect`, `deleteStack`, `renameStack`, `toggleAlbumInStack`, `isInStack`, `reorderStackAlbums`, `stackPickerAlbumId`, `onNewStack`, `shareStack`/`unshareStack` (context), `enableShare`/`disableShare`/`getShared` (Convex), `share_id`/`shareId`, and the Session Builder's `StackRule`/`StackRuleCondition`/`evaluateStackRule`/`stackMembership`/`createAutoStack`/`updateStackRule`/`excludeFromStack`/`freezeStack`/`previewStackRule`, etc. The share feature uses `stack*`/`share*` names, never `session*`.
- Screen route key and stored `default_screen` preference value: `"stacks"`
Do not rename these identifiers to `session*` — besides the table constraint, they would collide with auth session naming (`sessionToken`, `auth_sessions`). When writing user-facing copy or docs, always say Sessions.

### Formats (all-formats)
Holy Grails syncs **every media format Discogs supports** (vinyl, CD, cassette, shellac, box sets, files, …). Scope is a **display-only** concern, never a data-layer filter. The data layer stores everything; `syncSelf`/`syncFollowedUser` do not filter by format, and the caches are faithful mirrors of Discogs.

- **`mediaType(format)`** (`discogs-api.ts`) classifies a raw Discogs format string into a UI bucket (`Vinyl | Shellac | CD | Cassette | Tape | DVD | Blu-ray | Digital | Box Set | Other`). First match wins; unmatched/empty → `"Other"`. It replaced the old `isVinylFormat` and powers badges, the filter drawer, Reports By Format, and the vinyl display scope. Nothing server-side classifies, so there is deliberately no Convex mirror (add one only if a server path needs it).
- **`format_scope` preference** (`"all"` default | `"vinyl"`) is applied at the client collection/wantlist derive in `app-context.tsx` — with `"all"` the filter is a no-op; `"vinyl"` reproduces the old vinyl-only view from richer data. Set from Settings → Formats. Never re-add a format filter at write time (sync/`applyDiff`/the derives store everything).
- **Format badge** (`format-badge.tsx`): a non-vinyl-only chip (CD, Cassette, 78, …) on grid cards, list rows, wantlist cards, and followed-profile views. Vinyl stays unbadged; missing/empty format renders no badge (never assume vinyl).
- **Backfill on next sync**: after deploy, each user's non-vinyl rows appear on their next sync (24h TTL / manual SYNC) via `applyDiff`'s normal add path — no migration script. `wantlist`/`followed_items`/`following_feed` rows gained an optional `format` field; legacy rows read `undefined` (no badge) until re-synced.

### Rules
- Never use localStorage for any persistent data
- All Convex reads use `useQuery`, all writes use `useMutation`
- Use optimistic updates for writes wherever Convex supports it
- The public API of `app-context.tsx` must not change when wiring Convex — components should not need to update
- **Reactive hydration:** local `albums` and `wants` state is derived from the Convex `collection`/`wantlist` cache subscriptions (merged with purge tags / want priorities) in `app-context.tsx`. Any code path that changes collection/wantlist data MUST also write the corresponding Convex cache mutation (`addItem`/`removeItem`/`updateInstance`/`renameFolderInCache`), or the change will be reverted by the next re-derive.
- **Search state is screen-local:** `searchQuery` (Collection) and `wantSearchQuery` (Wantlist) live in their screens, filtered via the `useFilteredAlbums` hook — they are intentionally NOT in the app context so a keystroke doesn't re-render every context consumer. Do not add search state back to `app-context.tsx`. Do not put `searchQuery` in view `key` props (it remounts the whole grid per keystroke) — pass `resetKey` for scroll-to-top instead.

---

## Authentication Architecture

**Session token auth pattern:**
All Convex queries and mutations (except the `oauth.ts` handshake) require a valid `sessionToken`. A central `authenticateUser()` helper in `convex/authHelper.ts` handles validation (including expiry) and returns the authenticated user record. The `discogs_username` is always derived server-side from the authenticated user — never accepted as a client-supplied argument.

**Session token flow:**
`auth-callback.tsx` makes a single server-side action call — `oauth.completeLogin(oauth_token, oauth_token_secret, oauth_verifier)` — which exchanges the verifier for an access token, derives the username from Discogs `/oauth/identity` (the client can NEVER supply a username), and upserts the user via the internal `users.upsert` mutation. Raw OAuth access tokens never reach the client. The returned `sessionToken` is stored in `app-context.tsx` state, persisted to `localStorage` as `hg_session_token`, and threaded through all Convex mutation/query call sites.

**Per-device sessions (`auth_sessions` table):**
Every OAuth login mints a FRESH token as its own row in the `sessions` table (token rotation), so one device's login never invalidates another device's session. Sign-out (`users.clearSession`) deletes only the calling device's row — the user record (OAuth tokens, sync metadata) stays, so the next login boots instantly from cache. Sessions expire 90 days after mint (`SESSION_TTL_MS` in `authHelper.ts`); expired rows are pruned at login, and `resolveSession` also honors the legacy single-token fields on `users` read-only until those age out. `users.deleteAllUserData` clears all sessions.

**Session token persistence (`hg_session_token`):**
The `setSessionToken` wrapper in `app-context.tsx` syncs every token change to `localStorage`. On cold load, `sessionToken` state initializes from `localStorage.getItem("hg_session_token")`. If a stored token exists, it is passed to `getLatestUser` to look up the user by `by_session_token` index. If no stored token exists (fresh visitor, incognito, post-logout), `getLatestUser` is skipped entirely and the visitor sees the login screen. If the stored token is invalid (no matching user), the token is cleared from localStorage and the visitor sees the login screen (or the next stored account is promoted — see Multiple Accounts). See the localStorage whitelist in the Discogs API Reference for the permitted keys — do not add other localStorage usage without discussion.

**Multiple Accounts (Spec 5, client-side only):**
Users can sign into more than one Discogs account (e.g. a 12″ account and a 45s account) and switch between them from Settings → Account card. **Zero Convex changes** — the backend already mints an independent `auth_sessions` row per login (per-device token rotation), so an "account" on a device is just a stored session token. `hg_session_token` stays the ACTIVE account's token; a second localStorage key `hg_accounts` holds the full list (`{ username, avatarUrl, sessionToken, addedAt }[]`). All list I/O goes through app-context helpers (`readAccounts`/`persistAccounts`) wrapping the pure `utils/accounts.ts` logic (`parseAccounts`/`upsertAccount`/`removeAccount`/`nextAccount`); `settings-screen.tsx` only calls context functions (`accounts`, `switchAccount`, `addAccount`). **Switching = swap the active token in `hg_session_token` + `location.reload()`** — a deliberate call (the reload boots cleanly from Convex cache subscriptions in ~1s rather than replicating app-context's ~30 hydration/reset paths for an in-place swap; in-place switching is a later optimization with this storage model unchanged). `loginWithOAuth` upserts the account (dedupe by username, which also seeds the list on first login) and, when a *different* account is already active on the device, **reloads into the new token instead of swapping identity in place** — an in-place swap left the previous account's albums/wants on screen (the collection derive's empty-cache guard refuses to clear them while the new account's cache is still empty), so adding/OAuth-switching takes the same clean reload path as `switchAccount` (the fresh cold-load also triggers the new account's first sync). A restore-time effect seeds pre-existing signed-in users. **Add account** kicks off the normal OAuth redirect (the user picks the account on Discogs' side). **Sign out** removes the active account and promotes the next (reload) or falls to login if none remain. An **invalid/expired active token** at restore removes that account and promotes the next instead of dumping to login. **Wipe all data** removes the active account from the list. The Settings Account card presents the accounts as a collapsed **accordion** (matching Contributions) — a list of switchable rows plus an Add account row. No header/avatar switcher in v1 — Settings only.

**users.ts function split:**
- `getLatestUser` — session restore query, requires `sessionToken` argument, looks up user by `by_session_token` index; returns the user record WITHOUT OAuth tokens and WITHOUT echoing the session token; returns `null` for invalid/expired tokens
- `getMe` — authenticated query, returns user record without tokens
- `upsert` — INTERNAL mutation, callable only from `oauth.completeLogin`. It must never be made public: a public variant would let any caller claim any username and receive that user's session token (full account takeover).

**Schema change:**
New `auth_sessions` table (`session_token`, `discogs_username`, `created_at`) with `by_token`/`by_username` indexes. The `session_token`/`session_created_at` fields on `users` are legacy, honored read-only. The table is deliberately NOT named `sessions` — an undeclared legacy `sessions` table from before the Sessions→Stacks rename still holds old rows in the deployments, and declaring that name fails Convex schema validation. (The same collision is why the Sessions feature's own table is still named `stacks` — see the Sessions naming note in Data Architecture.)

**Exempt from auth guards:**
`convex/oauth.ts` functions (`requestToken`, `completeLogin`) are intentionally public — they are the OAuth handshake and must remain unauthenticated. `completeLogin` is safe because the identity it mints a session for comes from the Discogs token exchange itself, not from the caller.

**`discogsAuth` removed from AppState.** Components that previously used `discogsAuth` to make Discogs API calls now get `sessionToken` from `useApp()` and pass it to Convex proxy actions instead.

**`oauthCredentials` state and `convexAuthCredentials` query removed** from `app-context.tsx`. Tokens are resolved server-side.

**`discogsToken` dev flow removed.** All authentication now goes through OAuth. There is no longer a personal access token fallback.

**`authedArgs` pattern (stale token defense):**
All authenticated `useQuery` subscriptions in `app-context.tsx` use a shared `authedArgs` variable that gates on `!!discogsUsername && !!sessionToken`. During session restore, `discogsUsername` is only set after `getLatestUser` confirms the token is valid — so authenticated queries never fire with a stale token. New authenticated queries must use `authedArgs` as their argument condition, not `sessionToken` alone. `getLatestUser` is the only exception — it gates on `sessionToken` only, as it is the gatekeeper query that validates the token before `discogsUsername` is set.

---

## Discogs API Proxy

All authenticated Discogs API calls go through server-side Convex actions in `convex/discogs.ts`. The client never calls the Discogs API directly. Actions look up the user's credentials server-side via `getUserCredentials` (an internalQuery in `convex/discogsHelpers.ts`) and sign requests using HMAC-SHA1.

**convex/discogs.ts** — `"use node"` directive. Public actions (all take `sessionToken` as the first argument): `syncSelf`, `syncFollowedUser`, `proxyFetchIdentity`, `proxyFetchUserProfile`, `proxyFetchSyncSignals`, `proxyFetchWantlist`, `proxyFetchCollectionValue`, `proxyUpdateCollectionInstance`, `proxyMoveToFolder`, `proxyRemoveFromCollection`, `proxyAddToWantlist`, `proxyRemoveFromWantlist`, `proxyFetchRelease`, `proxyFetchUserCollectionPage`, `proxyFetchUserWantlistPage`, `proxyFetchFolders`, `proxyCreateFolder`, `proxyRenameFolder`, `proxyDeleteFolder`, `proxyUpdateProfile`, `proxyAddToCollection`, `proxySearchDatabase`, `proxyFetchMasterVersions`, `proxyFetchMarketData`, `warm` (unauthenticated no-op for runtime pre-warming).

**Standalone database search & market lookup:**
- `proxySearchDatabase` — searches the Discogs database, **all formats** (the vinyl-only release filter was removed with the all-formats change). `type` is `master` (default) or `release` only; pagination is appended server-side. Splits the combined "Artist - Title" result string and returns a trimmed row shape (`id`, `type`, `masterId`, `title`, `artist`, `year`, `thumb`, `cover`, `label`, `catno`, `country`, `format`, `have`, `want`) plus pagination totals.
- `proxyFetchMasterVersions` — pressings of a master, filtered/paginated server-side (`country`, `year`→`released`, `label`, and optional `format` native params; sorted `released asc`). All formats by default; the `format` arg backs the pressing picker's Format facet chip. Returns per-version `inCollection`/`inWantlist`/`haveCount` from `stats`, filter facets (when the API provides them), `mainReleaseId` (fetched once on the unfiltered first page), and pagination totals.
- `proxyFetchMarketData` — condition-tiered price suggestions from `/marketplace/price_suggestions/{id}`. **Returns `null` when the user has no Discogs seller settings** — all callers must treat `null` as "no data" and degrade silently. Never surface an error or a prompt to configure seller settings.
- `proxyFetchRelease` now also returns Tier 1 market signal: `lowestPrice` (number | null, lowest *ask*) and `numForSale`. Zero extra requests — these ride on the existing release fetch.

**Server-side sync loops:**
- `syncSelf` — the user's own collection/wantlist sync runs entirely inside this action: paginated fetch (shared `fetchCollectionInternal`/`fetchWantlistInternal` helpers), all formats stored (no filter), diff writes straight to the Convex `collection`/`wantlist` caches via `applyDiff`, collection value, profile, and sync metadata. Synced data never round-trips through the client; the client receives it reactively through its cache subscriptions. Per-page progress is written to the `sync_status` table.
- `syncFollowedUser` — fetches a followed user's collection (folder 0, `skipPrivateFields` semantics) + wantlist and replaces their `followed_items` rows in chunks. Detects private collections (403 → `is_private` on the `following` row) and refreshes the stored avatar.
- **Adaptive rate limiting** — `discogsFetch` reads `X-Discogs-Ratelimit-Remaining` and backs off progressively as the 60/min budget drains (full speed with headroom, sleeps near the floor, 429 retry as backstop). The old fixed 1.1s sleep between pages is gone; do not re-add fixed sleeps to server-side pagination loops.

**Self-operation username derivation:** Actions that operate on the authenticated user's own data (collection value, instance updates, folder moves/management, collection add/remove, wantlist add/remove, profile update) build their Discogs URLs from `creds.username` returned by `getUserCredentials` — the client-supplied `username` argument is accepted for backward compatibility but ignored. Only the cross-user read actions (`proxyFetchUserProfile`, `proxyFetchWantlist`, `proxyFetchUserCollectionPage`, `proxyFetchUserWantlistPage`) honor the `username` argument, since they are also used to fetch followed users' data.

`proxyAddToCollection` — action #19. POSTs to `/users/{username}/collection/folders/{folder_id}/releases/{release_id}`. Defaults to folder 1 (Uncategorized). Returns `instance_id`. Caller inserts album into local state and Convex collection cache — no full re-sync.

**convex/discogsHelpers.ts** — Contains `getUserCredentials` (internalQuery). Separated from `convex/discogs.ts` because Convex does not allow queries in `"use node"` runtime files. If adding new internal queries needed by Discogs actions, they must live here, not in `discogs.ts`.

**convex/oauth.ts** — OAuth handshake actions (`requestToken`, `completeLogin`). `completeLogin` performs the access-token exchange, derives the username server-side from `/oauth/identity`, and calls the internal `users.upsert`. Reads `DISCOGS_CONSUMER_KEY` and `DISCOGS_CONSUMER_SECRET` from `process.env`. Still uses PLAINTEXT signing (acceptable for transient token exchange over HTTPS).

**discogs-api.ts** — HTTP functions removed. File now contains only: exported types (`Album`, `WantItem`, `Stack`, `FollowedUser`, `FeedAlbum`, `PurgeTag`, `UserProfile`, `CollectionValue`), constants (`CONDITION_GRADES`, `CONDITION_SHORT`), the `MediaType` type + `mediaType()` format classifier (all-formats), and pure utility functions (`normalizeCondition`, `buildFieldMap`). Do not re-add HTTP functions here.

**`DiscogsAuth` type removed.** The client no longer holds raw OAuth credentials. Auth is identified entirely by `sessionToken`.

**`getAuthCredentials` removed from `convex/users.ts`.** Raw OAuth tokens are never returned to the client. Token lookup is internal only via `getUserCredentials` in `convex/discogsHelpers.ts`.

**Convex "use node" constraint:** Files with the `"use node"` directive (like `convex/discogs.ts`) cannot contain queries or mutations — only actions. Any internalQuery needed by a Node.js action must live in a separate file (e.g. `convex/discogsHelpers.ts`) and be called via `ctx.runQuery(internal.discogsHelpers.functionName, args)`.

**Sync progress:** the server-side sync loop writes per-page progress to the `sync_status` table (`convex/syncStatus.ts`); the client subscribes via `api.syncStatus.get` and formats messages like "Syncing collection (150 of 300)" (`formatSyncStatus` in `app-context.tsx`).

---

## Environment Variables

**Client-side (`.env.local`):**
- `VITE_CONVEX_URL` — Convex deployment URL (safe to expose)
- `VITE_SENTRY_DSN` — optional. Sentry error monitoring DSN (safe to expose). When unset — all local dev, any deploy without it — the Sentry SDK is never loaded or initialized; `main.tsx` gates a dynamic import of `src/app/lib/monitoring.ts` on it, so the SDK lives in its own lazy chunk off the critical path. Errors-only config (no tracing, no replay — do not add them without discussion). The app reports through the `reportError()` indirection in `src/app/lib/report-error.ts`, which is a silent no-op until monitoring registers itself.
- `VITE_DISCOGS_CONSUMER_KEY` and `VITE_DISCOGS_CONSUMER_SECRET` have been removed. These now live exclusively in Convex environment variables.

**Convex environment variables (set via Convex dashboard):**
- `DISCOGS_CONSUMER_KEY` — set on both `adventurous-crow-499` (dev) and `unique-sturgeon-566` (prod)
- `DISCOGS_CONSUMER_SECRET` — set on both deployments
- `ANTHROPIC_API_KEY` — Claude API key for the cover scan (`vision.identifyCover`); set on both deployments. Optional in the sense that the app runs without it — cover scan just reports itself unconfigured.
- `HG_ADMIN_USERNAMES` — comma-separated Discogs usernames allowed to read the bug-report inbox (see Bug Reports). Optional and **fails closed**: unset means no admins and the inbox row never appears, so set it on both deployments or you won't see reports. Deliberately an env var, not a code constant — the repo may go public.

Note: Convex env vars cannot be set via `.env` files. Use the Convex dashboard (Settings > Environment Variables) or `npx convex env set KEY value`.

---

## Running the Project

```bash
npm install
npm run dev        # http://localhost:1234 (Vite, port set in vite.config.ts)
npm run typecheck  # strict tsc --noEmit — must pass before committing
npm run lint       # ESLint — must pass before committing (CI runs it)
npm test           # Vitest — must pass before committing (CI runs it)
npm run build      # production build (requires VITE_CONVEX_URL)
```

---

## Linting

ESLint (flat config, `eslint.config.js`) runs in CI between typecheck and test. Beyond baseline correctness (typescript-eslint recommended + `react-hooks/rules-of-hooks` as errors, `exhaustive-deps` as warnings), the config mechanically enforces several of this file's guardrails — direct `@phosphor-icons/react` imports (outside `icons.ts`), `lucide-react`, static `zxing-wasm` imports, web storage outside the whitelisted files, `discogs.com` hrefs, `Math.random()` sort-shuffles, and `h-screen` are all lint **errors**. If a rule fires, fix the code to follow the guardrail — never add an `eslint-disable`; a genuine exception is a CLAUDE.md discussion first, then a scoped file override in `eslint.config.js` with a comment.

Two grandfathered exceptions are encoded as overrides: the splash screen's pre-auth "Sign up" link to discogs.com/register (users need a Discogs account to log in at all — the post-auth ban stands), and `app-context.tsx`'s defensive `sessionStorage.removeItem("hg_oauth_token_secret")` clears on sign-out/data-wipe (same key as the oauth-helpers whitelist).

The react-hooks v6 compiler-era rules (`refs`, `set-state-in-effect`, `purity`, …) are deliberately off — they flag ~80 long-standing intentional patterns; enabling them is a dedicated refactor pass. `@typescript-eslint/no-explicit-any` is off for the same reason (46 pre-existing `any`s, backlog).

---

## Testing

Vitest, run via `npm test` (wired into CI alongside typecheck and build). Config lives in `vitest.config.ts` — deliberately separate from `vite.config.ts` so tests run without plugins or `VITE_CONVEX_URL`. No component/DOM testing layer (no jsdom, no testing-library) — tests cover Convex functions and pure logic only. Do not add DOM testing dependencies without flagging first.

**Convex function tests** (`convex/*.test.ts`, via `convex-test`): run in the `edge-runtime` environment — each file opts in with a `// @vitest-environment edge-runtime` docblock as its FIRST line (it must precede the `/// <reference types="vite/client" />` line that types `import.meta.glob`). The Convex CLI ignores `*.test.ts` when deploying. These tests protect the security invariants and must never be weakened or deleted to make a change pass:
- `authHelper.test.ts` — session-token guard: valid/unknown/empty/expired tokens, the 90-day TTL boundary, legacy single-token fallback, per-device sign-out isolation, and that `getMe`/`getLatestUser` never return `access_token`/`token_secret`/`session_token`.
- `shareActivity.test.ts` — the Cross-User Data Pattern gate: unauthenticated viewers rejected, only `shareActivity === true` exposed, "not found" indistinguishable from "not opted in", no token leakage, and that viewers authenticated via the `auth_sessions` table (every fresh login) can read opted-in targets.
- `stacks.test.ts` — the session-share capability gate: `getShared` returns only whitelisted display fields for a valid `share_id`, preserves album order, silently skips albums no longer in the collection, returns `null` for unknown/empty/revoked ids (revoked indistinguishable from unknown), `enableShare`/`disableShare` reject bad session tokens, `enableShare` is idempotent, and the payload never leaks username/tokens/notes/conditions/ids. **All four invariants are re-proved on the auto-session path** (rule evaluated instead of `album_ids`, sort order, exclusions, purge tags and play history folded in from their own tables, the cap applied, two reads in a period agreeing so a viewer sees the owner's set, the rule object never shipping, and an unreadable rule yielding an empty list rather than the whole collection).
- `bugReports.test.ts` — the app's first admin-gated surface: every function rejects an invalid session token, `listMine` returns only the caller's own reports, the `HG_ADMIN_USERNAMES` allowlist parses/matches case-insensitively and **fails closed when unset** (no substring matches), a non-admin gets `null` from `listAll` and "Not found." from `setStatus`/`remove`, the hourly rate limit and recent-error cap hold, and `users.deleteAllUserData` takes the reporter's reports with it.
- `stackRules.test.ts` — the session rule engine (plain node env — it's a pure module, no convex-test needed). Covers every field/operator, the `year: 0` and `rating: 0` sentinels, unknown conditions being ignored while an all-unknown rule matches nothing, seeded-shuffle determinism, the rotation bucket holding steady within a period and its early-morning flip, the 1.5× rotation threshold, rotation-picks-vs-sort-orders, and that a newly added record joins with no write path.
- `stack-rule-labels.test.ts` (node env, pure) — chip phrasing per field, day pluralization, graceful rendering of an operator this build doesn't know, the three-criteria title cap and its "and more" tail, and the title freeze (including that it does *not* un-freeze when the generator changes).
- `market_values.test.ts` — the shared per-release market-value drip (Spec 6A.1): `seedFromCollection` dedupes across owners + migrates legacy per-user values + is idempotent, `getDripBatch` returns never-fetched/stalest-first capped, `setValue` advances `fetchedAt` always and writes `value` only on success (preserving prior value on failure) + no-ops for a missing row, and `getForUser` scopes to the caller's own priced releases + rejects unauthenticated callers.

**Pure logic tests** (`src/**/*.test.ts`, node environment): `use-filtered-albums` (via the exported pure `filterAndSortAlbums` — the hook wraps it in `useMemo`; keep the split so the logic stays testable without React), `collection-facts` threshold gating (including the "Most rotated" 2-play gate and the omitted-when-no-playCounts case), `format.ts` relative-time ladder, `buildFieldMap`, `mediaType` (format classifier), the Fisher–Yates `shuffle`, `insights.ts` (add-year bucketing for Collection Growth), and `accounts.ts` (multi-account upsert/dedupe/remove/promote-next + defensive JSON parse). `convex/coverIdentity.test.ts` (plain node env — no convex-test/edge-runtime needed, it's a pure module) covers `parseCoverIdentity`: confident hit, trimming, `identified: false`, empty/non-string fields, junk payloads, over-length fields. Shared `makeAlbum` factory lives in `src/test/factories.ts`.

When adding a new guarded Convex function or a new cross-user query, add tests for its auth guard / shareActivity gate in the same session.

---

## File Structure

```
src/
  app/
    App.tsx              # Root layout, screen routing, splash flow, side panel. ReportsScreen and album-detail are React.lazy chunks (recharts stays off the critical path) prefetched at idle — keep them lazy.
    components/
      add-albums-drawer.tsx
      album-artwork-grid.tsx
      album-detail.tsx
      album-grid.tsx     # Collection grid. Windowed render: only the first ~60 items are in the DOM, growing on scroll via an IntersectionObserver sentinel (reset to the initial window on filter/search change). Keeps node count bounded on large collections so the iOS keyboard-open relayout on search doesn't freeze — content-visibility alone left all cards in the DOM. The alphabet A–Z jump reveals the full grid on strip touch (AlphabetSidebar's onActivate) so any anchor exists to scroll to.
      album-list.tsx
      alphabet-sidebar.tsx # Shared useAlphabetIndex hook + AlphabetSidebar component for album-grid and album-list. Optional onActivate fires when the user engages the A–Z strip — album-grid uses it to un-window the grid before jumping.
      app-context.tsx    # Global state — do not refactor without discussion. albums/wants reactively derive from Convex cache subscriptions.
      auth-callback.tsx  # OAuth callback handler — processes Discogs redirect and exchanges tokens
      bug-report-sheet.tsx  # "Report a problem" sheet — Bug/Idea toggle, message, optional screenshot, "What gets sent" disclosure. See Bug Reports.
      bug-inbox-screen.tsx  # Admin-only reports inbox (Settings subview, folders-screen pattern). Gated server-side by bugReports.listAll.
      crate-browser.tsx
      shuffle-album-card.tsx
      dominant-color-card.tsx  # Reusable card wrapper — extracts dominant color from album artwork via canvas, sets CSS custom properties (--dc-bg, --dc-text, etc.) for children. Uses /img-proxy/ to avoid CORS canvas tainting.
      discogs-api.ts     # Types, constants, pure utilities incl. mediaType() format classifier (HTTP functions removed — see Discogs API Proxy)
      discogs-search-sheet.tsx  # "Look It Up" — standalone Discogs database search as a FULL-SCREEN panel (z-[85], no backdrop, Discogs-app style: fixed search bar at top, back arrow to dismiss — a bottom sheet put the iOS keyboard on top of the panel; do not convert it back to SlideOutPanel). Master-first results with a drill-in pressing picker; result and pressing rows carry 72px artwork (still sourced from `thumb` per the Image Sizing Convention); barcode-like queries route to release search; empty results auto-fall back master → release → normalized query (diacritics/dots stripped), with one silent retry on transient errors. Opened from the Search button in the mobile header and desktop top nav. Hands a chosen pressing to ReleaseDetailPanel via setSelectedFeedAlbum. Includes the two-mode camera scanner (BarcodeScanner overlay, ScanBarcode button right of the search bar — hidden when getUserMedia is unavailable): a `Barcode | Cover` toggle pill at the top switches between continuous zxing-wasm EAN/UPC decode (detected codes land in the search box and route to release search) and Cover mode (square framing guide + shutter; the frame is cropped **to the framing guide** and downscaled to ≤1280px JPEG client-side, then sent to `vision.identifyCover`, whose `"Artist Title"` result lands in the search box and rides the normal master-first flow; failures toast "Couldn't read that cover." and keep the scanner open). One camera stream serves both modes — the Barcode/Cover toggle flips a ref, never restarts the stream.

**Cover-mode capture geometry (load-bearing).** The crop maps the guide rect back through the `object-cover` transform into source coordinates (`captureGuideSquare`). It must not go back to "largest centered square of the source frame": iOS delivers landscape frames (e.g. 1280×720) into a portrait element, so `object-cover` crops the sides away and `min(w, h)` is *much wider* than the visible slice — the capture then included a band of room the user never saw, leaving the cover floating in it, which is the opposite of the intent (the cover should fill the image, because most scans are read by OCR rather than recognized; 1280px is what keeps small stylized cover type legible). The cover guide runs wider than the barcode guide (92% / max 420px vs 78% / 360px) because a 12″ sleeve at arm's length is the hard case and every pixel of the guide is now usable.

**Two ways to get a wider shot**, both added for the same problem — the default 1× back camera can't fit a 12″ sleeve without a full arm's reach:
- A **`0.5× / 1×` lens toggle**, rendered *only* when `enumerateDevices()` actually reports an ultra-wide camera. Ultra-wide is a separate device on iOS, not a zoom value, so this swaps `deviceId` and therefore **restarts the stream** — deliberately unlike the Barcode/Cover toggle, and visually separate from it for that reason. Enumeration runs *after* the first `getUserMedia` because device labels are blank until permission is granted. Browsers that don't expose the individual back cameras simply render no toggle.
- A **photo button** (Cover mode only) opening `<input type="file" accept="image/*">`. No `capture` attribute — omitting it is what keeps both the photo library *and* the OS camera on the native sheet, and the OS camera has the ultra-wide control, flash, and HDR that a `getUserMedia` preview can't reach. A picked photo has no framing guide, so it takes the largest centered square. Input focus happens in onAnimationComplete with focus({ preventScroll: true }) — NEVER autoFocus: focusing mid-slide makes iOS scroll the viewport to chase the off-screen input and shoves the whole app up. The bottom nav stays visible/tappable over this panel; a screen change dismisses it. The pre-search empty state is a centered intro line — 'Search the Discogs database or scan a barcode or cover.' with the scan text tappable — plus recent queries (persisted per-user as preferences.recent_searches, capped 8, recorded when a result is tapped, Clear button empties). Loading states show 'Searching...' / 'Finding pressings...' with the sync-dot animated ellipsis. On open, the panel fires discogs.warm (a no-op action) so the first search doesn't pay the Node runtime cold start. The pressing picker header: nav row (back arrow left, Filter disclosure button right with active-count), a hero block (128px artwork, 22px Bricolage title line-clamp-2, artist, pressing count), a bottom divider; the format/country/year chips render only while the Filter disclosure is open. The Format facet chip narrows the picker to one media type (all-formats); vinyl-scoped users get it pre-set to Vinyl but can switch it. Filter-chip facet titles/values are decoded via decodeFacetValue — the versions endpoint returns URL-encoded values ('USA+%26+Canada').
      feed-screen.tsx
      filter-controls.tsx  # Shared filter UI — every drawer, trigger, and active-filter chip in the app is built from these. See Filter UI under Cross-Cutting Patterns.
      filter-drawer.tsx  # Collection filter drawer. Rendered from crate-browser.tsx (NOT App.tsx) so it can receive the match count, which must include the screen-local searchQuery.
      folders-screen.tsx  # Folder management subview (accessed from Settings > Tools > Folders). Create, rename, delete folders. Folders 0/1 are read-only. Uses inline edit and confirmation modal patterns from stacks.tsx.
      format-badge.tsx   # Shared non-vinyl media-type badge (all-formats). Renders a small CD/Cassette/78/… chip via mediaType(); vinyl and missing/empty format render nothing. "overlay" (scrim over artwork) + "inline" (themed chip) variants. Used by grid/list cards, wantlist, and followed-profile views.
      format-spotlight.tsx  # Rotating obscure format highlights section on the home feed
      following-screen.tsx
      icons.ts           # Icon alias shim — the ONLY place @phosphor-icons/react is imported. Re-exports Phosphor icons under the legacy Lucide names (VinylRecordIcon as Disc3, CardsThreeIcon as GalleryVerticalEnd, LightningIcon as Zap, etc.). All components import icons from here. See Tech Stack for the weight system.
      install-nudge.tsx   # Dismissible PWA install nudge bottom sheet for mobile browser users. Fixed-position sheet (z-[150]) with backdrop (z-[149]). Detects standalone mode, listens for beforeinstallprompt (Android), shows instructional copy (iOS). Dismissal persisted to localStorage. Mounted from App.tsx.
      last-played-utils.ts
      motion-tokens.ts
      navigation.tsx    # MobileHeader + BottomTabBar (mobile), DesktopSidebar + DesktopScreenTitle (desktop; there is deliberately no top strip). See Navigation Structure.
      no-discogs-card.tsx
      offline-banner.tsx   # Banner shown when device has no network connection; uses z-[115]
      oauth-helpers.ts   # OAuth 1.0a initiation — kicks off Discogs redirect (no signing, just calls convex/oauth.ts)
      private-data-card.tsx  # Empty-state note when a followed user's (or the owner's own) Discogs collection/wantlist is not browsable — Discogs 403s even for the owner's token. Instructional copy only, no discogs.com link. Used by crate-browser and wantlist private/empty states. Matches NoDiscogsCard's card treatment.
      pick-one-overlay.tsx  # "Pick one" — the Shuffle section's single-release reveal (centered, in-tree not portaled). See Home Feed.
      purge-colors.ts
      purge-tracker.tsx
      purge-verdict-buttons.tsx  # Shared Keep/Maybe/Cut verdict button row — solid fill = selected verdict, tag-colored outline = unselected, icons Check/HelpCircle/StackMinus (weight bold). Used by the feed evaluator and album detail Rate for Purge; any new verdict UI must use this component, never bespoke buttons.
      loading-screen.tsx   # Four-phase loading state machine (`'idle' | 'syncing' | 'syncing_following' | 'complete'`) with UnicornScene WebGL background, Disc3 spinner, and animated ellipsis message. `syncing_following` shows "Syncing users you follow (X of Y)" during startup following feed sync. Use this for all full-screen loading states — do not create new loading screens. **The boot fallback message is "Loading collection", NOT "Syncing collection"** — the screen is gated on `isAuthLoading`, which covers session restore and Convex cache hydration and issues zero Discogs requests (on a warm open inside the 24h TTL no sync runs at all). Once a real sync starts, `syncProgress` overrides it with `formatSyncStatus`'s honest per-page copy. The two strings differ on purpose; do not unify them.
      reports-screen.tsx
      share-activity-prompt.tsx  # Full-screen, non-dismissable shareActivity opt-in prompt (see Cross-User Data Pattern)
      shared-session-page.tsx  # Public, logged-out read-only view of a shared session (route /s/{shareId}). Rendered by App.tsx INSTEAD of the app for /s/ paths, outside AppProvider (no auth/sync). System-theme only (prefers-color-scheme). Reads convex/stacks.getShared (unauthenticated). No nav, no discogs.com links.
      stack-builder.tsx  # Session Builder sheet — creates a session that fills itself. Two layers: presets carry the 80% (generated from the real collection via utils/stack-presets.ts, so nothing on offer comes back empty), and "Build your own" condition rows sit behind a disclosure — a Mailchimp-style row builder is punishing as the primary surface on a phone. Live match count runs the REAL evaluator (previewStackRule), never a parallel count, so the number can't disagree with what the session ends up holding. Names a tool, not a thing: all copy says "Session", the mechanism is a verb ("this session fills itself"), never "smart"/"folder"/"playlist".
      stack-picker-sheet.tsx  # Session picker (file/identifier names keep stack* — see Sessions naming note). Auto sessions render locked with "Fills itself" rather than hidden — you cannot hand-add to a query, and a row that vanished would read as a bug.
      stacks.tsx         # Sessions screen (file/identifier names keep stack* — see Sessions naming note). Per-session Share affordance (header icon → modal: Create/Share link via navigator.share or clipboard, Copy as text, Stop sharing) calls the context shareStack/unshareStack helpers.
      settings-screen.tsx
      splash-screen.tsx
      star-rating.tsx    # Shared star-rating control for the user's OWN Discogs rating (free-data pass). Read-only without `onRate`, tappable with it (tap the active star to clear → 0). Amber #FFC107 fill / light outline. Used by album detail (Your Copy row, always tappable — a one-tap write, not a form field, so no edit mode) and the feed purge evaluator (read-only, hidden when unrated: that card asks for one decision). Never render a rating without hasRating.
      sync-status-line.tsx  # "Synced Xm ago" / "Up to date." line under the Collection/Wantlist search row; tappable manual sync probe
      slide-out-panel.tsx  # Shared bottom-sheet wrapper with swipe-to-dismiss. Accepts children (scrollable slot), optional title/headerAction (header row), optional footer (pinned above safe area), and z-index/className overrides. Used by AlbumDetailSheet and FilterDrawer — use this for any new mobile panel or sheet. Drag handle padding: py-1.5. Close button: rgba(0,0,0,0.45) bg + backdrop-blur(6px) + white icon for contrast over artwork. Blurs the active element on mount (`document.activeElement?.blur()`) to dismiss the iOS software keyboard whenever a panel opens over an active text input. App-wide — no individual tap handlers need to handle this.
      swipe-to-delete.tsx  # Reusable swipe-to-delete gesture component for mobile list items. Currently used in stacks.tsx. Use this for any future list item deletion on mobile.
      theme.ts
      unicorn-scene.tsx  # WebGL animated background used on all pre-auth screens. Wraps Unicorn Studio SDK (UMD, v2.1.4). Scene loaded from local `/splash-screen.json` (scene ID `w7mlqmYVwPpRyrBLkt7m`). Falls back to `#0E1013` if WebGL is unavailable. v0.7: the scene's navy base gradient stops (embedded GLSL `vec3` literals in the JSON) were neutralized to the cool-gray family (`#101318`→`#1B1E23`); the yellow+indigo volumetric nebula layer is kept as an accent gradient. To fully re-theme the scene, re-export from Unicorn Studio.
      use-filtered-albums.ts  # Screen-local collection filtering/sorting hook (search lives in the screens, not context)
      use-shake.ts  # Shake-to-Random gesture hook. Detects lateral shake via DeviceMotion API (threshold: 25 m/s²), fires callback. Requires iOS DeviceMotionEvent.requestPermission() flow — toggle lives in Settings → Gestures. Preference persisted to Convex (`shake_to_random`). `App.tsx` performs a silent boot-time permission check: if `shakeToRandom` is `true` on load and `DeviceMotionEvent.requestPermission()` does not return `'granted'`, the preference is reset to `false` in Convex and a toast is shown. The check runs once per session via a `hasDonePermissionCheckRef` guard.
      wantlist.tsx
      wantlist-add-icon.tsx  # Heart + "+" badge composite icon — "add to wantlist" affordance in social/activity contexts where a plain heart reads as "favorite this post". Used by Feed and Following activity rows.
      wantlist-heart-button.tsx  # Shared wantlist add/remove button. Two variants: "overlay" (absolute-positioned on artwork cards) and "inline" (for list rows). Handles wantlist state check, add/remove confirmation SlideOutPanel, API call, Disc3 loading state, and toasts. Used in Feed Shuffle cards, Following Shuffle cards, Following grid/artwork/list views.
      wantlist-crossover-prompt.tsx  # "Now in your collection" floating prompt — shows after sync when a wantlist item is also in the collection. Mounted from BottomTabBar in navigation.tsx.
    hooks/
      use-online-status.ts  # Hook that powers OfflineBanner via navigator.onLine and online/offline events
    lib/
      dialog-stack.ts    # Module-level stack of open dialogs — Escape-closable overlays push/pop a token; only the TOPMOST responds to Escape (see Dialog Accessibility)
      monitoring.ts      # Sentry init (errors only) — lazy-loaded from main.tsx ONLY when VITE_SENTRY_DSN is set; registers itself as the reportError reporter
      report-error.ts    # reportError() indirection — no-op until monitoring registers; call sites (App.tsx ErrorBoundary) report unconditionally. Also keeps a 10-entry in-memory ring buffer (getRecentErrors) that bug reports attach — see Bug Reports.
      screen-trail.ts    # Module-level breadcrumb of recent screens, recorded from setScreen in app-context; attached to bug reports as "Where"
      scroll-state.ts    # Module-level scroll-guard state — one passive capture listener records last scroll time; powers the 250ms post-scroll tap cooldown
      safe-tap.ts        # Shared safeTap() helper — touch-slop (10px X+Y) + scroll cooldown + preventDefault to suppress synthetic clicks. All card tap sites use this; never hand-roll touch tap guards. NOT a hook (module-level touch state, no use* prefix) — it is deliberately callable inside .map() loops.
    utils/
      format.ts          # Shared formatting utilities (formatActivityDate, formatCollectionSince, getInitial, formatSyncedAgo)
      stack-rule-labels.ts  # Rule-builder vocabulary (RULE_FIELDS + per-field operators, collection-derived options, availableFields gating) and the title generator. Pure, no React — the generated-title logic is testable alongside insights.ts.
      stack-presets.ts   # Session Builder presets, GENERATED FROM THE REAL COLLECTION (only offer Jazz if he owns jazz, star presets only once something is rated). That is both a product call and what makes the free-data backfill invisible — a preset that matches nothing is worse than no preset.
      accounts.ts        # Pure multi-account list logic (parseAccounts/upsertAccount/removeAccount/nextAccount) — no localStorage/React; app-context wraps it for hg_accounts I/O. See Multiple Accounts.
      shuffle.ts         # Fisher-Yates shuffle + pickRandom + getDailySeed (a seed that holds steady for a calendar day, shared so the feed and the lazy Insights chunk rotate on the same schedule) — use these, never .sort(() => Math.random() - 0.5) or inline arr[Math.floor(Math.random()*arr.length)]
      listening.ts       # Pure listening derivations (deriveStreaks / daysSinceLastPlay / albumsPlayedThisMonth) shared by the feed's Listening card and the Insights screen's Listening section. Split out so the two surfaces cannot report different numbers for the same play log — two independently written streak counts disagreeing is the failure mode this file exists to prevent. Reads only the play log the app already keeps; adds no tracking.
      collection-facts.ts  # deriveCollectionFacts(albums, playCounts?) — threshold-gated stat lines (most rotated [2+ plays; derived from the optional playCounts map, no new tracking], top decade/artist/label, oldest pressing, latest pickup with artist) for the feed identity-block ticker. Returns a stable derivation order; the feed shuffles the facts per load for ticker display.
      insights.ts        # Pure derivations: parseAddedYear, bucketAddsByYear (Collection Growth), countAddedWithin (the identity block's recent-adds delta). No React/recharts — testable in node env. (Spending's parsePricePaid/deriveSpending were removed — pricePaid is never populated by sync.)
  imports/               # Logo SVG assets (splash, dark, light — the light variant has navy #0C284A letters for light backgrounds; the dark variant has white letters. Both keep the yellow record-dot with navy spindle hole). NOTE: the v0.7 gray retheme deliberately left the logo SVGs untouched — the wordmark is a fixed brand asset, not themed chrome; revisit only on an explicit brand-mark pass.
  lib/
    condition-colors.ts  # Shared condition grade color spectrum (CONDITION_SPECTRUM map + conditionGradeColor helper). Used by album-detail (incl. the Value section), reports-screen.
  styles/
    fonts.css
    index.css
    tailwind.css
    theme.css
  main.tsx
convex/                  # Convex backend functions and schema
  albumFields.ts       # Pure, no Convex deps: mediaType() format classifier, hasRating, CONDITION_GRADES, conditionRank. Moved here from discogs-api.ts (which re-exports all of it, so every import site is unchanged) because session rules must evaluate identically on the client and in stacks.getShared, and Convex cannot import from src/. One implementation — never copy it back.
  stackRules.ts        # Pure session rule engine: StackRule types, evaluateStackRule, seededShuffle (re-exported by utils/shuffle.ts), rotationBucket. See the Session Builder section.
  admin.ts             # Pure admin allowlist (HG_ADMIN_USERNAMES) for the bug-report inbox — fails closed when unset
  authHelper.ts        # Central session-token auth guard — used by all guarded queries/mutations
  bugReports.ts        # Bug reports/ideas: submit + listMine (reporter), listAll/newCount/setStatus/remove (admin-gated), generateUploadUrl (screenshots), deleteReportsForUser (called by users.deleteAllUserData)
  collection.ts        # Collection cache CRUD + diff sync (applyDiff)
  market_values.ts     # Shared per-release market value (Spec 6A.1): seedFromCollection/getDripBatch/setValue (internal, drip) + getForUser (public read for Insights)
  crons.ts             # Convex cron registry — daily marketValueDrip (Spec 6A.1)
  marketValue.ts       # Market-drip constants (MARKET_STALE_MS/MARKET_BATCH_SIZE/MARKET_CURRENCY) — no Convex deps
  schema.ts
  users.ts             # getLatestUser (public bootstrap), getMe, upsert (INTERNAL — see Authentication Architecture), updateLastSynced, updateCollectionValue, clearSession
  oauth.ts             # Public OAuth handshake — reads credentials from process.env, intentionally unauthenticated
  discogs.ts           # "use node" — server-side sync loops (syncSelf, syncFollowedUser) + Discogs API proxy actions (see Discogs API Proxy) + marketValueDrip (internal cron action, Spec 6A.1: seeds market_values, prices a batch round-robin across tokens)
  discogsHelpers.ts    # getUserCredentials + listUsersForMarketDrip (token pool for the drip) internalQueries — separated from discogs.ts due to "use node" constraint
  followed_items.ts    # Followed collections cache: getForUser, clearForUser/appendItems (internal)
  syncStatus.ts        # Sync progress doc: get (subscribed by client), set (internal)
  vision.ts            # "use node" — vision.identifyCover action: cover-photo identification via the Claude API for the Look It Up scanner's Cover mode (auth via discogsHelpers.getUserCredentials; reads ANTHROPIC_API_KEY)
  coverIdentity.ts     # Pure cover-scan logic (model/prompt/schema constants + parseCoverIdentity validator) — no Convex deps, shared by vision.ts and tests (marketValue.ts pattern)
  purge_tags.ts
  stacks.ts            # Sessions feature data (create/update take the rule; `freeze` materializes an auto session) (table named `stacks` — see Sessions naming note). Includes capability-token share: enableShare/disableShare (authed) + getShared (unauthenticated public read)
  last_played.ts
  want_priorities.ts
  following.ts
  following_feed.ts  # Following feed cache: getByFollower, upsert, deleteEntry
  wantlist.ts        # Wantlist cache: getByUsername, replaceAll, addItem, removeItem
  preferences.ts
```

---

## Design System

### Color System

#### Philosophy

Holy Grails uses **Oklab** as its color space for all color derivation and token definition. Oklab is a perceptual color space designed by Björn Ottosson and is the color space underpinning CSS Color Level 4/5. It is supported in all modern browsers (baseline since May 2023) and is now the default gradient interpolation in Photoshop.

Reference: https://bottosson.github.io/posts/oklab/

**The core principle:** equal numeric steps in Oklab produce equal perceived steps. This is not true of hex, RGB, or HSL. A `calc(l - 0.03)` step always means the same perceived lightness reduction regardless of hue. This makes it the right tool for building a consistent, predictable dark mode token hierarchy.

#### Rules

1. **Never derive new colors by arithmetic on hex values.** If you need a lighter or darker variant, use `oklab(from <color> calc(l ± X) a b)` in CSS.

2. **All new dark mode background tokens must be defined as `oklab()` relative color expressions**, not raw hex. Existing hex tokens are legacy and should be migrated during dedicated audit passes.

3. **Hardcoded hex values are only permitted for fixed brand colors** (the nav palette and CTA yellow) and for the named semantic/accent colors in the exceptions list below. Every other color in a component must reference a CSS custom property.

4. **Gradients between two non-transparent colors should use `in oklab` interpolation** to avoid hue drift:
   ```css
   background: linear-gradient(in oklab, var(--c-surface), var(--c-bg));
   ```

5. **Do not use `rgba(0,0,0,X)` or `rgba(255,255,255,X)` for surface tinting.** Use a token or an `oklab()` expression derived from the nearest surface token. Exception: image card overlays where black is needed for contrast over photography are intentional and should be left alone.

6. **The `isDarkMode ? "#EBFD00" : "#0078B4"` ternary pattern is retired.** Always use `var(--c-link)` instead.

7. **When adding a destructive action** (delete, remove, unfollow, confirm-destructive), always use `var(--c-destructive)`, `var(--c-destructive-hover)`, and `var(--c-destructive-tint)`. Never hardcode `#FF33B6`. **Fill vs. ink:** `--c-destructive` is the *fill* (solid buttons, badges — it is built to carry white on top of it). Destructive **text and its adjacent icons** use `var(--c-destructive-text)`, which in light mode is the same hue dropped to Oklab L=0.52 (`#C40084`) so 12–14px error copy clears 4.5:1 on surface, bg, chip, and on `--c-destructive-tint`; raw `#FF33B6` as ink only reaches 3.3:1 on white and 2.8:1 on its own tint. Dark mode keeps `#FF33B6` for both.

8. **Always preserve the `a` and `b` axes when adjusting lightness in Oklab.** Use `oklab(from <color> calc(l ± X) a b)` — do not alter `a` or `b` unless intentionally shifting hue or chroma.

#### Token Hierarchy — Dark Mode Backgrounds

Background tokens are defined in `theme.ts` using Oklab relative color expressions. The hierarchy represents perceived elevation — each layer is perceptually lighter than the one below it by a consistent step.

| Token | Expression | Role |
|---|---|---|
| `--c-bg` | `oklab(from #101318 calc(l - 0.035) a b)` | Main app canvas — lowest elevation |
| `--c-surface-alt` | `oklab(from #101318 calc(l - 0.015) a b)` | Inset/recessed surfaces, input bg |
| `--c-surface` | `#101318` | Cards, panels, primary containers (the ramp anchor) |
| `--c-surface-hover` | `oklab(from #101318 calc(l + 0.04) a b)` | Hover state on surface elements |
| `--c-chip-bg` | `oklab(from #101318 calc(l + 0.04) a b)` | Pill/chip backgrounds |
| `--c-input-bg` | `oklab(from #101318 calc(l - 0.015) a b)` | Input field backgrounds |

(v0.7 **gray retheme**: the dark surfaces are a cool near-neutral gray family so the app/brand no longer reads as "blue." The whole ramp is derived in Oklab from a single cool-gray anchor `#101318` — a hint of blue chroma, deliberately not fully desaturated — preserving the `a`/`b` axes so every layer carries the same subtle cool tint, `--c-bg` lowest and borders highest. The prior navy family (`#081A31`/`#071B30`/`#172E4C` and the older `#0C1A2E`/`#091E34`/`#1A3350`) is fully retired. Accent pops — yellow link, pink destructive, cyan/pink/yellow accents, and the ice-blue active-state system (`#ACDEF2`/`rgba(172,222,242,…)`/`#00527A`) — are unchanged: the color lives in the accents, not the surfaces.)

**Darkening pass (v0.6.1):** dark mode read a touch bright, so the entire background family was shifted **−0.02 Oklab L** in one pass — the anchor moved `#14171D` → `#101318` and every hardcoded companion moved with it, preserving each perceptual step and the `a`/`b` cool tint. The pass covered the token ramp, the App.tsx canvas + radial gradient + `<html>` background, the bottom tab bar, the detached-component surfaces/chips/borders, the feed ticker strip, and the Sonner dark toast. Text tokens were deliberately **not** shifted (they gained contrast against the darker surfaces). **The WebGL/pre-auth trio was deliberately excluded** — `unicorn-scene.tsx`'s `#0E1013` fallback, `splash-screen.tsx`, and `loading-screen.tsx` keep their old values because they are matched to the Unicorn Studio scene's own embedded GLSL gradient stops, which live in `/splash-screen.json` and cannot be retuned from CSS. Darkening them means re-exporting the scene; until then, do not shift those three files piecemeal or the splash will seam. To go darker again, shift the whole family by another uniform L step — never darken one surface alone.

When a new background token is needed, derive it from the `#101318` anchor with an appropriate Oklab L step. Do not invent hex values directly, and do not reintroduce a blue-tinted surface.

#### Semantic Color Tokens

These tokens must be used instead of hardcoded values. See Rules above.

##### Content Area — Light Mode (default)
All content area colors use CSS custom properties defined in `theme.ts`:

| Token | Value |
|---|---|
| `--c-bg` | `#F9F9FA` |
| `--c-surface` | `#FFFFFF` |
| `--c-surface-hover` | `#EFF1F3` |
| `--c-surface-alt` | `#F9F9FA` |
| `--c-text` | `#16181C` (cool near-neutral black — v0.7, was navy `#0C284A`) |
| `--c-text-secondary` | `#565A61` |
| `--c-text-tertiary` | `#70747C` |
| `--c-text-muted` | `#666A72` |
| `--c-text-faint` | `#767A82` |
| `--c-border` | `#D7DADE` |
| `--c-border-strong` | `#868B93` |
| `--c-chip-bg` | `#EFF1F3` |
| `--c-input-bg` | `#F9F9FA` |
| `--c-destructive` | `#FF33B6` |
| `--c-destructive-hover` | `#E6009E` |
| `--c-destructive-tint` | `rgba(255, 51, 182, 0.12)` |
| `--c-destructive-text` | `oklab(from #FF33B6 0.52 a b)` (≈ `#C40084`) — destructive **ink**, see Rule 7 |
| `--c-link` | `#0078B4` (blue link — deliberately kept, a permitted accent) |
| `--c-link-hover` | `#005F8E` |
| `--c-card-shadow` | `0 4px 20px rgba(22,24,28,0.08)` |
| `--c-sheet-shadow` | `0 -8px 32px rgba(22, 24, 28, 0.1)` |
| `--c-shadow-sm` | `0 1px 3px rgba(0, 0, 0, 0.15)` |
| `--c-shadow-modal` | `0 16px 48px rgba(22, 24, 28, 0.15)` |
| `--c-accent-cyan` | `oklab(from #00CFFF 0.52 a b)` (≈ `#0078A5`) |
| `--c-accent-pink` | `oklab(from #F276EC 0.52 a b)` (≈ `#A428A1`) |
| `--c-accent-yellow` | `#8C6800` (brass gold — oklch(0.54 0.115 86°)) |

The light-mode cyan/pink accents are the dark accents dropped to Oklab L=0.52 with hue preserved, so 11px eyebrow text clears WCAG 4.5:1 on `--c-bg`. **Yellow is the exception:** hue-preserved darkening of `#EBFD00` (h≈115°, on the green side) can only produce olive/mud, so the light yellow hue-shifts to the brass gold `#8C6800` (h≈86°) — darkened gold still reads as the yellow family; darkened yellow does not. Any new accent token must ship BOTH a dark value and a light value that passes 4.5:1 on the light background — never reuse a bright dark-mode accent directly in light mode, and never darken a green-side yellow without shifting its hue toward gold. Where yellow appears as a **fill** in light mode, prefer keeping the true `#EBFD00` edged/paired with `#8C6800` or near-black ink `#16181C` (peak-decade bar, golden-era pill, CTA buttons) over substituting a darker swatch.

##### Content Area — Dark Mode
| Token | Value |
|---|---|
| `--c-bg` | `oklab(from #101318 calc(l - 0.035) a b)` |
| `--c-surface` | `#101318` |
| `--c-surface-hover` | `oklab(from #101318 calc(l + 0.04) a b)` |
| `--c-surface-alt` | `oklab(from #101318 calc(l - 0.015) a b)` |
| `--c-text` | `#E6E8EC` |
| `--c-text-secondary` | `#AAB0BA` |
| `--c-text-tertiary` | `#969CA6` |
| `--c-text-muted` | `#868C96` |
| `--c-text-faint` | `#727882` |
| `--c-border` | `oklab(from #101318 calc(l + 0.06) a b)` |
| `--c-border-strong` | `oklab(from #101318 calc(l + 0.14) a b)` |
| `--c-chip-bg` | `oklab(from #101318 calc(l + 0.04) a b)` |
| `--c-input-bg` | `oklab(from #101318 calc(l - 0.015) a b)` |
| `--c-destructive` | `#FF33B6` |
| `--c-destructive-hover` | `#E6009E` |
| `--c-destructive-tint` | `rgba(255, 51, 182, 0.08)` |
| `--c-destructive-text` | `#FF33B6` (already clears 4.5:1 as ink on the dark surfaces) |
| `--c-link` | `#EBFD00` |
| `--c-link-hover` | `#d9e800` |
| `--c-card-shadow` | `0 4px 20px rgba(0,0,0,0.25)` |
| `--c-sheet-shadow` | `0 -8px 32px rgba(0, 0, 0, 0.3)` |
| `--c-shadow-sm` | `0 1px 3px rgba(0, 0, 0, 0.15)` |
| `--c-shadow-modal` | `0 16px 48px rgba(0, 0, 0, 0.4)` |
| `--c-accent-cyan` | `#00CFFF` |
| `--c-accent-pink` | `#F276EC` |
| `--c-accent-yellow` | `#EBFD00` |

The `--c-accent-*` tokens power the feed section eyebrows (Decade Highlight = cyan, Wantlist Spotlight = pink, Format Spotlight = yellow) and the #1 Top Artists rank / Insights golden-era callout (yellow). Use them — never raw `#EBFD00`/`#00CFFF`/`#F276EC` — for any accent-colored text sitting on themed surfaces.

#### Fixed Brand Colors — Hardcoded, Do Not Tokenize

These never change with theme and are always hardcoded where used.

| Value | Usage |
|---|---|
| `#EBFD00` | CTA buttons, logo accent, sync/action buttons, dark-mode active nav |
| `#0E1013` | UnicornScene WebGL fallback (v0.7 neutral, was navy `#01294D`) |
| `#16181C` | Cool near-neutral black ink: text on yellow CTA buttons, light-mode active nav (bottom bar, desktop top nav icon, mobile header active buttons), ThemeSwitch sidebar-variant track (v0.7, was navy `#0C284A`/`#01294D`) |
| `#D1D8DF` | Dark-mode inactive nav icon + label |
| `#d9e800` | CTA button hover state |

**Both navs are theme-aware.** The desktop sidebar and top strip render transparent over the app gradient (no fixed navy bar anymore — the sidebar's only chrome is a single right hairline); the active nav icon is `#EBFD00` in dark mode and `#16181C` (near-neutral black) in light mode, matching the mobile bottom nav convention — yellow does not read on a light surface. The mobile header's active Following/Settings buttons follow the same rule.

##### Yellow CTA Buttons
```tsx
// Always use this pattern for primary CTAs
className="bg-[#EBFD00] text-[#16181C] hover:bg-[#d9e800]"
```

##### Active Filter Chips
```tsx
// Light mode
className="bg-[rgba(172,222,242,0.5)] text-[#00527A]"
// Dark mode
className="bg-[rgba(172,222,242,0.2)] text-[#ACDEF2]"
```

#### Permitted Semantic Accent Colors — Hardcoded

These are semantic colors tied to a specific meaning. Hardcoded because the hue is the meaning.

| Value | Usage |
|---|---|
| `#3E9842` | Keep purge tag, Have It icon (green) |
| `#EF5350` | Want It icon (warm red) |
| `#FFC107` | Avg. Rating icon (amber) |
| `#9A207C` | Cut purge tag — light mode |
| `#00476C` | Maybe purge tag — light mode |
| `#ACDEF2` | Active filter chips, Maybe purge tag — dark mode |
| `rgba(172,222,242,0.5)` | Active filter chip bg — light mode |
| `rgba(172,222,242,0.2)` | Active filter chip bg — dark mode |
| `#009A32` | Collection value display, positive metrics |
| `#EEFC0F` | Wantlist priority bolt icon (over artwork scrims only) |
| `#0DB1F2` | Chart third accent (reports-screen chart constants) |
| `#22C55E` | Success / confirmed state icon |
| `#FF98DA` | Cut purge tag — dark mode (also used in progress gradient) |
| `#8C6800` | Brass gold — light-mode `--c-accent-yellow` value; also the light-mode wantlist priority bolt (dark mode uses `#EBFD00`; the former `#B8C900` was retired at 1.8:1 — it made the prioritized bolt read fainter than the unset one), the light-mode stroke edging the `#EBFD00` peak-decade bar, and the light stop of the Shuffle gradient |
| `#1DB954` | Spotify brand green — Listen On button icon only (album-detail) |
| `#FA243C` | Apple Music brand red — Listen On button icon only (album-detail) |
| `#FF2D78` | DestructiveButton confirm-tap fill (album-detail) |
| `#F276EC` / `#48FF91` / `#00CFFF` | Shuffle heading gradient stops (with `#EBFD00`) — feed-screen only, dark mode; light mode uses the same four hues via `oklab(from <hex> 0.52 a b)` |

Chart constants in `reports-screen.tsx` (`CHART_GREEN`, `CHART_PINK`, `CHART_BLUE`) are hardcoded by design — they are data visualization colors, not UI surface colors.

Condition grade colors (the pink-to-green spectrum) are defined in `src/lib/condition-colors.ts`. Always import from there — never re-declare inline.

Purge colors are defined in `purge-colors.ts`. Always import from there.

##### Condition Grade Color Spectrum
Maps vinyl condition grades to a pink-to-green spectrum (source of truth: `src/lib/condition-colors.ts`):
- **M / NM**: Green (`#3E9842` dark, `#2D7A31` light)
- **VG+**: Blue-green (`#5FBFA0` dark, `#1A7A5A` light)
- **VG**: Blue (`#ACDEF2` dark, `#00527A` light)
- **G+**: Purple (`#C9A0E0` dark, `#7A3A9A` light)
- **G**: Pink (`#E88CC4` dark, `#9A207C` light)
- **F / P**: Pink (`#FF98DA` dark, `#9A207C` light)

#### Gradients

Gradient fades to surface backgrounds must reference a CSS token — never a hardcoded hex:

```tsx
// Correct
background: "linear-gradient(to bottom, transparent, var(--c-surface))"

// Wrong — breaks on theme change
background: "linear-gradient(to bottom, transparent, #14161C)"
```

Image card overlays using `rgba(0,0,0,...)` for photo readability are intentional exceptions — do not change them.

---

### Typography

- **Display / Headings**: `Bricolage Grotesque` (weights 300–700)
- **Decorative display accents**: `Rock Salt` and `Manufacturing Consent`, loaded in `fonts.css`. Two families, two jobs — **which one a heading gets is decided by function, not by whether it sits in a bordered card** (two of the five blackletter headings are uncarded). Do not use either face outside these two roles.
  - **`Rock Salt` = spotlight.** Full-bleed, artwork-led, contents that **re-pick themselves every open**, and a heading that is either content-derived or an editorial phrase. Today: Shuffle, Decades (*The 1970s*), Format Spotlight (*45 RPMs*), On the Hunt. All 28px/400 except Shuffle at 30px — a deliberate exception, not drift: it leads the feed and carries the gradient fill. All except Shuffle are introduced by an 11px accent-colored Bricolage eyebrow; Shuffle's gradient does that job instead.
  - **`Manufacturing Consent` = named module.** A permanent, fixed-name section showing a deterministic result, almost always with a destination link. Today: Recently Added, Following Activity, Purge Tracker, Listening, From the Depths (Following screen). All 32px/400, no eyebrow, fallback stack **`serif`** — never `system-ui, sans-serif`; a blackletter falling back to sans is wrong.
  - The test for a new heading: **does this section show the same thing every time you open it and have a name of its own? → blackletter. Does it re-pick its contents and take its name from what it found? → script.** Recently Added and From the Depths are uncarded because they're carousels — the album cards are the container, and wrapping them in a bordered card would double-container them. That's a layout decision downstream of the typography one, not an input to it.
- **Body / UI labels**: `DM Sans` (weights 300–700)
- Loaded via a `<link>` (with preconnect) in `index.html` — not an `@import` in CSS, so the font fetch starts before CSS parse. Only weights 400/500/600/700 are requested; weight 300 is intentionally not loaded (unused)
- Never use system fonts for headings — Bricolage Grotesque is part of the brand

---

### Motion Tokens

All animation constants live in `motion-tokens.ts`. Always import from there — never hardcode easing or duration values.

```ts
EASE_OUT: [0.25, 1, 0.5, 1]
EASE_IN_OUT: [0.76, 0, 0.24, 1]
EASE_IN: [0.5, 0, 0.75, 0]

DURATION_MICRO: 0.1      // Button press, toggles
DURATION_FAST: 0.175     // Crate flip, tab switches
DURATION_NORMAL: 0.225   // Bottom sheets, filter drawer
DURATION_SLOW: 0.3       // Lightbox out, large exits
```

Only animate `transform` and `opacity`. Never animate `width`, `height`, `top`, `left`, `margin`, or `padding`.

---

## Cross-User Data Pattern

Holy Grails surfaces one user's data to another in one place: the
Following screen HG activity section. Any future feature that does the
same must follow this pattern without exception.

**The shareActivity gate:**
Any Convex query that returns one user's data to a different authenticated
viewer must:
1. Authenticate the viewer via `authenticateUser()` first — unauthenticated
   callers get an error, not an empty result
2. Look up the target user and check `shareActivity === true`
3. Return `null` for both "user not found" and "shareActivity not true" —
   the caller must not be able to distinguish between the two cases
4. Never expose OAuth tokens, session tokens, or any field not explicitly
   listed in the return type

**Existing implementations:**
- `users.getHolyGrailsUsers` — takes `usernames[]`, returns the subset
  with `shareActivity === true`
- `lastPlayed.getPublicActivitySummary` — returns play data for a target
  user, or `null` if not found or not opted in

**Opt-in prompt:**
`ShareActivityPrompt` renders full-screen for any authenticated user with
`shareActivity === undefined` — this covers both new users and existing
users who predate the field. It is not dismissable. `showSharePrompt` is
derived reactively in `app-context.tsx` and clears automatically once
`setShareActivity` resolves in Convex.

---

## Bug Reports

In-app reporting (Settings → Feedback), built for the beta: a report that arrives with its own context beats "it felt broken once." It complements Sentry rather than duplicating it — Sentry catches crashes the user never mentions, this catches "this is wrong," which no crash reporter sees.

**Submitting** (`bug-report-sheet.tsx`, a `SlideOutPanel` at z-80/85): a Bug/Idea toggle, one message field, an optional screenshot, and a **"What gets sent" disclosure that lists the exact payload** — keep that honesty if the diagnostics list changes. Attached automatically: app version, the screen trail, installed-PWA vs browser tab, UA, viewport, theme, format scope, collection/wantlist counts, last sync, online state, account count (when >1), Discogs privacy flags, and the session's recent client errors. Never include collection contents, notes, or anything auth-related.

- **Screen trail** (`lib/screen-trail.ts`) — a module-level breadcrumb recorded from the single `setScreen` chokepoint in `app-context.tsx`. Reports are filed from Settings, so without it every report reads "screen: settings."
- **Error buffer** (`lib/report-error.ts`) — `reportError()` and the global `error`/`unhandledrejection` listeners in `main.tsx` push into a 10-entry in-memory ring buffer; the sheet attaches it. Works with no Sentry DSN. Deliberately NOT persisted — a crash-then-reload loses it, and the localStorage whitelist stays closed.
- **Screenshots** — downscaled client-side to ≤1600px JPEG, then uploaded to Convex file storage via `bugReports.generateUploadUrl`. The downscale is deliberately not shared with the Look It Up cover scanner's (that one crops a centered square from a video frame for the vision model — different input, different geometry).
- **Status loop** — Settings lists the reporter's own reports with a New/Known/Fixed chip and any admin reply. For an idea, `fixed` renders as "Shipped."

**Admin inbox** (`bug-inbox-screen.tsx`, a Settings subview following the `folders-screen.tsx` pattern): every report with diagnostics, screenshot, error trace, status controls, and delete.

**The admin gate is server-side.** `convex/admin.ts` (pure, no Convex deps — `marketValue.ts` pattern) reads the `HG_ADMIN_USERNAMES` Convex env var, a comma-separated allowlist compared case-insensitively. It **fails closed**: unset means nobody is an admin. `bugReports.listAll` returns `null` for non-admins (indistinguishable from an empty inbox, per the Cross-User Data Pattern), `setStatus`/`remove` throw a bare "Not found.", and `amIAdmin` only decides whether the Settings row renders — never trust it as the gate. Do not move the allowlist into code: the repo may go public, and an admin list in git is permanent.

`users.deleteAllUserData` deletes the caller's reports and their screenshots via `deleteReportsForUser` — "removes everything on our side" has to stay literally true. Submissions are rate-limited to 5 per reporter per hour, and a screenshot uploaded for a rejected submission is deleted rather than orphaned.

---

## Cross-Cutting Patterns

### Dialog Accessibility (sheets, drawers, lightbox)

Every modal overlay must carry `role="dialog"`, `aria-modal="true"`, and an accessible name (`aria-label`, or the title header). `SlideOutPanel` is the reference implementation and also provides: Escape-to-close, a lightweight Tab focus trap, initial focus into the sheet, and focus return to the opener on close. Its `ariaLabel` prop names title-less sheets — pass it at every new call site.

**Escape handling uses the dialog stack** (`src/app/lib/dialog-stack.ts`): each Escape-closable overlay pushes a token on mount, pops on unmount, and only acts on Escape when its token is topmost — so a lightbox over a sheet closes one layer per keypress. The desktop album side panel (non-modal, `role="complementary"`) closes on Escape only when `hasOpenDialogs()` is false. Any new sheet or overlay with Escape handling MUST register with the stack — a bare `document.addEventListener("keydown", …)` will double-close stacked layers. The side panel's guard names exactly one overlay by hand: **Look It Up**, which handles Escape not at all, so no token exists to defer to. Every other overlay reaches the guard through `hasOpenDialogs()`; do not add a name to that list instead of registering.

Icon-only buttons always get an `aria-label`; toggle buttons (view modes, priority bolt, filter chips acting as toggles) also get `aria-pressed`.

### Filter UI

Everything filter-shaped comes from **`filter-controls.tsx`**. There are three drawers — Collection (`filter-drawer.tsx`), followed-user profile (`FollowedFilterDrawer` in `following-screen.tsx`), and the Look It Up pressing picker (`PressingFilterDrawer` in `discogs-search-sheet.tsx`) — plus the trigger buttons and active-filter chips on the screens behind them. They were built independently and drifted: three private copies of `chipStyle`, three of the section label, three of the Reset button, two declarations of `MEDIA_TYPE_ORDER`, an active-state dot on one trigger but not the other, and a selected-chip ring that existed in one drawer only. A fix applied to one was a fix applied to one.

**No filter surface builds its own chip, section label, Reset, footer, trigger, or sort list.** If a surface needs something these don't do, widen the component rather than hand-rolling beside it. Exports: `FilterChipButton` (toggle pill, `aria-pressed` non-optional, optional trailing count badge), `FilterSection` / `FilterSectionLabel`, `FilterSortList` (a `radiogroup` — sort is one-of-many, not a row of toggles, and every drawer got that wrong the same way), `FilterResetButton`, `FilterApplyButton`, `FilterButton` (the `SlidersHorizontal` trigger with its active dot), `ActiveFilterChip` (dismissible summary chip), plus `filterChipStyle`, `MEDIA_TYPE_ORDER`, and `presentMediaTypes`.

- **Selected chips carry a ring, not just a tint.** `rgba(172,222,242,0.2)` alone is nearly invisible on the dark chip background. The unselected border is `1px solid transparent` so toggling never shifts a chip by a pixel.
- **`FilterApplyButton` takes `matchCount` OR `label`, and the choice is a semantic one.** Where filters apply live — the Collection and followed-profile drawers, whose chips write straight to state, leaving the list behind the sheet already filtered — the button only closes, so it takes `matchCount` and reads "Show 27 releases". "Apply Filters" there was describing something it didn't do. Pass `label="Apply Filters"` only where the drawer genuinely stages a draft and applies on tap: the pressing picker, which re-queries Discogs.
- **Desktop content gutter is a symmetric 24px on every screen.** `lg:px-[24px]` is the shared
value (mobile stays 16px, or 32px on the right of the Collection/Wantlist grid+list scroll
containers to clear the alphabet strip). The four grid/list scroll containers used to set
`pl-[16px]` with no `lg:` override, so on desktop the cards sat 8px left of the search row, sync
line and title above them — visibly hanging off the left edge; and their right padding was
`pr-[32px]` with `lg:pr-[24px]` applied *only when the alphabet index happened to be visible*,
so the same screen had two different desktop right gutters. The two list views also carried
`pr-[16px]` and `pr-[32px]` in one class string, resolving by stylesheet order rather than
intent. **The `lg:px-[24px]` override only wins because responsive variants land in a later
`@media` block** — within a single block Tailwind emits `px` *before* `pl`/`pr`, so a base
`px-[24px]` would have lost to a base `pl-[16px]`. Don't "simplify" these to base-layer
shorthand.

**The match count is passed in, never recomputed inside a drawer.** Both live-filter drawers sit behind a screen that owns its own `searchQuery` (deliberately kept out of app context — see the Rules under Data Architecture), so a count derived inside the drawer would ignore the search and disagree with the list. This is why `FilterDrawer` renders from `crate-browser.tsx` rather than `App.tsx`.
- **Folders multi-select; Format and Relationship are single-select toggles.** `activeFolders: string[]` OR's within the section and AND's across sections — a release lives in exactly one folder, so OR is the only combinator that can match anything. "All" is the absence of a selection, so it clears rather than toggles.
- **"No Plays Recorded" / "Plays Recorded" are mutually exclusive** — they partition the collection, so holding both can only return nothing. Selecting one clears the other.

The Wantlist is deliberately outside this system: it has no drawer, just inline All/Priority chips with their own yellow-fill treatment.

### Touch Handling on Interactive Cards

All interactive card and row elements must include `touchAction: "manipulation"` in their inline style. This eliminates the 300ms double-tap delay and lets the browser handle vertical pan natively. Cards with explicit `onTouchStart`/`onTouchMove`/`onTouchEnd` handlers must use a Y-axis-only threshold of 10px in `onTouchMove` — check `clientY` delta only, never `clientX`. X-axis movement during a vertical scroll is noise and must not suppress a tap. Any new card type added to the app must follow both rules.

### iOS Safari Text Truncation
Never use Tailwind's `truncate` class on album-facing text. Always use inline styles:

```tsx
style={{
  display: "block",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  WebkitTextOverflow: "ellipsis",
  maxWidth: "100%",
}}
```

`line-clamp-1` / `line-clamp-2` is fine for multi-line clamping (grid card titles, session names).

### Disc3 Spinner
All loading states use `Disc3` (Phosphor's `VinylRecord`, aliased in `icons.ts`) with the `disc-spinner` CSS class. This spins at 33 1/3 RPM (1.8s per revolution). Never use a generic spinner component.

```tsx
import { Disc3 } from "./icons"
<Disc3 className="disc-spinner" />
```

### CSS Variables on Detached Components
The session picker and other components that render outside the main `<main>` element must apply CSS variables inline on their container — they don't inherit from the main cascade.

**Detached-component surface color pattern:** The following components use `isDarkMode ? "#14161C" : "#FFFFFF"` for their background color rather than `var(--c-surface)`. This is intentional — these components render in a context where CSS custom properties from the root are not inherited (detached from the main DOM tree or rendered via portals):

- slide-out-panel.tsx
- add-albums-drawer.tsx
- stack-picker-sheet.tsx
- album-detail.tsx (two instances)
- wantlist-crossover-prompt.tsx
- purge-tracker.tsx
- loading-screen.tsx

`#14161C` (dark, v0.7 cool gray — a hair lighter than `--c-surface`, matching the prior detached-vs-surface relationship) and `#FFFFFF` (light) are the correct surface values for detached components. Do not change these to `var(--c-surface)` without first verifying CSS variable inheritance in that rendering context.

For the same detached reason, these components also hardcode the dark-mode **border/chip/text** equivalents rather than referencing `--c-border-strong`/`--c-chip-bg`/`--c-text` tokens (which would not resolve outside the root cascade): `#2E343C` (border-strong equivalent), `#252931`/`#14171D` (chip/recessed surface equivalents), and `#E2E8F0` (text equivalent). They appear in `slide-out-panel.tsx`, `purge-tracker.tsx`, `add-albums-drawer.tsx`, `stack-picker-sheet.tsx`, and `wantlist-crossover-prompt.tsx`. These are the blessed detached-context values alongside the surface pair — do not migrate them to tokens without verifying variable inheritance, and do not flag them as color-doctrine violations.

### App-Level CSS Custom Properties

- `--app-bg` — set dynamically in App.tsx as the scroll-fade gradient base color. Dark: `#0A0C0F`, Light: `#E4E7EA` (v0.7 gray retheme — was navy `#081A31` / cyan `#ACDEF2`). Used for the top-of-screen scroll fade overlay. (The app root also paints a radial gradient — dark: `#101214` → `#060708`, light: `#FFF` → `#E4E7EA` — and syncs the `<html>` background to `#060708`/`#F9F9FA`; these are the true outermost canvas colors.)
- `--nav-clearance` — `calc(84px + env(safe-area-inset-bottom, 0px))` on mobile, `0px` on desktop — the height the fixed bottom nav overlays. Set in `App.tsx` on the per-screen wrapper that renders `renderScreen()`, so every screen inherits it and the declared fallbacks never actually fire.
- `--scroll-bottom-pad` — `calc(32px + var(--nav-clearance))`, set alongside it. **Every scrolling container uses this**, so the gap between the last row of content and the nav is identical on every screen. Before it was centralized, scroll containers used four different bases (0/16/24/32px) and one — the followed-user profile — had none at all, which put its last row permanently under the nav with no scroll range to reach it. Do not hand-roll `calc(Npx + var(--nav-clearance))` on a scroll container; a new screen that forgets the token should look obviously wrong rather than plausibly-but-subtly off.
  - Two deliberate exceptions keep bare `--nav-clearance`: **centered empty states** (`album-grid`, `album-list`, `wantlist`, `feed-screen`, `reports-screen`, `private-data-card`), where the padding defines the band a block centers in and a base offset would decenter it; and **`purge-tracker.tsx`**, whose pinned footer supplies its own clearance, so the scroll area drops to a bare `24px` while that footer is showing.
  - The browser-vs-installed-PWA difference is handled entirely by `env(safe-area-inset-bottom)` inside `--nav-clearance` and by the `.app-viewport` height rule (see Full-Screen Viewport Height). `--scroll-bottom-pad` only adds a static base on top; do not try to fix a standalone-mode spacing bug by changing it.
- `--slide-panel-footer-pb` — `84px` (mobile) / `16px` (desktop) — bottom padding for pinned sheet footers.
- WantlistCrossoverPrompt bottom offset: `calc(72px + env(safe-area-inset-bottom, 0px))`
- Scroll fade overlay height: `calc(128px + env(safe-area-inset-bottom, 0px))`

### CSS Utility Classes (theme.css)

- `overlay-scroll` — enables momentum scrolling and overflow behavior for scrollable containers. Used across 6+ screen components.
- `tappable` — applies press-state feedback styling for interactive elements.

### Sonner Toast Theming

`theme.css` contains an extensive custom Sonner toast palette (lines ~215–276). This is intentional and should not be removed or overridden.

### Safe Area Insets
All bottom sheets and floating elements must account for iOS safe areas:

```tsx
paddingBottom: "env(safe-area-inset-bottom, 16px)"
```

The bottom tab bar floats 12px from the bottom with 10px side margins. Inner scrollable content in bottom sheets needs `paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 120px)` to scroll fully above it.

### Full-Screen Viewport Height (iOS Safari)

Never use Tailwind's `h-screen` (which maps to `100vh`) for full-screen layouts like splash screens or loading screens. On iOS Safari, `100vh` includes the area behind the browser chrome, causing unwanted vertical scroll. Use `100dvh` (dynamic viewport height) instead:

```tsx
style={{ height: "100dvh" }}
```

`100dvh` adjusts to the actual visible area as the browser chrome shows/hides. Supported in all modern browsers (baseline late 2022).

**Standalone PWA exception (the app root).** `100dvh` is correct in a browser tab, but in an installed (standalone) iOS PWA it resolves *shorter* than the physical screen — it excludes the home-indicator strip. Because the app root is `overflow: hidden`, the fixed bottom nav then anchors to the root's box and `bottom: 0` lands above the strip, floating the nav above the home indicator. The app root therefore uses the `.app-viewport` class (theme.css), not an inline height:

```css
.app-viewport { height: 100dvh; }                 /* browser: clears chrome */
@media all and (display-mode: standalone) {
  .app-viewport { height: 100vh; }                /* installed PWA: fills the true screen */
}
```

Do not move the app-root height back to an inline `100dvh` — that reintroduces the floating-nav bug in the installed PWA. Splash/loading screens keep plain `100dvh` (they have no fixed bottom nav, so the standalone quirk doesn't surface).

### Input Font Size (iOS Auto-Zoom Prevention)
All `<input>` elements must have `font-size: 16px` minimum. iOS Safari auto-zooms on inputs smaller than 16px. This is a hard rule.

### Star Ratings (the user's own)

The Discogs 1–5 star rating on an owned copy, surfaced from the free-data pass. **Not** the community average rating album detail shows from the enriched release fetch — different number, different meaning, and they sit near each other, so this one is always labeled as yours.

- **Write path**: `rateAlbum(albumId, rating)` in `app-context.tsx` — Discogs first (via `proxyUpdateCollectionInstance`), then local state + the Convex cache on success. Deliberately not optimistic: a star the server rejected must never appear. `0` clears.
- **The Discogs call is not a custom-field write.** "Change Rating Of Release" POSTs `{rating}` to the **instance** URL (no `/fields/{id}` segment) — the same endpoint and call shape `proxyMoveToFolder` uses. It rides along inside `proxyUpdateCollectionInstance` after the custom-field loop so "edit this copy" stays one action; do not give it an action of its own.
- **`0` is write-only.** Discogs accepts 0 to clear a rating but also *returns* 0 to mean unrated, so it is never stored: `collection.updateInstance` maps `rating: 0` to the field's absence. Read through `hasRating`.
- **Surfaces**: the purge evaluator (read-only, hidden when unrated — that card asks for one decision), album detail's Your Copy row (tappable, no edit mode — it's a one-tap write), the `rating-high` sort, and an "Unrated" quick filter. The sort option and the filter chip both **hide until the collection has any ratings at all**, so they don't appear as no-op controls before the free-data backfill reaches that user.
- **Insights shows rating × purge, not a ratings histogram** — "You've rated N releases two stars or lower and never tagged them," gated at 3, in the Purge Progress card. A histogram is vanity; this is a decision prompt.

### Album Detail Edit Mode
The album detail panel (`album-detail.tsx`) has an inline edit mode for `mediaCondition`, `sleeveCondition`, `notes`, and `folder`. Key patterns:
- Edit mode is entered via a `Pencil` (16px) icon button. On mobile, the edit button sits in the "YOUR COPY" card header row (right-aligned). On desktop (`hideHeader=false`) it sits beside the X close button in the panel header.
- Edit mode is not accessible while `isSyncing` — the button is hidden during sync.
- `isEditMode` state resets whenever `selectedAlbum` changes.
- On Save: Convex proxy actions first (`proxyUpdateCollectionInstance` / `proxyMoveToFolder`), then local state + Convex cache update via `updateAlbum` from context. On failure: error toast, stay in edit mode so the user can retry. Never trigger a full re-sync.
- Folder moves use the two-step Discogs API process: add to new folder → delete from old folder. The new `instance_id` returned by the add call must be stored in local state and Convex.
- `updateAlbum(albumId, fields)` in `app-context.tsx` updates local albums state and fires `collection.updateInstance` Convex mutation. Pattern mirrors `setPurgeTag`.
- Condition grades for the dropdowns: use `CONDITION_GRADES` exported from `discogs-api.ts` — do not hardcode them.
- Custom field ID resolution for the Discogs update happens inside `proxyUpdateCollectionInstance` — it fetches the user's field definitions server-side to map field names to IDs.
- All `<select>` elements in edit mode use `appearance: none` with a custom SVG chevron background image. Arrow color switches by theme (`#AAAAAA` dark, `#333333` light). `paddingRight: 36px` prevents text overlap with the arrow. This ensures consistent select styling on iOS Safari where native select arrows do not respect dark mode.

### Album Detail Enriched Metadata
The album detail panel lazy-loads enriched metadata from the Discogs `/releases/{release_id}` endpoint via `proxyFetchRelease`. Key patterns:
- **In-memory cache**: A module-level `Map<number, ReleaseData>` persists across panel open/close within the same session. No Convex persistence — this is session-scoped enrichment data.
- **Stale guard**: The `useEffect` fetch uses a `let stale = false` + cleanup return pattern to prevent state updates after the component unmounts or the album changes.
- **Hook ordering**: All hooks (`useState`, `useEffect`, `useCallback`, `useMemo`, `useAction`) must be called unconditionally before the two early returns (want item guard and null album guard). Moving hooks below early returns causes "Rendered fewer hooks than expected" errors.
- **ReleaseData shape**: `{ country, notes, tracklist, credits, community, identifiers, genres, styles, lowestPrice, numForSale }`. `lowestPrice`/`numForSale` power the Value section (see below).
- **Mobile hero image**: On mobile (`hideHeader === true`), the panel renders a padded square cover image (`px-4 pt-3`, `rounded-[12px]`, `aspect-square`, `1px solid var(--c-border-strong)`) with a gradient scrim overlay (`linear-gradient(to top, rgba(0,0,0,0.82), transparent)`) covering the bottom 55%. Album title (22px, Bricolage Grotesque 700, white) and artist · year (15px, weight 500, white 80%) float as text on the gradient. Desktop side panel layout is unchanged.
- **Thumbnail carousel**: `mt-3` spacing below the hero image.
- **Flat section system (no cards)**: The panel body is a flat stack of open sections separated by inset `1px solid var(--c-border)` hairlines (each section draws only its own `borderTop`; the first section — Listening — draws none), matching the feed identity block's hairline-row pattern. Every section is `px-4 py-4` and opens with the shared `SectionLabel` eyebrow (13px, weight 600, uppercase, `letterSpacing: 0.04em`, `var(--c-text-secondary)`) — local to `album-detail.tsx`. The old bordered/filled `--c-surface-alt` cards (Your Copy, Value, the inner session-list box) are gone — do not reintroduce card chrome here; the edit-mode form is the one deliberate exception (its inputs keep the inset card). Session list rows and the New Session row are separated by the same hairlines.
- **Purge tag**: Renders as a chip in the Your Copy section header row (mobile), beside the edit pencil. On desktop it stays in the title block under the cover.
- **"Your Copy" section header**: `SectionLabel` eyebrow left; on mobile the purge chip + edit pencil sit right-aligned in the same row. Data rows only (Format → Notes + custom fields) — no actions live inside Your Copy anymore.
- **Panel section order**: Hero → Thumbnail carousel → **Listening** (SectionLabel + last-played status right-aligned in the header row, Mark as Played / Log Past Play buttons, past-play picker, and the play-history accordion — all play concerns in one section) → **Your Copy** (data rows only) → **Value** → **Add to a Session** → **Rate for Purge** → **Listen On** → Community (compact row) → Enriched Tabs. `AlbumDetailPanel` renders the shared **Value section** (below) directly after Your Copy — deliberately adjacent so the condition-tiered price suggestions read against the copy's own Media/Sleeve grades; it reuses the live `lowestPrice`/`numForSale` the panel already fetches via `proxyFetchRelease`, so there's no extra request. (This live ask can differ from the ~monthly drip value shown in Insights Top Shelf; the album-detail figure is the current one.)
- **Tracklist footer**: `TracklistSection` renders a `{N} tracks · {runtime}` muted footer line under the full list; total runtime is computed client-side from track durations and shown only when every track has a parseable duration (a partial sum would understate the runtime).
- **Enriched content tabs (mobile)**: On mobile, Tracklist, Credits, Pressing Notes, and Identifiers render as a sticky horizontal tab bar instead of accordion sections. Tabs with no data are hidden after the enriched fetch resolves. During loading, all four tabs show at `opacity: 0.4` with a skeleton below. Active tab uses `2px solid #EBFD00` underline indicator. Tab bar uses `position: sticky; top: 0; z-index: 10` with a background matching the sheet's hardcoded detached-surface background (`isDarkMode ? "#14161C" : "#FFFFFF"`). An IntersectionObserver sentinel pattern applies `paddingTop: 48px` only when the tab bar is stuck, clearing the close button. `tabBarStuck` state resets on album change. On desktop, the original accordion sections remain.
- **Section component props**: `hideTitle` prop added to `TracklistSection`, `CreditsSection`, `PressingNotesSection` — suppresses section headings when rendered inside tab content on mobile. `hideToggle` prop added to `TracklistSection` — shows full tracklist without Show More truncation on mobile tabs.
- **Inner scroll container**: The `div.flex-1.overflow-y-auto` inside `AlbumDetailPanel` conditionally applies `overflow-y-auto` only on desktop (`hideHeader === false`). On mobile, `overflow-y` is removed so `position: sticky` resolves against `scrollRef` in `SlideOutPanel`.
- **Two distinct notes**: User personal notes (from collection sync) stay in Your Copy. Discogs pressing/matrix notes (from enriched data) go in the collapsible Pressing Notes section (or Pressing Notes tab on mobile). Never merge these.
- **Wantlist button**: Intentionally removed from collection album detail view. The underlying `WantlistHeartButton` logic remains for wantlist item detail.
- **Skeleton loading**: `EnrichedSkeleton` component with `animate-pulse` bars shows while release data loads.
- **Image lightbox (`ImageLightbox`)**: shared by all three detail panels, rendered via `createPortal` to `document.body`. The portal is load-bearing: the panels live inside transform-animated containers (bottom sheet / side panel), which trap `position: fixed` and z-index inside the sheet's stacking context — without the portal, the sheet's floating close button (`sheetZIndex + 1`) sits on top of the lightbox's close button and tapping X closes the whole detail card. Do not inline the lightbox back into the panels.
- **Sheet open gate (`App.tsx`):** The desktop side panel and mobile sheet open condition checks `selectedAlbum || selectedWantItem || selectedFeedAlbum`. Any new panel type added to `AlbumDetailPanel` routing must also be added to this gate or the sheet will silently refuse to open.
- **DestructiveButton** — shared two-tap confirm button component, local to `album-detail.tsx`. Props: `label`, `confirming`, `loading`, `onClick`, `variant?: "destructive" | "neutral"` (default: `"destructive"`). Destructive variant: outlined white text (first tap) → solid `#FF2D78` fill (confirm tap) → `Disc3` spinner while async in flight. Neutral variant: `var(--c-surface)` bg + `var(--c-border-strong)` border + `var(--c-text)` color in all states, no pink. Used by `WantItemDetailPanel`, `AlbumDetailPanel` (remove from collection) with `destructive`; `ReleaseDetailPanel` (remove from wantlist) with `neutral`.

`ReleaseDetailPanel` — detail panel for non-collection albums (feed/following, and pressings chosen in "Look It Up"). Takes a `FeedAlbum` prop. Loads enriched data via `proxyFetchRelease`. Shows hero image, thumbnail carousel, a Details hairline section (Year, Label, plus Country and Genres/Styles chips from the enriched fetch — `WantItemDetailPanel` has the same Details section), enriched tabs, community stats, the **Value section**, and action buttons. Does not include Mark as Played, Purge, Edit, or session picker. Action buttons ("Add to Collection", "Add to Wantlist", "Remove from Wantlist") render side by side in one row (`flex gap-2`, each `flex-1 min-w-0`) and use neutral surface style — `var(--c-surface)` bg, `var(--c-border-strong)` border, `var(--c-text)` color. Add buttons carry leading icons: `GalleryVerticalEnd` (collection) and `Heart` (wantlist), 16px. "View Your Copy" (shown when already in collection) retains its green surface style with the `GalleryVerticalEnd` icon. "Remove from Wantlist" uses `DestructiveButton` with `variant="neutral"` (no icon).

**Value section (`ReleaseDetailPanel` + `AlbumDetailPanel`)** — the record-store price lookup. A prior full market-value attempt was abandoned as inaccurate/over-complicated; this is the deliberately minimal replacement. The `ValueSection` component is shared: `AlbumDetailPanel` (collection) renders it directly after Your Copy (condition adjacency — see the panel section order above), `ReleaseDetailPanel` (feed/search) after its Community row, each passing the live `lowestPrice`/`numForSale` from their own `proxyFetchRelease` fetch. It renders as a flat hairline section (SectionLabel eyebrow, no card). It shows the **live** lowest ask — deliberately NOT the shared market-value drip (`market_values`), which is up to ~30 days stale; the drip exists for the whole-collection Insights view where live fetching every release isn't possible, but a single open panel already has the current number for free. Presentation rules are load-bearing, not cosmetic:
- **Unofficial releases show no Value section at all.** `proxyFetchRelease` returns `isUnofficial` (any format description equals "Unofficial Release"); when true, both panels skip the section entirely and never call `proxyFetchMarketData`. Discogs bans selling bootlegs, so its price suggestions for them have no sales history behind them — showing them is made-up pricing. Accurate or nothing.
- **Tier 1, always** (official releases): the lowest-ask price as a 20px Bricolage headline with `lowest ask · {N} for sale` in 12px muted beside it, from `proxyFetchRelease`'s `lowestPrice`/`numForSale`. Labeled "ask," never "value." Zero listings → `No copies for sale`.
- **Tier 2, when available**: suggested prices for **VG, VG+, NM only** (not all eight grades) from `proxyFetchMarketData`, rounded to whole units with a `~` prefix, grade labels colored via `conditionGradeColor`, laid out as a compact left-clustered inline strip (auto-width cells, 12px padding, vertical hairline separators — NOT a full-width 3-column grid, which spread three small numbers across the whole sheet), with the microcopy `Suggested prices from Discogs sales history.` (these are Discogs' condition-adjusted price suggestions — the same numbers Discogs shows sellers — NOT the sold-history low/median/high, which the public API does not expose) `null` (no seller settings, or sparse data) → Tier 1 only, silently. No error/empty states, no nag.
- Session-scoped `marketDataCache` (module-level `Map`), mirroring `releaseDataCache`.
- **"N for sale" is plain text — NOT a link.** Outbound Discogs listing links were removed after every redirect strategy failed (see below). Reach to `AlbumDetailPanel`/`WantItemDetailPanel` is a deliberate future decision, not shipped.

**Outbound Discogs links: DO NOT ADD THEM.** Every strategy for linking to `discogs.com` from the installed iOS PWA has been tried and failed — the Discogs app's Universal Link intercepts the navigation and strands the user on its home screen. Attempt 1: raw href (bounced). Attempt 2: same-origin `go.html` with a client-side `location.replace()` (the in-app browser treats JS redirects as fresh navigations — bounced, and stranded a blank overlay). Attempt 3: `/api/go` Vercel function issuing a server-side HTTP 302 (in-app browser still app-switched — bounced). All redirector code has been deleted. The rule is now absolute and lint-enforced: no `discogs.com` hrefs anywhere in the app until Discogs fixes its deep-link handling. Marketplace data shown in-app (Value section) is the substitute. The single grandfathered exception is the pre-auth "Sign up" register link on the splash screen (a user without a Discogs account cannot log in at all; pre-auth, the Universal Link bounce risk is acceptable) — it has a scoped lint override and must stay the only one.

Session picker entry points: Bookmark buttons have been removed from all card views (Grid, Artwork, List, Swiper), and the `Music` icon button went away with the feed's Recommended card. The session picker is now accessed solely via the inline Add to a Session section in `album-detail.tsx` (a deliberate narrowing — do not add card-level session buttons back without instruction).

### Search/Filter Row

Standard row order (Collection, Wantlist, followed user profile):
[Search bar — flex: 1] [Large grid toggle] [List toggle] [Filter button]

**Exactly one element in this row is `flex-1`: the search bar.** Everything else
shrinks to its content. Wantlist violated this by putting its All/Priorities
chips in a *second* `flex-1` container, which halved its search field and left
two sibling screens with visibly different search widths at the same breakpoint.
Do not reintroduce a second `flex-1` here.

Removed toggles: compact 3-column grid (Grid3x3) and swiper/disk (Disc3).
These view modes no longer exist. VIEW_MODES and WANT_VIEW_MODES are
reduced to `grid` and `list` only. A useEffect guard resets any stored
`crate` or `artwork` view mode to `grid` on mount.

Followed user profile (FollowedUserProfile in following-screen.tsx):
Same row minus filter button — filter button is present but filter
system is not yet fully wired. Do not remove the button.

### Year Display Convention

Discogs returns `0` for year when a pressing has no release date. Always guard year rendering with a `hasYear` check — do not render year anywhere in the UI when the value is `0`, `null`, or `undefined`.

Define locally in each file that needs it:

```ts
const hasYear = (year: number | null | undefined): year is number =>
  year != null && year !== 0;
```

In card grid contexts, use `visibility: hasYear(year) ? "visible" : "hidden"` on the year span (not conditional removal) to preserve card height consistency. In detail panel `DetailRow` elements, use conditional removal (`{hasYear(year) && <DetailRow ... />}`).

### Image Sizing Convention
Two fields on every `Album`, `WantItem`, and `FeedAlbum` object:
- `thumb` — 150x150px — use for small display contexts (list rows, artwork grid, session thumbnails, feed compact cards, drawer thumbnails)
- `cover` — 500x500px — use for large/focal displays (detail panels, shuffle cards, grid cards)

Never use `cover` in contexts smaller than ~200px — always prefer `thumb || cover` for thumbnails. Loading a 500px image into a 40px element wastes bandwidth.

### master_id Matching
`master_id` is stored on `Album`, `WantItem`, and `FeedAlbum` objects. "In Collection" and heart filled state check both `release_id` and `master_id` to match across different pressings of the same recording. `master_id` of 0 means no master exists — skip matching on 0. The `isInWants` and `isInCollection` context helpers accept an optional `masterId` parameter. Feed and Following screens build `ownMasterIds` / `wantMasterIds` Sets for O(1) lookups.

### Following Feed Cache
The `following_feed` Convex table caches the 50 most recent albums per followed user (up to 25 users, most recently followed first). 24h TTL per user — bypassed when cached data lacks `master_id` (one-time migration). Powers Feed Recent Activity, the feed Shuffle section, and the Following screen's From the Depths section without requiring Following screen hydration. Avatar URLs for followed users are stored in the `following` Convex table and exposed via the `followingAvatars` map in context.

**Manual sync (Sync Now)** bypasses the 24h TTL on the following feed — `syncFollowingFeed()` accepts a `forceRefresh` parameter that skips the cache freshness check. `syncFromDiscogs()` (the manual trigger) always passes `forceRefresh: true`. Startup sync uses the default (`false`) and respects the 24h cache.

### Followed Collections (followed_items)
Followed users' full collections/wantlists persist in the `followed_items` Convex table (slim rows, all formats, with an optional `format` field for badging), written server-side by `discogs.syncFollowedUser`. The Following screen reads them per-profile via `followed_items.getForUser` (one subscription returning collection, wants, `syncedAt`, `isPrivate`). Profiles render instantly from cache; a background sync fires when a profile opens stale (24h TTL, once per user per session) or right after a new follow. Following someone is instant — one profile lookup registers the follow; there is no blocking collection fetch. Rows are cleaned up on unfollow, clear-all, and account wipe. Do not reintroduce client-side hydration loops that fetch followed collections from Discogs on screen open.

### Wantlist Caching
The wantlist is cached in the `wantlist` Convex table with the same 24h TTL as the collection. `convex/wantlist.ts` handles persistence (`getByUsername`, `replaceAll`, `addItem`, `removeItem`). Wantlist write operations (add/remove) update both local state and the Convex wantlist cache on success.

### Home Feed (feed-screen.tsx)

**Desktop feed sections are 72px apart** (`gap-[72px]`), not the 44px they were before the density change — at 6-across the sections butted into each other and read as one continuous grid rather than as distinct beats.

**Desktop album grids are 6 across.** Recently Added and On the Hunt already were; Shuffle (3, full-size), Decades (up to 4, full-size) and Format Spotlight (`repeat(albums.length)`, full-size) were the outliers, each stretching a handful of oversized covers over 1280px and pushing the rest of the feed below the fold. All five now use `grid-cols-6` + `gap: 12px` + the `compact` card. Format Spotlight's pick rose from a 3-or-4 coin flip to 6 (one full row) to match; category eligibility stays at 3, so a thin category shows correctly-sized cards in a short row rather than a few huge ones. **That pool is shared with the mobile scroller, which slices back to 4** — raising it for the desktop row must not lengthen the mobile section. The Collection, Wantlist and followed-profile grids are `lg:grid-cols-5 xl:grid-cols-6` — five below 1280px viewport, where the 208px sidebar has already taken width out of the content column. `GridCard`'s 13/12/11px text needed no change at this density, and cards keep `cover` (500px) rather than `thumb`: the Image Sizing Convention's ~200px threshold is about CSS display size for thumbnails and rows, and a ~196px card at 2× DPR still wants ~400px of image.

**Section order:** Identity block, Shuffle, Recently Added, Following Activity, Purge Tracker, Listening, Format Spotlight, On the Hunt, Decades, **End cap**.

**End cap** (`EndCapSection`): three actions closing the feed — **Look It Up** (opens the search panel), **Purge**, **Sessions**. One per thing the app is for: acquire, curate, listen, the latter two being what Discogs itself doesn't do. Before it, the feed simply stopped after Decades with no bottom room. Three columns at **every** breakpoint; the subtitles are `hidden lg:block` because a ~118px column on a phone cannot carry them without wrapping to four lines. It supplies its own bottom padding (32px desktop / 24px mobile) **on top of** `--scroll-bottom-pad` — that token stays centralized and must not be overridden per screen (see App-Level CSS Custom Properties). On desktop, Purge Tracker and Listening render together in a 2-column grid at the Purge Tracker slot — the two cards that ask for something (a verdict, a play). The three collection-random sections (Shuffle, Format Spotlight, Decades) are deliberately interleaved with other content — do not stack them adjacent.

**Insights card removed (v0.7.x), replaced by Listening.** Every piece of the old card had a better home: collection value and the growth count moved to the identity block (the latter as the `+N in 30 days` delta), "still unrated" was already a Purge Tracker chip with the identical tap target, and the rotating fact line duplicated the ticker directly above it. What was left — "no play recorded" — became the seed of the Listening card. The feed has no end-cap card now; Decades closes it.

**Listening card:** header + See All → Insights. With plays logged: a two-cell stat grid (**Played this month** · **Day streak**, the streak cell falling back to **Days since last play** when the streak is 0 — a "0 day streak" scolds, "6 days since" is an observation), the `{N} releases with no plays recorded` row (→ crate + `neverPlayedFilter`), and a **play suggestion**: one never-played release, daily-seeded so it holds still, with a Mark as Played button. With nothing logged: the stat grid is replaced by a short pitch and the suggestion's button goes yellow — the first tap converts the card to its filled state, which is the whole point. Zero new queries and **no new tracking** — `lastPlayed`/`playCounts`/`allPlayTimestamps` are already on the context, and the play log already stores one row per play. Its derivations live in `utils/listening.ts`, shared with the Insights screen so the two surfaces cannot report different numbers for the same log. It sits at feed position 5 on mobile rather than at the end: a card whose job is to earn the first logged play can't do that from the bottom of the feed.

**Recommended section removed (v0.6.x):** The time-of-day-weighted "Give this one a spin." hero was cut — it read as redundant with Shuffle. Its `getTimeBucket`/mood-folder scoring code was deleted with it; do not resurrect it. The feed-header transparency behavior it introduced remains: the mobile feed header is transparent at scroll position 0 on the home feed and transitions to opaque on scroll, scoped via a prop on the header component (`onHeroVisibility` keys off scroll position, not any hero section). The identity block sits flush under the transparent header.

**Identity block (above the fold):** The scripted time-of-day greeting pool was removed — real data carries the personality instead. A full-width band (no card container) built from rows separated by `1px solid var(--c-border)` hairlines, rendered by `identityBlock(variant)` with `"mobile"` and `"desktop"` arrangements. Mobile stacks three rows flush under the transparent header (wrapper clearance `calc(safe-area-inset-top + 58px)` — the band's own top hairline reads as the header's bottom edge): (1) avatar (44px, initial fallback) + username (22px Bricolage, `flex-1` + `min-width: 0`, truncates with ellipsis so it never collides with the sync control) + a **SYNC control** — center-aligned and vertically stacked: `RefreshCw` icon (Phosphor `ArrowsClockwise`, `weight="bold"`, 16px) *above* uppercase "SYNC" (13px, weight 700, letter-spacing 0.1em) in `var(--c-link)`, with just "{2h ago}" (`formatSyncedAgo`, 12px muted) beneath — the word "Synced" was dropped as implied; while syncing it becomes a Disc3 spinner over "SYNCING" and disables. Calls `syncFromDiscogs` with the Settings-style success/error toasts. (2) A stats grid — equal columns with vertical hairline dividers, ordered In Collection · Med. Value (`#009A32`, hidden when no cached collection value) · In Wantlist; values 22px Bricolage over 10px uppercase letterspaced labels; **each stat is a tappable shortcut** (In Collection → crate, Med. Value → reports, In Wantlist → wants). The Collection and Wantlist cells carry a third line — a **`+N in 30 days` recent-adds delta** in `#009A32` (`countAddedWithin` in `utils/insights.ts`). It is **adds only**: nothing anywhere records a removal (Discogs doesn't expose one and the caches are faithful mirrors), so a net change isn't derivable without a stored ledger — don't add one for a stat-cell subtitle. Med. Value has no history either (one current value + `synced_at`), so it has no delta. The line renders on every cell — `visibility: hidden` rather than removed when there's nothing to report — so the three cells keep a common baseline, same reasoning as the year-display convention. This absorbed the removed Insights card's "Added last 3 months". (3) The collection facts ticker on a subtle lifted strip (dark: `oklab(from #0C0F13 calc(l + 0.03) a b)`, light: `oklab(from #F9F9FA calc(l - 0.025) a b)`) with a **gradient fade at both ends** (`.feed-ticker-fade` in fonts.css — 28px mobile / 48px desktop) so facts arrive and leave instead of being chopped at a hard edge. Two things about that mask are load-bearing and were both verified against the alternative: it goes on a **static wrapper** around `.feed-ticker`, never on the animated track (a mask applies in the element's own coordinate space, so masking the translating track drags the fade along with the text) and never on the outer strip (which carries the tinted background — masking that notches the tint to the page canvas at both corners). And `mask-repeat` must be `no-repeat`; the default tiles the gradient across the track's overflowing width and stamps a fade every viewport-width. `deriveCollectionFacts(albums, playCounts)` returns structured `{ label, value }` pairs rendered as an eyebrow label (10px uppercase, `var(--c-text-faint)`) beside its value (13px weight 600, `var(--c-text)`); the fact order is shuffled (Fisher–Yates `shuffle`) so the ticker leads with a different fact each open — once at mount and again on every `visibilitychange` back to `visible`, since an installed PWA resumed from the background never remounts and would otherwise freeze the lead fact; the pool includes "Most rotated" (the highest-play-count record, gated at 2+ plays, derived from the existing `playCounts` map — no new listen tracking) when play history exists; seamless two-copy loop via the `.feed-ticker` keyframe in fonts.css — the track is `display:flex; width:max-content` and each item `flex-shrink:0; white-space:nowrap`, or iOS Safari stacks the text vertically; falls back to a single centered `pickRandom` fact under `prefers-reduced-motion` or when fewer than 2 facts. "Collecting since" was removed with the container redesign. Desktop composes the same pieces as one header strip (avatar 48px, username 26px, inline stat cells, sync control right) with the ticker strip underneath. Zero additional API calls — all fields come from context/cache.

**Format Spotlight:** Rotates the featured format on every app load. Categories are of two kinds: vinyl-descriptor categories matched by substring (7-Inch, 12-Inch, Limited Edition, Picture Disc, Colored, Etched, 45 RPM, Mono, Box Set, etc.) and media-type categories classified via `mediaType()` (CDs, Cassettes, 78s & Shellac) — a media-type category uses `mediaType` rather than a substring so "CD" never false-positives inside another word. Headers are the plain format name ("45 RPMs", "CDs") under the FORMAT SPOTLIGHT eyebrow — no "Your …" / "… in Your Collection" fluff. Requires a minimum of 3 matching albums per category to be eligible for display. Operates entirely on cached Convex collection data — zero additional API calls.

**Following Activity:** In-card Collection/Wantlist tabs over a followed-users feed (built by `buildFeedActivity`/`buildFeedWantActivity`, up to 10 rows each). Shows 5 rows collapsed with a "Show more"/"Show less" toggle (ChevronDown, rotates) that reveals the rest inline; the "See all" header link still routes to the full Following screen. Expansion resets on tab switch.

**On the Hunt:** Wantlist showcase — horizontal scroll on mobile (145px cards), 6-col grid on desktop. Shows priority bolt icons on prioritized items. "See All" navigates to wantlist screen. Tapping a card opens `WantItemDetailPanel`. Shuffled on mount with priority items weighted 2x, deduped, max 6 items.

**Decades:** Random eligible decade spotlight (requires 5+ albums in the decade). Header is a plain "The {decade}" (Rock Salt) under a DECADE HIGHLIGHT eyebrow — the old scripted flavor subtitles were removed. Uses `ShuffleAlbumCard` with `dominantColor` for artwork-driven card backgrounds.

**Shuffle** (this is the home-feed section; the Following screen has a sibling section over followed users' collections that keeps the older **From the Depths** name — the two are deliberately named differently, so don't unify them)**:** Leads the feed directly under the identity block — it reshuffles on every load, so it carries the "why did I open the app" slot. Introduced by the gradient "Shuffle" heading (Rock Salt 30px, pink→yellow→green→cyan) with, on the right, **two matched 36px circular buttons** — a `Dice` "Pick one" on the surface treatment, and the yellow `Shuffle` reshuffle (`reshuffle` — re-picks the 6-album pool). They are a deliberate pair: two related actions on the same set, distinguished by icon rather than by a label, and **yellow stays on reshuffle as the section's single accent**. The die carries "pick one" without text — the same gesture the native app will get as shake-to-random. Cards animate in with a staggered fade/rise (80ms, EASE_OUT, keyed on a shuffle counter; honors prefers-reduced-motion). 2x2 compact grid on mobile (sliced from the same pool), **one row of 6 compact on desktop** — two rows was tried and gave one of nine feed sections most of the fold. Uses `ShuffleAlbumCard` (`shuffle-album-card.tsx`) with `compact` and `dominantColor` props — compact shows only title, artist, and date (no year/label/folder meta line).

**"Pick one"** (`pick-one-overlay.tsx`) pulls a single release up as its own centered reveal — a close button, the full-size `ShuffleAlbumCard`, and an action row of a circular `Shuffle` re-pick beside **Mark as Played**. No eyebrow and no button labels beyond the yellow one: the card names itself, and the re-pick reads as the same circular shuffle affordance as the section header's. It replaced a one-vs-grid view toggle that only changed how many cards the grid drew; pulling one release up is the decision the app is actually for, and it makes the button *do* something rather than reformat something. Details that are deliberate:
- **It picks from the whole collection, not the shuffle pool** — the pool is what's already on screen, and the point is to surface something you weren't looking at.
- **"Again" never returns the release already showing** (`pickAnother` filters the current id) — a button that can change nothing reads as broken.
- **It is rendered in-tree from the feed, NOT portaled** to `document.body`, so the content tokens on `<main>` still resolve; the card's dominant-color treatment falls back to `var(--c-*)`, which a portal would strand (contrast the lightbox in `album-detail.tsx`, which portals and therefore hardcodes its colors).
- **Centered at both breakpoints**, not a bottom sheet — it's a reveal, not a browsing surface.
- **Mark as Played closes it.** That is the completion, the toast is the confirmation, and the unmount doubles as the double-fire guard (so there is deliberately no `marking` flag). Tapping the card hands off to the full detail panel and closes the reveal.
- Registers with the **dialog stack** for Escape, so the album detail sheet can open over it without one keypress closing both.

**Dominant color cards:** `DominantColorCard` (`dominant-color-card.tsx`) extracts the dominant color from album artwork via canvas sampling and uses it as the card background. Text contrast (light/dark) is determined by WCAG 2.1 relative luminance. Images are proxied through `/img-proxy/` (Vite dev proxy + Vercel rewrite) to avoid CORS canvas tainting. The component sets CSS custom properties (`--dc-bg`, `--dc-text`, `--dc-text-secondary`, `--dc-text-muted`) for children to consume. `ShuffleAlbumCard` supports a `dominantColor` boolean prop that wraps the card in `DominantColorCard` and switches text colors to `--dc-*` vars with `--c-*` fallbacks. A `compact` boolean prop reduces font sizes and hides the year/label/folder meta line.

### Following Screen (following-screen.tsx)
- **Avatar size**: 80px (with 28px fallback initials). Button container width: 92px.
- **Avatar row sort order**: Sorted by most recent `followingFeed` entry per user (descending). Users with no feed entries fall to end, tiebroken alphabetically. Sort is derived via `useMemo` and applied only to the avatar row display order — does not affect the main user list.
- **From the Depths**: A horizontal-scroll peek into followed users' collections, built from the `following_feed` cache (seeded per user + 12h time bucket, up to 4 cards each). This section keeps the **From the Depths** name — the home feed's equivalent collection-random section is called **Shuffle**, but the followed-users version deliberately does not. Uses the shared `ShuffleAlbumCard` (the component name is generic; it does not imply the section name). The heading renders in `Manufacturing Consent` blackletter (32px/400, matching the feed's Recently Added/Insights headings) — not Bricolage Grotesque.

### Reports & Insights (reports-screen.tsx)

**Sections** (uses recharts library):
1. **Stat line**: Compact plain text at the top of the screen (the "Insights" name comes from `MobileHeader`/the nav, not an in-screen heading — this screen has no title on desktop; see Navigation Structure) — "{N} collected · {N} on wantlist". DM Sans 13px, font-weight 500, var(--c-text-muted). No card, no border.
2. **Collection Value**: Hero median value in green, min/max range.
3. **Condition**: Standalone card with color-coded horizontal bar chart per condition grade and "X% of your collection is NM or better" green pill callout. Uses conditionGradeColor spectrum. Not part of the Breakdown card.
4. **Missing Details** (`CollectionMaintenanceSection`): the two grading gaps — Media Condition and Sleeve Condition — as a **fixed 2-up grid**, never a horizontal scroller (there are only ever two categories, so a scroller with 240px tiles bought nothing and fit neither on a phone). Each tile is a typographic stat block: the count as a 36/44px Bricolage hero in the section's ice-blue accent with `tabular-nums`, a 10px uppercase letterspaced label under it (the identity-block stat-cell treatment), and a faint `Not set` line. **No icon** — it carried nothing the label wasn't already carrying. Tapping expands the list of affected releases (cap 50 + a `+N more` line) as before.
5. **Breakdown**: Tabbed card with three tabs:
   - *By Folder*: Two-column ranked list (folder name + count, divider rows, no bars, no cap — all folders shown). When ≥70% of the collection is priced by the market-value drip (Spec 6B), a muted `~$X` folder-total line renders under each count (right-aligned stack); below that threshold the value line is hidden so partial data can't read as a full folder valuation.
   - *By Decade*: recharts BarChart. Filters albums with year < 1900. Peak decade bar rendered in #EBFD00. Yellow pill callout below: "{decade} is your most collected decade" with faint yellow background (rgba(235,253,0,0.08)), border (rgba(235,253,0,0.2)). Hidden if fewer than 3 distinct decades.
   - *By Format*: media-type-aware (all-formats). Groups by `mediaType()` first. A single-medium collection shows the descriptor stat grid (LP, 12", 7", Box Set …) unchanged; when one medium dominates (≥90% — the common mostly-vinyl case) the descriptor grid stays with a "plus N CDs, M cassettes" footer; genuinely mixed media show a media-type stat grid with the majority-medium descriptor breakdown beneath. The descriptor tokenizer splits on comma/semicolon and strips a fixed word set ("Album", "All Media", "Reissue", "Compilation", "Stereo", "Mono", "Promo", "Limited Edition", "Deluxe Edition", "Remaster", "Special Edition", "Club Edition", "Transcription", "Unofficial Release", "White Label", "Record Store Day") plus any token classifying as the majority medium (so "Vinyl"/"CD" never dominate their own breakdown).
6. **Top Artists**: Ranked list (#1–#10). Filters to artists with 2+ albums. Hidden if fewer than 3 qualify. Excludes "Various", "Various Artists", "Unknown Artist", "Unknown". #1 rank in #EBFD00, #2–3 in var(--c-text-muted), #4+ in var(--c-text-faint). Disambig suffixes (e.g. " (2)") stripped before grouping.
7. **Top Labels**: Lollipop chart (thin stem + dot). Filters to labels with 2+ albums, cap 10. Hidden if fewer than 3 qualify. Dot color: CHART_BLUE (#0DB1F2).
8. **Listening Activity**: Stats grid (played this month in green Keep styling, days since last played, no plays recorded count) above a chip-tab list — **Recently Played · Top Played · No Plays**, in that order. Only tabs with data render; the `tab` state defaults to `"recent"` so the first chip is also the selected one on open (the lose-your-data fallback to `listTabs[0]` does not achieve that on its own). Rendered **before** Top Shelf — what you actually play is a better second beat than what the collection is worth.
9. **Purge Progress**: A horizontal headline (`{rated} of {total} evaluated` + `{pct}%`, replacing the old radial ring's stacked center text), a full-width **segmented progress bar** (Keep/Maybe/Cut verdict slices over a neutral `--c-chip-bg` unrated track — the colored slice reads as "how far into the purge," left-aligned), and a **legend row** carrying the exact counts (Keep/Maybe/Cut/Unrated, colored dots via `purgeTagColor`; unrated dot uses `var(--c-text-muted)`) that replaced the old 2×2 stat grid. Empty-state nudge when nothing's evaluated. When a cached collection value exists and 3+ albums are tagged Cut, a "Cutting deadweight: …" callout line — count-only ("{N} releases tagged Cut.") until the drip has priced the Cut records, then upgraded to "{N} tagged Cut, ~${X} at lowest ask." (Spec 6B, summing `marketValue` over Cut albums).
10. **Collection Growth**: recharts BarChart of releases added per year (from `dateAdded`), capped to the last 10 years, current-year bar in #EBFD00 (edged brass gold in light mode, matching the peak-decade convention). Yellow callout pill: "{N} releases added in {year}" for the biggest year, or "Your biggest year yet" when the biggest year is the current one. Derived via `bucketAddsByYear` in `utils/insights.ts`. Rendered after Breakdown, before Top Artists.
11. **Top Shelf** (Spec 6B): The five most valuable releases by lowest marketplace ask, from the shared market-value drip. Own card rendered after Listening Activity; rows show 40px artwork + title/artist + green `~$X` and tap through to album detail. Subtitle "Your priciest pressings by lowest marketplace ask." Hidden until 10+ of the collection's releases are priced.

*(A **Spending** section — total/avg/most-expensive from `pricePaid` — was removed: `pricePaid` was never populated (Discogs exposes price paid only as a per-user custom field, not universal data), so it was permanently inert. It has since been **dropped end-to-end** — the `Album` type field, the sync mapping, the collection cache mutations, and all client plumbing are gone; the Convex `collection.pricePaid` schema field is now `v.optional` legacy pending a clear-then-redeploy pass. Do not rebuild it or any feature on price paid. `parsePricePaid`/`deriveSpending` were deleted from `utils/insights.ts` with the Spending section.)*

**Market value in Insights (Spec 6B / Session B).** `ReportsScreen` subscribes to `market_values.getForUser` (see the market-value drip in Data Architecture) — subscribed there, not in app-context, so the query stays scoped to the lazy Insights chunk — and merges `value`/`fetchedAt` onto the albums by `release_id` (`Album.marketValue` / `marketValueFetchedAt`). The local `hasMarketValue` guard treats only a priced number > 0 as usable (excludes `null` = no listings and `undefined` = never fetched). All value pieces (Top Shelf, By Folder value column, the Purge Cutting-deadweight dollar upgrade) are threshold-gated so a sparsely-filled drip shows nothing rather than a lopsided view. (A Paid-vs-market callout was intentionally dropped — it depended on `pricePaid`, which is never populated; market-value UI keys only on drip data, never on price paid.) Values are labeled as **ask**, formatted whole-dollar with a `~` prefix via the local `formatWhole` helper — never a firm "value" (matching the album-detail Value-section convention). A footer freshness line "Market asks updated {Xd ago}" (`formatSyncedAgo(max(fetchedAt))`) renders whenever any value data exists.

**Minimum data thresholds** (sections render null if not met — no empty states):
- Top Artists: 3+ artists with 2+ albums
- Top Labels: 3+ labels with 2+ albums
- By Decade golden era callout: 3+ distinct decades
- By Format tab: 2+ distinct format types
- Collection Growth: 2+ distinct add-years and 10+ total records
- Purge × value callout: cached collection value present and 3+ Cut
- Top Shelf (Spec 6B): 10+ albums with a priced market ask
- By Folder value column (Spec 6B): ≥70% of the collection priced

### Convex View Mode Fields

`view_mode` and `want_view_mode` are stored as `v.optional(v.string())` — not string enums. Adding new view mode values (e.g. `"grid3"`) requires no schema change and no `npx convex deploy`.

---

## Navigation Structure

### Mobile (< 1024px)
Mobile bottom tab bar is fixed flush to the bottom edge (not a floating pill).

- `left: 0`, `right: 0`, `bottom: 0`, `border-radius: 0`
- Height: `calc(54px + env(safe-area-inset-bottom, 0px))`
- `paddingBottom: env(safe-area-inset-bottom, 0px)` applied internally
- **Theme-aware surface** (reads `isDarkMode`):
  - Dark: background `linear-gradient(to bottom in oklab, #14171D, #0C0F13)` (v0.7 cool-gray bar hexes, blending with the neutral background family), top border `rgba(226,232,240,0.08)`, active `#EBFD00`, inactive `#D1D8DF`
  - Light: background `linear-gradient(to bottom in oklab, #FFFFFF, #F9F9FA)`, top border `#D7DADE`, active `#16181C` (near-neutral black, matching desktop nav — yellow does not read on a light bar), inactive `rgba(22,24,28,0.65)`
- The nav itself needs no PWA-standalone override — it stays flush via the app-root height fix (see the `.app-viewport` note under "Full-Screen Viewport Height"). The `.bottom-tab-bar` class on the `<nav>` is a styling hook with no rules attached; keeping the nav flush is the app root's job, not the nav's.

5 items:

| Order | Label | Icon | Screen |
|---|---|---|---|
| 1 | Feed | Newspaper | `feed` |
| 2 | Collection | GalleryVerticalEnd | `crate` |
| 3 | Wantlist | Heart | `wants` |
| 4 | Sessions | Music | `stacks` |
| 5 | Insights | BarChart3 | `reports` |

**Purge is not in the mobile bottom bar** — Purge is accessed from the Feed screen card, Settings quick-access card, and Album Detail.

### MobileHeader Variants

MobileHeader is context-aware and renders one of five variants based on
`screen` and `followedUserProfile` from AppContext.

**Variant A — Feed**
PillLogo (h-32px) left. Users icon + avatar right.
Wordmark is the only screen where the logo appears in the header.

**Variant B — Standard screens (Collection, Wantlist, Insights, Settings)**
Screen title `<h1>` left (Bricolage Grotesque 700, 28px, truncating).
Users icon + avatar right.

**Variant C — Sessions (list view)**
Screen title left. Yellow Plus button (w-8 h-8 rounded-full bg-[#EBFD00]) +
users icon + avatar right. Plus button calls `onNewStack` from context.

**Variant D — Following (no profile open)**
Screen title left. Yellow UserPlus button + users icon + avatar right.
UserPlus button calls `onAddFollowedUser` from context.

**Variant E — Following (profile open, followedUserProfile !== null)**
Back arrow + user avatar + @username (truncating) left.
Muted UserMinus button (var(--c-text-muted), NOT destructive red) right.
Back calls `onBackFromProfile`. Unfollow calls `onUnfollowUser` (triggers
existing confirmation modal — does not unfollow directly).

**Variant F — Session detail (stacks screen, `stackDetailOpen === true`)**
Renders **nothing** — `return null`. `StackDetail` already draws its own full
header (back chevron + editable session name + share), and unlike `MobileHeader`
(which is `lg:hidden`) it does so at **every** breakpoint. Moving those controls
into a mobile-only header variant would leave desktop with no back button and no
title, which is exactly the gap the followed-user profile has on desktop today.
Suppressing the row instead leaves the session's own name as the sole heading —
"Sessions" at 28px directly above a 28px session name made the *less* informative
line the dominant one, and the screen is already identified three times over (lit
nav tab, the tap that got you here, the name itself). Reclaims ~58px.
Safe-area top padding lives on the header **wrapper** in `App.tsx`, not inside
`MobileHeader`, so returning null does not push content under the status bar —
verify that still holds before giving any other screen a null header.
`stackDetailOpen` is registered by the Sessions screen through context, mirroring
`followedUserProfile` (the `activeStackId` that drives it is local to `Stacks()`).

The shared right-side button group (`navButtons`, used by Variants A–D)
leads with the sync chip (when syncing — it sits at the far left of the
group so it never splits the button cluster; on the Feed screen it is
suppressed during collection syncs since the identity block's SYNC
control already shows that state, but still appears there for
following-feed syncs), then a **Search button** that opens the "Look It
Up" sheet via `setShowDiscogsSearch(true)` — present on every screen
except the two sub-views (Following profile, session detail), so the
record-store lookup is one tap from a cold open. Then the Users icon and
avatar. Both sub-views deliberately trade that group away for a header
that belongs to the thing you drilled into; each keeps a back affordance.

Title truncation on all variants: `white-space: nowrap`,
`overflow: hidden`, `text-overflow: ellipsis`, `min-width: 0`,
`flex: 1` on title wrapper. Right button group is `flex-shrink: 0`.

SCREEN_TITLES map lives in `navigation.tsx`. Feed is intentionally omitted.

**Per-screen internal title *bars* were removed from all screens; a desktop
screen *heading* was later reinstated centrally.** The removal was correct while
a horizontal top nav existed; with the sidebar rail the rail names the *app*, not
the screen, and `MobileHeader` (which supplies the mobile `<h1>`) is `lg:hidden` —
so desktop had no screen identification at all.

**`DesktopScreenTitle` (navigation.tsx) is the single implementation**, rendered
from `App.tsx` immediately above `renderScreen()`. It reads the same
`SCREEN_TITLES` map `MobileHeader` uses, so the two cannot drift and a screen
added later gets a heading for free. `hidden lg:block`, 48px Bricolage 700 via
the `.screen-title` rule in fonts.css (deliberately desktop-only — it sets no
base size, because every consumer is `hidden lg:block`). **Do not add per-screen
titles back into individual screen components** — Collection and Wantlist each
had one briefly and they were folded into this. It is a bare heading above the
control row, never a bar with chrome.

**`DesktopScreenTitle` owns the entire title-to-content gap.** Every screen zeroes
its own desktop top padding (`lg:pt-0`, or simply no `pt` where the wrapper is
already `hidden lg:flex`), so the title's 16px bottom padding is the only spacer
and the distance is identical on all of them. Before this each screen stacked its
own `lg:pt-*` under the title and the gap ranged 14–30px depending on which screen
you were on — most visible flipping between Following (30px) and Settings (14px).
Change the padding once, in the title, and it changes everywhere. **Do not
reintroduce a per-screen `lg:pt-*` on whichever element sits directly beneath the
title.** Mobile base paddings are untouched — the overrides are `lg:`-scoped.

Because the title sits in the flex column above the screen, `renderScreen()` is
wrapped in a **`flex-1 min-h-0 flex flex-col`** div. That wrapper is load-bearing:
every screen root is `flex flex-col h-full`, and without it `h-full` would resolve
against the column that now also holds the title and overflow by the title's
height.

Two sub-views are deliberate exceptions:
- **Session detail** (`stackDetailOpen`) renders no title. `StackDetail` already
  draws its own header (back chevron + editable session name + share) at *every*
  breakpoint, so a "Sessions" heading above it would make the less informative
  line the dominant one — the same reason `MobileHeader` returns null there.
- **A followed user's profile** (`followedUserProfile`) shows `@username` rather
  than "Following", because that is what you are looking at. This closed half of
  the long-standing desktop gap for that view; it still has **no back button**
  (the rail's Following item is the way back, and unlike mobile the rail is
  always on screen).

### Desktop (>= 1024px)

All desktop chrome is a **left sidebar rail** (`DesktopSidebar`,
`DESKTOP_SIDEBAR_WIDTH` = 208px), plus the per-screen `DesktopScreenTitle`. Both are
`hidden lg:*`, so mobile is untouched. There is no horizontal bar of any kind.

This replaced a centered-wordmark horizontal top nav (`DesktopTopNav`, removed) that split four
items left against five right: it balanced by item count rather than hierarchy, left "Look It
Up" reading as a ninth place to go rather than a tool, and ran full-bleed while the content
column below was centered at 1280px — so nothing in the header lined up with anything under it.

**Sidebar** — logo at top (34px, → Feed), then destinations in two groups separated by a
hairline, then **Search** pinned at the foot above the account row:
- `DESKTOP_NAV_PRIMARY`: Feed > Collection > Wantlist > Sessions > Insights — **identical to
  the mobile bottom tab bar, in the same order.** Keep it that way; the two layouts should
  teach each other.
- `DESKTOP_NAV_TOOLS`: Purge > Following (Settings lives in the footer — see below)

The **sync chip** renders below the nav groups when a sync is running (suppressed on the feed
for collection syncs, where the identity block's SYNC control already shows it — mirroring
`MobileHeader`). It sits there rather than in the footer so it never crowds the account row in a
208px rail.

**There is no desktop top strip.** One was built (Look It Up as a 280px input-shaped button,
plus sync/theme/avatar) and then dismantled in two steps, both worth not repeating: the theme
switch and avatar sat marooned at the far right, a full content-width from the only other
control, so they moved to the sidebar footer; and the search field was an element **shaped like
an input that could not be typed into** — it opened the full-screen panel — which is a promise
the control doesn't keep, so it became a plain `Search` nav row in the rail. That left the strip
holding nothing but an intermittent sync chip, so the strip was removed entirely and the
content column now starts at the top of the viewport. Do not reintroduce it; the rail has room
for anything it would have held.

**Search is a rail row, not a field.** It sits at the **foot** of the rail (above the account
row) and is styled exactly like a destination, but takes **no active state** — it opens an
overlay, so there is no screen for it to be "on". That is why it is not a member of
`DESKTOP_NAV_PRIMARY`. **It carries no divider above it**: the `flex-1` spacer already separates
it from the destinations and the footer hairline closes it off below — a third hairline in a
208px rail is clutter, not structure.

**Sidebar footer** — avatar + Discogs username (ellipsizing) + the theme switch, above a
hairline. The name row is the way into Settings, which is why **Settings is deliberately not
also a nav row**: an avatar-and-name row at the foot of a rail is the conventional account
affordance, it matches `MobileHeader` (where the avatar is likewise the way in), and it uses
vertical room the rail has going spare. Do not re-add a Settings nav item beside it.

**Look It Up is an input-shaped `<button>`, deliberately not an `<input>`** — it opens the
full-screen search panel rather than accepting keystrokes, so a real input would promise
typing it can't take. Its placeholder names the database explicitly ("Search the Discogs
database"): Collection and Wantlist each carry their own search bar that filters the list in
place, and these must not read as the same control.

The avatar in the top strip navigates to Settings, matching `MobileHeader` where the avatar is
also the way in. Settings additionally appears as a labeled sidebar row — two conventional
entry points, not a duplication to collapse.

**Both the sidebar and the top strip render OUTSIDE the content token cascade.**
`getContentTokens()` is spread onto `<main>` and the desktop side panel only ("Header & nav are
unaffected by dark mode", `theme.ts`), so `var(--c-*)` does not resolve there. Colors come from
the shared `useDesktopChromeColors()` hook — the blessed derived equivalents, same approach the
old top nav used. Do not introduce `var(--c-*)` into desktop chrome without first spreading the
tokens onto it.

**The app root is a flex ROW** (`App.tsx`): sidebar, then a `flex-1 flex-col` content column
holding the top strip and the existing centered-main row. On mobile the rail is `display: none`,
leaving that column the full viewport.

Collection uses `GalleryVerticalEnd` icon (was `Library`; since the Phosphor migration this alias renders `CardsThree` — records standing in a crate). Insights uses `BarChart3` (Phosphor `ChartBar`). Active state: `#EBFD00` icon + translucent background highlight; active nav items use `weight="fill"`, inactive use `weight="light"`.

---

## Z-Index Hierarchy

| Layer | Z-Index | Component |
|---|---|---|
| Confirm-removal dialog | `z-[200]` | following-screen.tsx |
| Install nudge sheet | `z-[150]` | install-nudge.tsx |
| Install nudge backdrop | `z-[149]` | install-nudge.tsx |
| Lightbox overlay | `z-[140]` | album-detail.tsx |
| Lightbox backdrop | `z-[135]` | album-detail.tsx |
| Mobile bottom tab bar | `z-[130]` | navigation.tsx |
| Wantlist crossover prompt | `z-[125]` | wantlist-crossover-prompt.tsx |
| Album detail mobile sheet | `z-[120]` | album-detail.tsx |
| Offline banner | `z-[115]` | offline-banner.tsx |
| Album detail mobile backdrop | `z-[110]` | album-detail.tsx |
| Desktop side panel | `z-[110]` | App.tsx |
| New session / Add user FABs (mobile) | `z-[105]` | stacks.tsx, following-screen.tsx |
| Scroll fade overlay | `z-100` | App.tsx |
| Delete confirmation modals | `z-[90]` | stacks.tsx |
| "Pick one" reveal card | `z-[93]` | pick-one-overlay.tsx |
| "Pick one" backdrop | `z-[92]` | pick-one-overlay.tsx |
| Purge tracker sheet | `z-[89]` | purge-tracker.tsx |
| Purge tracker backdrop | `z-[88]` | purge-tracker.tsx |
| Session picker mobile sheet | `z-[85]` | stack-picker-sheet.tsx |
| Session picker mobile backdrop | `z-[80]` | stack-picker-sheet.tsx |
| Add Albums drawer sheet | `z-[85]` | add-albums-drawer.tsx |
| Add Albums drawer backdrop | `z-[80]` | add-albums-drawer.tsx |
| Look It Up search panel (full-screen, no backdrop) | `z-[85]` | discogs-search-sheet.tsx |
| Bug report sheet | `z-[85]` | bug-report-sheet.tsx |
| Bug report backdrop | `z-[80]` | bug-report-sheet.tsx |
| Filter drawer panel | `z-[70]` | filter-drawer.tsx |
| Filter drawer backdrop | `z-[60]` | filter-drawer.tsx |
| Desktop session picker | `z-50` | stack-picker-sheet.tsx |
| Mobile feed header (transparent at feed top) | `zIndex: 50` | App.tsx |
| Alphabet index sidebar | `z-40` | album-grid.tsx, album-list.tsx |
| Wantlist card close button | `z-[2]` | wantlist.tsx |
| Wantlist card hover overlay | `z-[1]` | wantlist.tsx |

Note: `z-10` is used for sticky elements (sticky tab bar in album-detail.tsx, sticky search in add-albums-drawer.tsx). These are local stacking context only and not part of the global layering system.

Do not introduce new z-index values outside this hierarchy without checking for conflicts.

---

## Current State of the Codebase

### What's Real
- Full component and screen architecture
- Design system (colors, typography, motion tokens)
- All UI interactions and animations
- Navigation structure
- Two view modes (Grid incl. compact grid3, List) — legacy crate/artwork stored prefs are mapped back to grid at preferences hydration
- Discogs OAuth 1.0a authentication (real login via Discogs)
- Live Discogs API sync via server-side Convex proxy actions (collection, folders, wantlist, collection value)
- All Holy Grails-exclusive data persisted in Convex (purge tags, sessions, last played, want priorities, following, preferences)
- Album instance editing (media/sleeve condition, notes, folder, star rating) from album detail panel
- Folder management (create, rename, delete) from Settings > Tools > Folders via `proxyCreateFolder`, `proxyRenameFolder`, `proxyDeleteFolder`
- Discogs profile personalization in Settings — enriched profile data (location, bio, buyer/seller ratings, member since, contributions) fetched from `/users/{username}`, editable profile text and location via `proxyUpdateProfile`
- Wantlist write operations (`proxyAddToWantlist`, `proxyRemoveFromWantlist`) via Convex proxy actions
- `selectedWantItem: WantItem | null` in AppState — parallel to `selectedAlbum`, used for wantlist item detail panel (`WantItemDetailPanel` in `album-detail.tsx`). Now includes enriched tabs (Tracklist, Credits, Pressing Notes, Identifiers) loaded via `proxyFetchRelease`, matching the `AlbumDetailPanel` tab pattern.
- `selectedFeedAlbum: FeedAlbum | null` — context slot for following/feed album detail. Mirrors the `selectedWantItem` pattern exactly. Set by Following and Feed screen album art taps. Cleared on panel close.
- `removeFromCollection(albumId)` in context — calls `proxyRemoveFromCollection` (action #9), removes album from local state and Convex collection cache on success. No full re-sync.
- `collectionCrossoverQueue` in context — queue of wantlist items found in collection after sync, drives the crossover prompt (`wantlist-crossover-prompt.tsx`)
- Header action callbacks — registered by screens on mount, cleaned up on unmount. All use the double-arrow pattern to prevent React functional update auto-invocation:
  - `setOnNewStack(() => () => fn())` ← correct
  - `setOnNewStack(() => fn())` ← WRONG — triggers fn() immediately on mount
  - `onNewStack` / `setOnNewStack` — registered by the Sessions screen
  - `onAddFollowedUser` / `setOnAddFollowedUser` — registered by FollowingScreen
  - `followedUserProfile` / `setFollowedUserProfile` — `{ username, avatarUrl? } | null`, set by FollowingScreen when a user profile is open, null when closed
  - `onBackFromProfile` / `setOnBackFromProfile` — registered by FollowingScreen
  - `onUnfollowUser` / `setOnUnfollowUser` — registered by FollowedUserProfile
- Following screen activity feed hearts call Convex proxy actions with per-item Disc3 loading spinners
- Following feed cache in Convex — powers Feed Recent Activity without requiring Following screen hydration
- Wantlist cached in Convex — synced alongside collection with 24h TTL
- `master_id` matching for "In Collection" and heart state across different pressings
- **Standalone Discogs search ("Look It Up")** — `discogs-search-sheet.tsx`: master-first database search (all formats) with a drill-in pressing picker (server-side country/year/format filtering incl. a Format facet chip, pinned most-collected row), barcode-like queries routed to release search, handoff to `ReleaseDetailPanel`. Makes the app usable without touching Discogs — add to collection/wantlist and check market value from search results.
- **Record-store price lookup** — shared Value section in `ReleaseDetailPanel` and `AlbumDetailPanel` (lowest ask + N-for-sale + VG/VG+/NM suggestions), shown entirely in-app (no outbound listings link — see the outbound-links rule).
- **In-app bug reports** — Settings → Feedback files a bug or idea with automatic diagnostics, an optional screenshot, and a status the reporter can read back; an admin-gated inbox (`HG_ADMIN_USERNAMES`) triages them from inside the app. See Bug Reports.
- Deployed to Vercel — live at holygrails.app (custom domain) and holy-grails.vercel.app

### What's Explicitly Out of Scope
- Listening logs — do not add any listen tracking beyond last-played timestamp
- Seller/marketplace tools
- Full Discogs database *browsing* — artist pages, label discographies (link out instead). Database **search-to-add and price lookup** ("Look It Up") ARE in scope.
- Native iOS app — this codebase is a PWA only. A native SwiftUI app is a planned post-1.0 *separate* project (see `docs/native-app-plan.md` and `docs/native-swift-features.md`); never add native-app scaffolding, Capacitor, or wrapper tooling here.

### Known Issues (do not fix without explicit instruction)
- `FollowingSkeletonRows` and `FollowedUserRow` components deleted in Phase 7 QA — replaced by partial hydration pattern introduced in Phase 7 Prompt 2a. Do not recreate these components.

### Backlog
- **"3 releases joined Late Night Jazz"** — the deferred Session Builder follow-up. It is the only part of that feature that needs stored state (a membership snapshot to diff), and therefore the only part that wants a background job. Full shape in `docs/feature-opportunities.md` #13. The hard constraint: a snapshot may answer "what's new" and nothing else — `stackMembership` stays derived, or the drift the design avoids comes back.
- ~~One-off gray text colors~~ — DONE (v0.6.x color audit): crate-browser's `#9BA4B2`/`#3D5C77` migrated to `var(--c-text-faint)`/`var(--c-text-secondary)`; purge-tracker's `#6B7B8E` corrected to the token value `#5E6E80`.
- Empty state standardization — icon sizes, vertical padding, and icon-to-text spacing are inconsistent across screens. Needs a dedicated design pass with visual references before normalizing.
- Purge Cut confirmation icon — Minus vs X icon flagged during Phase 7 QA for visual review.
- Startup Convex auth errors — `Unauthorized` errors appear briefly in terminal/logs during app startup (race condition between proxy actions firing and sessionToken populating). Cosmetic, non-blocking. Queued for investigation.
- Light-mode contrast, deferred findings (v0.6.1 audit) — three sub-threshold values left as-is because each is a locked-token change, not an implementation bug. The two defects found in the same pass (the wantlist priority bolt and destructive-as-ink) are already fixed. Remaining, with the light-mode ratios measured in their real usage contexts:
  - `--c-text-faint` `#767A82` — 4.09:1 on `--c-bg`, 3.80:1 on `--c-chip-bg`, under the 4.5:1 floor. It is the token for 10–11px eyebrows, dates, the identity ticker labels, and recharts axis ticks, so the failure lands where small text already strains. `#6B6F77` clears it (4.79 / 4.45) at a perceptually tiny Oklab step.
  - `--c-text-tertiary` `#70747C` — 4.46:1 on `--c-bg`, 4.14:1 on chip. Fails by a rounding error.
  - `CHART_BLUE` `#0DB1F2` (`reports-screen.tsx`) — 2.45:1 on `#FFFFFF`, under the 3:1 floor for meaningful graphics. Affects the By Decade and Collection Growth bars, the Top Labels dots, and the By Folder bars. Dark mode is fine, so this needs a light-mode variant (~`#0086BE`), not a replacement.

---

## Rules for Claude Code Sessions

1. **Read before writing.** Understand the existing pattern before adding new code. Check how similar components are built and match them.

2. **Do not reintroduce a component library.** The shadcn/ui directory (`src/app/components/ui/`) and its dependencies were removed after the Figma Make prototype phase ended — all UI is hand-built with Tailwind + inline styles. New components follow the existing bespoke patterns.

3. **Never change the design system.** Colors, typography, motion tokens, and spacing are locked. If something looks wrong, fix the implementation, not the tokens.

4. **Preserve iOS Safari compatibility.** Test truncation with inline styles. Test inputs at 16px. Test safe area insets.

5. **Match the voice.** UX copy follows the Holy Grails tone — collector vernacular, short, direct, no corporate filler. When adding any user-facing text check the UX writing guidelines.

6. **One concern per session.** Don't combine a bug fix with a feature addition. Keep sessions focused.

7. **Commit after each working phase.** Don't let sessions pile up uncommitted.

8. **Flag before refactoring.** The following files are load-bearing. Do not refactor their APIs without explicit instruction:
   - `app-context.tsx` — global state and Convex wiring
   - `convex/discogs.ts` — all Discogs API proxy actions
   - `convex/discogsHelpers.ts` — credential lookup for proxy actions
   - `discogs-api.ts` — shared types, constants, and caches
   - `convex/schema.ts` — database schema
   - `auth-callback.tsx` — OAuth callback handler
   - `App.tsx` — root layout and auth state routing
   - `loading-screen.tsx` — full-screen loading state

9. **Convex deploy required.** Any changes to files in the `convex/` directory must be followed by `npx convex deploy` before pushing to Vercel. The dev and prod Convex deployments are separate — `npx convex dev` only updates dev. Failing to deploy will cause production errors.

---

## Key UX Writing Rules

- Short. Shorter than you think.
- **"Release" is the noun for an item in the collection** — never "record". The app syncs every format Discogs supports (see Formats), and a CD, cassette, or file is not a record. This is a counted noun: "3 releases match", "459 releases deep", "12 releases tagged Cut". Where a possessive would read stiffly ("stats about your releases"), say **"your collection"** instead. Do not reintroduce "record" as the generic; it was swept out of the UI wholesale.
- **Format-neutral always** — see the subsection immediately below. This is the rule most easily broken by accident.
- No exclamation points, no emoji, no "Hey there!" energy
- Avoid: "seamlessly," "powerful," "experience," "journey"
- Toast notifications: under 4 words where possible, no punctuation except a period for emphasis. Album-specific toasts include the full title with no truncation: `"[Title]" kept.` / `"[Title]" added to Wantlist.` / `"[Title]" removed.` Error toasts, session toasts, sync toasts, and settings toasts remain generic.
- The plural of vinyl is vinyl
- "Wantlist" is one word — never "want list" or "want-list"
- The two play filters are worded **"No Plays Recorded" / "Plays Recorded"** everywhere — chips (`filter-drawer`, `crate-browser`), the feed Listening card's rows, and the Insights stat. They drifted once ("Play Not Recorded" on the chips), which meant arriving at the collection from the feed showed a chip worded differently from the row that got you there. Any new surface for these filters reuses these strings verbatim.

### Format-Neutral Copy (the CD test)

Holy Grails syncs every format Discogs supports (see Formats), and a collection is mixed by default. Before shipping any user-facing string, apply **the CD test: would this sentence be wrong for someone whose copy is a CD, a cassette, or a file?** If yes, rewrite it. Vinyl-only phrasing doesn't read as flavor to someone holding a CD — it reads as the app not knowing what they own.

Applies to every user-facing surface: headings, labels, buttons, toasts, empty states, error copy, and `aria-label`s. Does **not** apply to code identifiers, comments, route keys, or file names.

| Don't | Do |
|---|---|
| spin, spins, give it a spin | play, plays, listen |
| record(s) as the generic noun | release(s) — or "your collection" where a possessive reads stiffly |
| wax, platter, slab | release |
| drop the needle, on the turntable | play it, put it on |
| album(s) as the generic noun | release(s) |
| crate as a synonym for the collection | collection |

Three narrow exceptions:
1. Surfaces that are **genuinely** vinyl-scoped — Format Spotlight's own category headers (45 RPMs, Test Pressings, Mono Pressings, Colored Vinyl) are vinyl by definition and stay.
2. **Discogs' own field names** — **Pressing Notes** is theirs, not ours.
3. Vinyl-born vocabulary that reads format-neutral in ordinary use: "in rotation", "grail", "VG+", and "pressing" for a specific edition.

When no neutral word carries the same flavor, take the plain one — "play" over "spin", every time. "Crate" survives as a route key and the Collection screen's identity, never as a synonym for the collection in copy.

---

## Discogs API Reference

**Base URL**: `https://api.discogs.com`

**Auth method**: OAuth 1.0a. Access token and token secret are stored in the Convex `users` table and used server-side only by `convex/discogs.ts` proxy actions. HMAC-SHA1 signing. The client never sees raw OAuth credentials — it passes `sessionToken` to Convex actions which resolve credentials internally.

**Rate limit**: 60 requests/minute authenticated.

**Key endpoints**:
- Collection: `GET /users/{username}/collection/folders/0/releases`
- Folders: `GET /users/{username}/collection/folders`
- Create folder: `POST /users/{username}/collection/folders`
- Rename folder: `POST /users/{username}/collection/folders/{folder_id}`
- Delete folder: `DELETE /users/{username}/collection/folders/{folder_id}`
- Want list: `GET /users/{username}/wants`
- Add to wantlist: `PUT /users/{username}/wants/{release_id}`
- Remove from wantlist: `DELETE /users/{username}/wants/{release_id}`
- Collection value: `GET /users/{username}/collection/value`
- Price suggestions: `GET /marketplace/price_suggestions/{release_id}`
- Market stats: `GET /marketplace/stats/{release_id}?curr_abbr=USD` — used by the daily `marketValueDrip` (Spec 6A.1) to read a release's lowest ask (`lowest_price.value`; the stats endpoint returns it as `{ value, currency }`, unlike the plain number on `/releases/{id}`). `curr_abbr` forces one currency for the shared value regardless of which user's token fetched it (Discogs otherwise localizes to the token owner)
- User profile: `GET /users/{username}`
- Update profile: `POST /users/{username}` (supports `profile`, `location`, `name`, `home_page`, `curr_abbr`)

All Discogs API calls go through `convex/discogs.ts` proxy actions. No direct Discogs fetch calls in client code.

**sessionStorage** is permitted for one key only: `hg_oauth_token_secret` in `oauth-helpers.ts`, storing the temporary OAuth token secret during the Discogs redirect. It is cleared immediately after the callback completes in `auth-callback.tsx`, and cleared defensively (removeItem only) in `app-context.tsx` on sign-out and data-wipe. No other sessionStorage usage is permitted anywhere in the codebase (lint-enforced).

**localStorage** is permitted in three places:
- `hg_session_token` in `app-context.tsx` — persists the ACTIVE account's session token for cold load restore (see Session token persistence above)
- `hg_accounts` in `app-context.tsx` — the multi-account list (see Multiple Accounts below); an array of `{ username, avatarUrl, sessionToken, addedAt }`, all read/written through app-context helpers wrapping the pure logic in `utils/accounts.ts`
- `hg_install_nudge_dismissed` in `install-nudge.tsx` — device-level UI flag that permanently hides the PWA install nudge banner after the user dismisses it. Not a user preference — not synced to Convex.

No other localStorage usage is permitted anywhere in the codebase.

**Folder sync architecture (per-folder fetching)**

`fetchCollectionInternal` (in `convex/discogs.ts`, used by `syncSelf`) fetches collection releases per-folder rather than from the aggregate folder 0 ("All") endpoint. This is required because the Discogs API does not return `folder_id` on release objects from the folder 0 endpoint. The flow: fetch the folder list via `/collection/folders`, then for each folder (skipping folder 0), fetch `/collection/folders/{id}/releases` and inject `folder_id` from the folder being fetched onto each release before mapping. Folder 1 ("Uncategorized") is included — it is a real folder releases can live in. Rate limiting is adaptive (driven by `X-Discogs-Ratelimit-Remaining` inside `discogsFetch`), and 429 responses retry up to 2 times honoring the `Retry-After` header.

**skipPrivateFields**

`fetchCollectionInternal` takes a `skipPrivateFields` flag. When set, it skips `fetchCustomFields` and `fetchFolderMap` calls which always return 403 for other users' collections, and falls back to fetching from folder 0 since folder names are irrelevant for followed users. `syncFollowedUser` always sets this.

**Multi-folder dedup behavior**

`fetchCollectionInternal` deduplicates collection items by `release_id` after fetching all folders. If a release exists in more than one folder, only the first instance is kept. The second instance's folder assignment, condition notes, and grading are silently discarded. This is a known architectural assumption: one copy per release. Do not attempt to fix or change this behavior without explicit instruction from Shawn.

**Folder management**

The `folders` state in `app-context.tsx` is `{ id: number; name: string; count: number }[]` — not just names. `proxyFetchCollection` returns folder objects with IDs and counts. On cache hydration (cold load from Convex), folders are derived from album data as a fallback until `proxyFetchFolders` runs.

Four context functions manage folders: `createFolder(name)`, `renameFolder(folderId, name)`, `deleteFolder(folderId)`, `fetchFolders()`. All wait for API success before updating local state (no optimistic updates). `renameFolder` also updates the `folder` name on all albums that reference the renamed folder's ID.

Folder 0 ("All") is a virtual folder — always present, never editable. Folder 1 ("Uncategorized") is a real Discogs folder but cannot be renamed or deleted. The Folders management screen (`folders-screen.tsx`) enforces these constraints with locked visual treatment (Lock icon, no edit/delete controls).

The `folderOptions` derivation in `album-detail.tsx` uses the centralized `folders` state directly — it no longer reverse-engineers folder IDs from album records.

Consumers that iterate `folders` (filter-drawer, add-albums-drawer) access `folder.name` for display and `folder.id` for keys. The `activeFolder` state remains a string (folder name) for filtering.
