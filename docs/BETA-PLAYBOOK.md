# Holy Grails — Beta Playbook

**Written:** July 2026, at v0.6.0 ("beta-ready" state) · **Status:** not yet in motion — this is the runbook for when Shawn decides to invite people, not a commitment to a date.

The app is in a beta-ready *state*: auth is hardened, the codebase typechecks under strict TypeScript, CI guards every merge, and the docs match reality. Being ready and going are different decisions. Keep building from here; when it's time, this document is the step-by-step.

---

## Stage 1 — Closed beta (~20 invited users)

Small circle: friends, friends-of-friends, trusted collectors from the community. People who will forgive rough edges and actually tell you what broke. Keep this stage minimal — the goal is to learn whether onboarding survives contact with other people's Discogs accounts, not to grow.

### Gate checklist — complete ALL of these before the first invite

Work through these in order. Each is one focused session or less.

1. **Deploy and verify the session fix.** The v0.6.0 `getUserCredentials` fix (Discogs actions failing for fresh logins) must be live: run `npx convex deploy`, then **sign out and sign back in on a second device** and confirm sync, search, and add-to-wantlist all work on the fresh session. This is the single most important pre-beta test — every tester is a fresh login.

2. **Error monitoring.** *(Wired in v0.6.x — Sentry SDK ships lazy-loaded behind `VITE_SENTRY_DSN`. Remaining: create the free Sentry account/project, set the env var in Vercel, and add the email-on-new-issue alert rule.)* You will not be watching over testers' shoulders. Minimum: add Sentry's browser SDK (free tier is plenty) so crashes and unhandled rejections reach you with stack traces. Set one alert rule: email on any new issue. Alternative if you'd rather not add a dependency: calendar a twice-weekly Convex dashboard log review — but Sentry is strongly recommended; "it felt broken once" is not a bug report you can fix.

