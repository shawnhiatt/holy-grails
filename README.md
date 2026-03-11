# Holy Grails

**A Discogs companion app.**

Holy Grails is a vinyl collection management PWA synced with Discogs. It adds the tools Discogs doesn't have: a listening session curation feature, a following feature to track the activity of other collectors you admire, and a purge workflow feature for when you need to lighten your collection, .

Not a Discogs clone. Not a general-purpose music tracker. Just a decision-making toolset for managing your grails.

---

## What it does

**Purge workflow** — Flip through your collection and tag each record Keep, Cut, or Maybe.

**Listening sessions** — Build ordered playlists from your collection. Name them, reorder them, track what you've played.

**Browse your collection** — Grid, Artwork, List, and Crate Flip (a swipeable card stack for browsing like you're digging).

**Following** — Follow other Discogs users and see their recent additions in your feed.

**Discogs sync** — Real OAuth 1.0a auth. Pulls your full collection, folders, wantlist, and collection value. Wantlist priorities are Holy Grails-exclusive so your Discogs data stays clean.

---

## Stack

React + TypeScript, Vite, Tailwind CSS, Framer Motion, Convex (backend/database), Discogs OAuth 1.0a. Deployed to Vercel.

---

## Running it locally

```bash
npm install
npm run dev
```

Runs at `http://localhost:1234`.

You'll need a Discogs account to use the app. Auth is OAuth 1.0a via Discogs — no separate account system.

---

## Status

v0.5.0 — Active development. GitHub: @shawnhiatt — Discogs: catxdad19

Live at [holygrails.app](https://holygrails.app).