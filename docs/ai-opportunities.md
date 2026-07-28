# Holy Grails — AI Opportunities, July 2026

A brainstorming dock, not a plan. Nothing here is committed.

The app already talks to the Claude API in exactly one place: `vision.identifyCover`, the Look It Up scanner's Cover mode (`convex/vision.ts`, `claude-sonnet-5`). That shipped, works, and cost almost nothing — which is why it's worth asking what else the integration is good for *before* someone builds the wrong thing with it.

Companion to `docs/feature-opportunities.md`, which covers the non-AI backlog. Effort ballparks match it (S = one session, M = a few, L = a spec + multiple sessions).

---

## The lens

The moat is **decision-making and curation** — the purge, sessions, and the collection seen from angles Discogs can't show you. AI earns a place here when it serves *judgment about a collection you already own*. It does not earn a place by generating content, and it does not earn a place by being impressive.

Three filters every idea below is held against:

1. **Does it make the collection more legible, or does it just add words?**
2. **Would a plain derivation over cached data do the same job?** If yes, do that instead — it's free, instant, offline, and can't be wrong in a way that erodes trust.
3. **Does it survive the app having no `ANTHROPIC_API_KEY`?** Every AI surface must degrade to a working app, the way Cover mode reports itself unconfigured.

---

## Two findings that should shape everything

### You do not need to "index" the collection

The instinct is a vector database, embeddings, a sync job. None of it is necessary at this size.

A compact projection of one release — artist, title, year, genre, rating, play count, purge tag — is roughly **40 tokens**. So:

| Collection size | Tokens, whole collection inline |
|---|---|
| 459 (today) | ~18k |
| 1,000 | ~40k |
| 3,000 | ~120k |

**The entire collection fits in a single prompt**, with room left over. That means most of what's imaginable here is "one API call with the collection inline," not infrastructure. No vector store, no embeddings, no RAG, no index to keep fresh, nothing new to go stale.

Where it stops being true: repeated calls over a large collection get expensive, and beyond ~5,000 releases the projection needs narrowing (filter server-side first, then send). Prompt caching covers the repeated-call case if one ever arrives. Neither is a problem today, and neither justifies building an index in advance.

### The one architectural rule

**AI runs on a deliberate user action — never on a timer, never on a sync, never in a per-record loop.**

This is the guardrail against both scope creep and an unpredictable bill, and it's the shape `vision.identifyCover` already has: a rare, intentional shutter press. A feature that runs per release, or on every sync, multiplies by collection size and by user count simultaneously. If an idea can't be expressed as "the user asked for this, once," it's the wrong idea.

Everything else follows the existing precedent: server-only (`"use node"`, never in the browser bundle), structured outputs against a strict schema, and a pure tested `parse*` validator in a sibling module (`coverIdentity.ts` / `marketValue.ts` pattern). **Never render unvalidated model prose.**

---

## Tier 1 — fits the moat

### A1. Describe a session in plain language — M

You type *"rainy Sunday jazz, nothing I've played this month"* and get a session.

The critical detail: **Claude returns a `StackRule`, not a list of releases.** Structured output against the schema `convex/stackRules.ts` already defines, then the existing deterministic evaluator does everything else. That single choice buys the whole feature its safety:

- A rule is **inspectable and editable** — it opens in the builder you already have, with its conditions rendered as chips.
- A rule **cannot hallucinate a release you don't own**. It's a filter over your collection; the worst case is that it matches nothing.
- A rule **re-evaluates forever**. No stored AI output, no staleness, no drift — the Session Builder's founding constraint (membership is derived, never stored) is preserved exactly.
- Failure is benign: an unparseable rule falls back to the manual builder.

The prompt doesn't even need the collection — only the field vocabulary plus the genres, labels, and decades that collection actually contains, which `utils/stack-rule-labels.ts` already derives for the builder's dropdowns. Small prompt, one call per session created.