3. **Privacy note.** *(Done in v0.6.x — splash line + expandable note, and the "Your data" section in Settings.)* Testers hand over OAuth access to their Discogs accounts. Before asking, say plainly what the app does with it. Two placements, both in the app's voice (short, direct, no legalese):
   - One line on the login screen under the CTA, linking to the fuller note.
   - A "Your data" section in Settings covering: what's stored (Discogs OAuth tokens server-side, a cached copy of your collection/wantlist, Holy Grails data like purge tags and sessions), what's never done (no writes to Discogs you didn't tap, no sharing — listening activity is opt-in via the existing prompt), and how to leave (Delete All My Data in Settings removes everything, and you can revoke the app at discogs.com/settings/applications).
   A draft is in the appendix. A formal privacy policy page can wait for Stage 2.

4. **Fresh-account walkthroughs.** Run first-run end to end on: iPhone Safari (browser + installed PWA), Android Chrome, desktop. Use at least one Discogs account that is not yours, including the edge cases a stranger will hit — empty collection, no vinyl (CDs only), huge collection (1,000+). The zero-vinyl case has a fix; verify it held.

5. **Pick ONE feedback channel.** A group chat (iMessage/WhatsApp/Discord) is right for 20 people. Pin a two-line note: "Something broke? Screenshot + what you tapped. Ideas welcome but bugs first."

6. **Tag the release.** Bump the version, update the changelog, tag it in git. Every bug report should be answerable with "which version?" — the Settings screen shows it (reads package.json automatically as of 0.6.0).

7. **Write the invite.** Template in the appendix. Be the transparency you planned: designed by you, built with AI assistance, what data it touches, how to bail out. Invitees are logging into a stranger's app with their Discogs account — the invite is where trust starts.

### During the beta

- **Cadence:** twice a week, 30 minutes — Sentry issues, Convex logs, Convex dashboard usage (bandwidth/storage), feedback channel triage. Sort everything into *fix now* (broken flows, data issues) or *backlog* (polish, ideas). Resist mid-beta feature work; testers on a moving target produce noise.
- **Releases:** patch versions, one concern per session, changelog entries — same discipline as now. `npx convex deploy` before Vercel whenever `convex/` changed. There is no downtime story needed; Vercel deploys are atomic and Convex migrations here are additive.
- **Costs:** ~20 users is comfortably inside Convex and Vercel free tiers. Discogs rate limits are per user token — testers don't share your budget.
- **If something breaks badly:** Vercel dashboard → previous deployment → "Promote to production" is the instant rollback. Convex functions roll back by re-deploying the previous git state. A single misbehaving account can be cleaned with `users.deleteAllUserData` semantics via the user themselves (Settings) — never edit their rows by hand.

### Stage 1 exit criteria

Move on only when all four hold:

- Two consecutive weeks with no new must-fix bug.
- Onboarding survived at least 5 fresh Discogs accounts you don't control, including one empty/zero-vinyl collection.
- At least half the invitees came back and synced more than once — the retention signal that the app is useful to people who aren't you.
- One real user has exercised Delete All My Data and confirmed a clean exit.

---

## Stage 2 — Open beta (waitlist / gradual, ~50–500 users)

The difference is not scale, it's *strangers*: no personal relationship, no benefit of the doubt, and a real (if small) abuse surface. This stage starts when Stage 1's exit criteria hold and you still want more.

### What changes — checklist before opening up

1. **A real privacy policy page** (`/privacy`) and short terms of use. Template-level is fine to start; it should cover the same ground as the Settings note plus data retention and contact. (Not legal advice — if this ever takes money or grows past hobby scale, pay a professional for an hour.)
2. **Landing page.** Strangers need a "what is this" before an OAuth prompt: one screen, screenshots, what it does, what it doesn't (not a Discogs replacement, no marketplace), who built it and how. The transparency-about-AI note lives here too.
3. **Convex plan review.** Check dashboard usage from Stage 1 and project ×25. Collections are the big rows; the free tier's storage/bandwidth ceilings are the ones to watch. Moving to the paid tier is cheap; hitting a hard ceiling mid-signup wave is not.
4. **Uptime + alerting.** A free pinger (UptimeRobot or similar) on holygrails.app, plus Sentry alert rules tuned so a bad deploy pages you within minutes, not at the weekend review.
5. **Feedback scales past a group chat.** Either make the repo public and use GitHub Issues, or a simple form. Public repo is worth considering anyway — it's a portfolio piece, and "vibe coded but typechecked, CI'd, and audited" is a good story.
6. **Gradual admission.** A waitlist (even a Google Form) beats an open door: you control the wave size, and each wave is a fresh cohort to watch onboarding metrics on.
7. **Analytics, only if wanted.** If you want numbers beyond Convex's, use something privacy-friendly (Plausible-class, no cookies). The privacy note must mention whatever you add.
8. **Social features sanity pass.** Following + shareActivity are the only cross-user surfaces. shareActivity is opt-in with a good consent prompt — keep that bar for anything new. Add a way to report/unfollow problem accounts if profiles ever grow user-generated text (today they can't — usernames and collections come from Discogs).

### During open beta

Same cadence as Stage 1, plus: watch the onboarding funnel per wave (invited → logged in → first sync completed → returned in week 2), and keep release notes public — strangers extend far less patience to silent changes.

### Stage 2 exit → 1.0

Per VERSIONING.md, 1.0 is "genuinely complete for daily use." Concretely:

- Onboarding is boring — no surprises across a full wave of strangers.
- No known must-fix bugs; backlog is polish and features, not repairs.
- Privacy/terms in place; costs known and sustainable at current growth.
- You'd hand the URL to a record-store stranger without a caveat sentence.

---

## Stage 3 — 1.0 and after (sketch)

- **Announcement:** vinyl communities (r/vinyl, Discogs forums, vinyl Discords) have strict self-promo norms — lead with the story (designer builds the Discogs companion they wanted), not the pitch, and follow each community's rules.
- **PWA advantage:** no app-store review; ship whenever. Keep the changelog honest and the update toast (autoUpdate SW) as the only interruption.
- **Roadmap discipline:** the out-of-scope list in CLAUDE.md (no marketplace tools, no full Discogs browsing, no native app) is what keeps the product sharp. 1.0 is the wrong time to forget it.

---

## Appendix

### Draft privacy note (Settings → "Your data")

> **Your data.** Holy Grails connects to your Discogs account with OAuth — we store the access token and a cached copy of your collection and wantlist so the app loads fast. Purge tags, sessions, plays, and follows exist only in Holy Grails. We never change anything on Discogs unless you tap the button that does it. Listening activity is private unless you opt in to sharing. Want out? Settings → Delete All My Data removes everything on our side, and you can revoke access anytime at discogs.com → Settings → Applications.

### Invite message template (Stage 1)

> Hey — I built a vinyl collection app that syncs with Discogs. It does the stuff Discogs doesn't: purge your collection (Keep/Cut/Maybe), build listening sessions, follow other collectors, look up pressings and prices in a record store. I designed it; AI helped me write the code; I've been daily-driving it for months.
>
> It logs in with your Discogs account (OAuth — I never see your password) and keeps a synced copy of your collection. There's a Delete All My Data button if you want out, no hard feelings.
>
> It's a web app — open [holygrails.app](https://holygrails.app) on your phone, log in with Discogs, and add it to your home screen. Something breaks or feels wrong? Tell me in the chat, screenshots welcome.

### Incident quick reference

| Situation | Do this |
|---|---|
| Bad deploy, app broken | Vercel dashboard → Deployments → previous → Promote to Production |
| Convex function erroring | Convex dashboard → Logs; redeploy previous git state (`npx convex deploy`) |
| Discogs API down / OAuth failing | Nothing to fix on our side; post a note in the feedback channel; cached boot keeps the app readable offline |
| Tester wants out | Point them to Settings → Delete All My Data, and discogs.com → Settings → Applications to revoke |
| Suspected token leak | User signs out everywhere + revokes on Discogs; sessions expire at 90 days regardless; rotate Convex `DISCOGS_CONSUMER_SECRET` if the app credentials themselves leaked |
