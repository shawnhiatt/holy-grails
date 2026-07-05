# Holy Grails

**A Discogs companion app.**

Holy Grails is a vinyl collection management PWA synced with Discogs. It adds the tools Discogs doesn't have: stack curation, a following feature to track the activity of other collectors you admire, and a purge workflow for when you need to lighten your collection.

Not a Discogs clone. Not a general-purpose music tracker. Just a decision-making toolset for managing your grails.

---

## What it does

**Purge workflow** — Flip through your collection and tag each record Keep, Cut, or Maybe.

**Stacks** — Build ordered playlists from your collection. Name them, reorder them, track what you've played.

**Browse your collection** — Grid and List views with search, filtering, and an alphabet index.

**Look It Up** — Search the Discogs database, scan a barcode, check the going rate, and add straight to your collection or wantlist.

**Following** — Follow other Discogs users, browse their collections, and see their recent additions in your feed.

**Discogs sync** — Real OAuth 1.0a auth. Pulls your full collection, folders, wantlist, and collection value. Purge tags, stacks, and wantlist priorities are Holy Grails-exclusive so your Discogs data stays clean.

---

## Stack

React + TypeScript, Vite, Tailwind CSS, Motion (Framer Motion), Convex (backend/database), Discogs OAuth 1.0a. Deployed to Vercel.

---

## Running it locally

```bash
npm install
npm run dev
```

Runs at `http://localhost:1234`.

You'll need a Discogs account to use the app. Auth is OAuth 1.0a via Discogs — no separate account system. Copy `.env.example` to `.env.local` and set `VITE_CONVEX_URL`.

```bash
npm run typecheck   # strict TypeScript check
npm run build       # production build
```

---

## Status

v0.6.0 — Beta-ready, active development. GitHub: @shawnhiatt — Discogs: catxdad19

Live at [holygrails.app](https://holygrails.app). See `docs/BETA-PLAYBOOK.md` for the road to inviting testers and `CHANGELOG.md` for history.
