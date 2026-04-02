# Calgary Watch

Calgary Watch is a real-time urban awareness platform for Calgary. It combines community-submitted reports with live Firestore updates, map visualization, and an admin operations portal.

## Production Improvements Completed

- Added a protected admin portal at `/admin`.
- Restricted admin access to approved Google account: `jorti104@mtroyal.ca`.
- Added live admin overview KPIs (incidents, unresolved count, 24h activity, stats averages, user visibility).
- Added inline edit + delete controls for:
  - `incidents`
  - `community_stats`
- Fixed production auth wiring by removing duplicate Firebase provider mounting.
- Hardened Firebase initialization to use environment variables with fallback config.
- Updated Firestore rules for admin email and `gas` incident category support.
test

## Stack

- React + TypeScript + Vite
- Firebase Auth (Google sign-in)
- Cloud Firestore (real-time data + admin writes)
- Leaflet + Leaflet heatmap

## Live Data Extraction: How It Works

### Current live extraction path in this project

1. Community users submit incident reports from the map UI.
2. Reports are written to Firestore `incidents` collection.
3. The map view listens with `onSnapshot(...)` to Firestore.
4. New/updated documents stream to connected clients in near real-time.
5. Admin portal listens to `incidents`, `community_stats`, and `users` with live subscriptions.
6. Admin edits are written back with `updateDoc(...)`, and all clients receive the update immediately via snapshots.

This is the live extraction layer currently implemented and running in code: Firestore real-time listeners are the extraction/stream transport for operational data.

### Recommended official-source ingestion pattern (production)

For CPS/311/Environment feeds, use a backend job (Cloud Functions or Cloud Run cron):

1. Poll official APIs on schedule.
2. Normalize incoming schema to Calgary Watch format.
3. Upsert records into Firestore (`incidents` and/or `community_stats`).
4. Tag source metadata (`source_name`, `source_url`, verification tier).
5. Let existing UI listeners stream those records instantly to users/admin.

## Admin Portal

- Route: `/admin`
- Auth: Google sign-in via Firebase Auth
- Access policy:
  - Must be authenticated.
  - Must match approved admin email `jorti104@mtroyal.ca`.
- Capabilities:
  - View operational KPIs.
  - View user directory snapshot.
  - Edit incident core fields and verification state.
  - Edit community stats rows.
  - Delete incidents/stats rows.

## Firestore Collections

### `incidents`

Typical fields:

- `title`, `description`, `category`, `neighborhood`
- `lat`, `lng`, `timestamp`
- `name`, `email`, `authorUid`
- `verified_status`, `report_count`
- optional `source_name`, `source_url`, `source_logo`, `image_url`

### `community_stats`

- `community`, `month`
- `violent_crime`, `property_crime`, `disorder_calls`
- `safety_score`

### `users`

- `uid`, `displayName`, `email`, `photoURL`
- `role` (`user` or `admin`)

## Security Rules

`firestore.rules` now includes:

- Admin allowance for `jorti104@mtroyal.ca` (email-verified).
- Incident category validation including `gas`.
- Admin-only write access to `community_stats` and destructive operations.

Deploy rules after changes:

```bash
firebase deploy --only firestore:rules
```

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and fill Firebase values.

3. Start dev server:

```bash
npm run dev
```

4. Validate types:

```bash
npm run lint
```

5. Build production bundle:

```bash
npm run build
```

## Deploying Frontend

Example on Firebase Hosting:

```bash
npm run build
firebase deploy --only hosting
```

Or deploy `dist/` to Netlify/Vercel/Cloudflare Pages.

## Repository

Target remote:

`https://github.com/Aldo140/Calgary-Watch-.git`

If this local folder is not yet a git repo, initialize and push:

```bash
git init
git add .
git commit -m "Production hardening, admin portal, and docs update"
git branch -M main
git remote add origin https://github.com/Aldo140/Calgary-Watch-.git
git push -u origin main
```
