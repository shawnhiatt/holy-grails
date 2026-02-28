# Holy Grails

**Your Discogs collection. Actually useful.**

Holy Grails is a vinyl collection management PWA built for collectors who've outgrown folder browsing. It syncs with Discogs and adds the tools Discogs doesn't have — a purge workflow for when your Kallax hits capacity, listening session building, and a feed that makes your collection feel alive.

Not a Discogs clone. Not a general-purpose music tracker. Just the decisions you need to make when you have 430 records and room for 432.

---

## What it does

**Purge workflow** — Flip through your collection and tag each record Keep, Cut, or Maybe. Built for the moment you're standing in front of a full Kallax and need to make hard calls. Works in crate-flip mode so it feels like actually going through your records.

**Listening sessions** — Build ordered playlists from your collection. Name them, reorder them, track what you last played.

**Four browse modes** — Grid, Artwork, List, and Crate Flip (a swipeable card stack for browsing like you're digging).

**Discogs sync** — Real OAuth 1.0a auth. Pulls your full collection, folders, wantlist, and collection value. Wantlist priorities are Holy Grails-exclusive so your Discogs data stays clean.

**Dark mode.** Of course.

---

## Stack

React + TypeScript, Vite, Tailwind CSS, Framer Motion, Convex (backend/database), Discogs OAuth 1.0a. Deployed to Vercel.

---

## Running it locally

```bash
npm install
npm run dev
```

Runs at `http://localhost:5173`.

You'll need a Discogs account to use the app — auth is OAuth 1.0a via Discogs, no separate account system.

---

## Status

v0.2.5 — Active development. Primary users: Shawn (catxdad19) and Tyler (QA).

Live at [holy-grails.vercel.app](https://holy-grails.vercel.app).