Slots in as a third entry point in `stack-builder.tsx`, beside presets and "Build your own." Copy stays a verb, never "smart" (it would collide with VinylBox's Smart Folders, and this is saved logic, not intelligence).

**This is the strongest idea in the space.** If only one AI feature is ever built, it's this one.

### A2. Natural-language collection search — M

*"The german pressing with the orange sleeve I picked up two years ago."*

Same architecture as A1: language → structured filter → the existing `filterAndSortAlbums`. Genuinely serves "look at your collection from a different angle," and it's the one that makes a 500-release collection feel searchable rather than scrollable.

**Should share one implementation with A1** — both are "turn a sentence into a filter over my collection." Two parallel prompt-to-filter systems would be the actual scope creep.

---

## Tier 2 — plausible, with caveats

### A3. Curated picks — M

The literal "smart playlist": Claude picks 20 releases from the collection for a theme.

Weaker than A1, and worth understanding why. This produces a **list**, and a list means stored membership — the exact thing the Session Builder was designed to avoid. It can also pick a release you sold last month, where a rule structurally cannot.

If built: materialize the result immediately as an ordinary **hand-filled session** (the `stacks.freeze` path already exists). Then it's a normal session from birth, with no new object type, no background job, and no drift. The AI is a one-time authoring assist, not an ongoing source of truth.

### A4. Artist context — S (non-AI) / M (with AI)

Discogs `/artists/{id}` returns a bio, members, and aliases, and **`artistIds` is already stored on every album** from the free-data pass — currently unsurfaced. The hook exists.

But the interesting half needs no AI at all: *"you own 6 of theirs, earliest 1971, most-played is X."* That's a derivation over cached data and it's the part that's actually about **your** collection. Ship that first. Reach for summarization only if the raw Discogs bios prove too long and uneven to show — they often are, which is the honest case for AI here.

Two constraints: one request per artist against a 60/min budget means it needs caching and drip discipline (the `market_values` pattern), and it must not drift into browsable artist pages — **explicitly out of scope** per CLAUDE.md.

### A5. Collection portrait — M

"What your collection says about you," as a few paragraphs. The purest expression of the different-angles goal, and the riskiest thing on this list: it's generated prose, which means one-shot novelty that ages badly and a tone that can slide into flattery.

If built: constrain it to **observations tied to named releases** so every claim is checkable against the collection, and make it **seasonal** — fold it into the year-end recap (`feature-opportunities.md` #7) rather than giving it a permanent screen. A permanent screen turns a nice moment into a thing that's always slightly wrong.

---

## Gamification — wanted, needs taste guardrails

Explicitly on the table (Shawn, July 2026). Mostly **not an AI feature** — it's derivation over the play log and purge data, so it belongs in `feature-opportunities.md`; it's noted here because it came up in the same conversation.

Already shipped, unbranded: the current/longest **listening streak** (Insights, and now the feed's Listening card). That's the seed.

The guardrail worth writing down before more of it gets built: **reward curation, not compliance.** The good version marks progress through work the user already wanted to do — the collection evaluated, the wantlist hunted, the shelf actually played. The bad version invents busywork to be rewarded for, or punishes absence. Some specific tests:

- A mechanic that makes a week away from the app feel like a **loss** is the wrong mechanic. Streaks are near this line — the feed card deliberately falls back to "days since last play" rather than showing a broken 0-day streak, and that's the right instinct to keep.
- Milestones should describe something **true about the collection** ("500 releases", "every release evaluated"), not a score the app made up.
- No points, no XP, no levels, no leaderboards against other users — the Following screen is a relationship, not a ranking.

Candidates worth planning: purge completion milestones, "every release in this folder has a verdict," first play logged on a release owned for 10 years, a year-end "you played N of your M releases" line. All pure derivation, all zero API calls.

---

## Rejected, with reasons

Recorded so they stay rejected rather than being re-proposed each time.

- **Free-form chat over your collection.** A chat UI is a product, not a feature — unbounded cost, unbounded expectations, and no surface in this app that wants a conversation. A1/A2 deliver the useful 90% of it with a deterministic result.
- **AI purge verdicts.** A model telling you to sell your records is a trust problem, and the data-derived version (`feature-opportunities.md` #1, "smart purge candidates" — never played, no market ask, duplicate master, unrated) is better, free, instant, and explainable. Signals, not opinions.
- **AI price estimation.** The app has real marketplace data from Discogs. A model guessing at prices is strictly worse and actively dangerous to trust. The Value section's accuracy-or-nothing rule (no price shown for unofficial releases) is the standard.
- **AI-written UI copy** — generated section headings, greetings, flavor text. The app deliberately retired scripted time-of-day greetings in favor of real data doing the personality work. Regenerating them with a model is the same mistake with a bigger bill.
- **Cover recognition beyond identification** — grading a sleeve from a photo, detecting ring wear. Conditions are a claim about a physical object that the owner is responsible for; a model's guess in that field would end up in someone's sale listing.

---

## If one thing gets built

**A1.** It's the only idea here that turns the model's output into something the app can own permanently — a rule, evaluated deterministically forever, that the user can read and edit. Everything else either produces prose that ages or a list that drifts.
