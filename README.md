# Holy Grails

**A Discogs companion app.**

Holy Grails is a vinyl collection management PWA synced with Discogs. It adds the tools Discogs doesn't have, such as a purge workflow for when you need to lighten the shelf load, listening session building, and a following feature to track the activity of other users you admire.

Not a Discogs clone. Not a general-purpose music tracker. Just the decisions you need to make as you micro-manage your grails.

---

## What it does

**Purge workflow** — Flip through your collection and tag each record Keep, Cut, or Maybe.

**Listening sessions** — Build ordered playlists from your collection. Name them, reorder them, track what you last played.

**Browse your grails** — Grid, Artwork, List, and Crate Flip (a swipeable card stack for browsing like you're digging).

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

Runs at `http://localhost:5173`.

You'll need a Discogs account to use the app. Auth is OAuth 1.0a via Discogs, no separate account system.

---

## Status

v0.2.5 — Active development. Github: @shawnhiatt — Discogs: catxdad19

Live at [holygrails.app](https://holygrails.app).
