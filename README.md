# Calgary Watch

![Status](https://img.shields.io/badge/status-active-brightgreen) ![Framework](https://img.shields.io/badge/framework-React%2019-blue) ![Database](https://img.shields.io/badge/database-Firestore-orange) ![License](https://img.shields.io/badge/license-Apache%202.0-lightgrey) ![Non-Profit](https://img.shields.io/badge/org-Non--Profit-teal)

Real-time incident map for Calgary, Edmonton, and surrounding Alberta communities.

Residents report incidents the moment they happen. Road closures, fires, flooding, and safety alerts appear on the map in under 30 seconds. Check what's happening near you before heading out.

**[Live Site](https://calgarywatch.ca)** | **[GitHub](https://github.com/Aldo140/Calgary-Watch-)**

> Calgary Watch is a non-profit initiative. We are actively seeking volunteers and partners to grow the platform.

---

## What It Does

Calgary Watch is a live, community-powered safety map. Drop a pin, pick a category, attach an optional photo, and submit in under 30 seconds. The report goes live instantly. No app install needed — it works on any phone from the browser.

The platform runs four data layers:

- **Community Reports** — submitted by users in real time, labeled with trust indicators that improve as more users confirm them
- **511 Alberta Traffic** — live traffic incidents from 511.alberta.ca, refreshed every 30 minutes
- **Environment Canada Alerts** — official weather warnings and special statements covering 15 zones across Alberta
- **Calgary & Edmonton Open Data** — service requests, bylaw, 311, and crime statistics via SODA API
- **Statistics Canada Baselines** — annual crime data for RCMP-policed towns (Airdrie, Cochrane, Okotoks, Canmore, High River, Strathmore, Chestermere)
- **ENMAX Power Outages** — live Calgary electricity outages, shown as an opt-in official layer separate from community reports

---

## Features

### Landing Page
- Transparent nav that blends into the hero, hides on scroll-down, reappears on scroll-up
- Full-screen hero with WebP Calgary background image (`fetchPriority="high"` for fast LCP)
- Feature grid, How It Works section, volunteer/city-expansion CTAs

### Map
- Real-time Firestore `onSnapshot` stream — zero reload needed
- Custom incident markers with category icons, pulse rings, and severity-based sizing
- Leaflet heatmap layer for historical density
- Crime choropleth overlay from Calgary Police Service open data
- Mobile bottom sheet with search, category chips, sort/filter, and rich incident cards
- Crosshair pin mode for precise location reporting
- Floating action buttons: SOS, report, layer toggle, GPS

### Reporting
- 5 incident categories: Crime, Traffic, Infrastructure, Weather, Emergency
- Optional photo attachment (JPEG/PNG/WebP, max 5 MB) — stored in Firebase Storage
- Anonymous posting option
- GPS or manual pin placement
- Profanity filter on title and description

### Moderation
- Any signed-in user can flag an incident as inappropriate
- **Two distinct users** must flag a report before it is hidden — one account
  cannot take the feed down on its own. The flagger list is stored on the
  document and checked by the Firestore rules, so the threshold is enforced
  server-side rather than by client convention
- Visibility is a single field (`public` / `flagged` / `deleted`) and the public
  map queries `where('visibility','==','public')`. Firestore rules filter
  queries rather than rows, so this constraint — not client-side filtering — is
  what makes a takedown a genuine data-access takedown
- Reporter email is never stored on the world-readable incident document; it
  lives in `incident_reporters/{incidentId}`, readable only by its author and
  admins, and written in the same batch as the incident
- Admin review queue shows all flagged content with Restore / Delete Permanently actions
- Deleting an incident also removes its Storage image; a failed cleanup is
  recorded in `admin_audit_logs` rather than silently orphaning the file
- System-ingested incidents (weather, traffic, police) cannot be flagged

### Admin Panel
- Live incident stream with in-place editing and moderation controls
- Flagged Content section for reviewing community-reported inappropriate posts
- Analytics: incidents over time, category breakdown, community safety scores, top reporters
- Traffic analytics: page views, referrer breakdown, UTM campaign tracking
- User directory with role management
- Community Stats editor for neighbourhood safety scores

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| Maps | Leaflet + react-leaflet |
| Database | Firebase Firestore |
| Storage | Firebase Storage |
| Auth | Firebase Auth (Google Sign-In) |
| Hosting | Firebase Hosting (calgarywatch.ca) |
| CI/CD | GitHub Actions |
| Charts | Recharts |
| Animation | Motion (Framer Motion) |

---

## Infrastructure

### Firebase Hosting

The site is deployed to Firebase Hosting at **calgarywatch.ca** via the `.github/workflows/deploy-firebase.yml` GitHub Actions workflow on every push to `main`.

Security headers are configured in `firebase.json` and served by Firebase Hosting on every response:
- `Content-Security-Policy` — restricts scripts, styles, fonts, images, and connections
- `Strict-Transport-Security` — HSTS with 2-year max-age and preload
- `Cross-Origin-Opener-Policy: same-origin-allow-popups` — allows Google Sign-In popup
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`

### Power Outage Ingest (ENMAX)

`scripts/ingest/power-outages.ts` runs via GitHub Actions
(`ingest-power-outages.yml`) on a ~5-minute cron. It fetches the ENMAX
current-outage JSON feed once, validates that the payload is an array,
normalizes each record, and publishes a single snapshot document to
`live_data/power_outages`.

Every visitor reads that one document, so ENMAX receives exactly one request per
run regardless of traffic, and the browser never talks to ENMAX directly. No
Cloud Functions and no Blaze plan required.

**Failure policy:** if ENMAX is unreachable or changes shape, the run exits
*without writing*. The previous snapshot stays in place and the map keeps
showing the last known outages, flagged as stale by the client after 20 minutes.
A bad fetch is never published as "zero outages".

ENMAX records are **not** written to the `incidents` collection — this is an
external live layer, not a community report. The ENMAX URL appears in exactly
one file, `scripts/ingest/enmax/config.ts`, and is never bundled into the
frontend. The feed is undocumented and is **not** a formally supported public
API — it is polled read-only, at most every five minutes, with a descriptive
User-Agent and a 9-second timeout.

```bash
FIREBASE_SERVICE_ACCOUNT='{...}' npm run ingest:outages   # publish a snapshot
npm test                                                  # normalization + classification tests
```

**Firestore cost:** 1 document write per run (~288/day, free tier 20k) and 1
document read per visitor who switches the layer on.

### Moderation Suppression

Two classes of record survive an ordinary delete:

- **Ingested records** are upserted by `dedup_key`, which doubles as the
  document ID. Deleting one just means the next 30-minute run recreates it.
- **Browser-derived records** (Edmonton open data, weather, ENMAX) are rebuilt
  from their upstream APIs on every page load and are never persisted at all,
  so there is no document to delete.

`suppressed_incidents/{id}` is the durable answer. Both the ingest pipeline and
the client consult it before publishing a record. It is world-readable because
the browser has to read it, which is exactly why it holds **nothing but IDs and
timestamps** — the reason, the moderator, and any notes go to
`admin_audit_logs`, which only admins can read. Entries carry an `expiresAt` so
the list cannot grow without bound.

### Visibility Migration

`scripts/backfill-visibility.ts` must run **once, before** the rules and client
that filter on `visibility` are deployed.

Community reports have never carried `flagged` or `deleted` — the create
allowlist did not permit them — and Firestore equality queries do not match
documents missing the field. Deploying the new query against un-backfilled data
returns zero incidents and the public map goes blank.

```bash
FIREBASE_SERVICE_ACCOUNT='{...}' npm run backfill:visibility            # dry run
FIREBASE_SERVICE_ACCOUNT='{...}' npm run backfill:visibility -- --commit
```

Deploy order:

1. `npm run backfill:visibility -- --commit`
2. `firebase deploy --only firestore:indexes` — wait for the indexes to finish building
3. `firebase deploy --only firestore:rules`
4. Deploy the client

### Domain Reputation and ISP-Level Blocking

`calgarywatch.ca` was registered on **2026-04-04**. An earlier theory held that
it had been a parked advertising domain under prior ownership and had inherited
that reputation; the WhoIs record disproves it, and a BrightCloud lookup shows
the real cause:

```
Reputation:  Suspicious (40/100)
Category:    Uncategorized
Influences:  No infections past 12 months   (+)
             Unknown popularity             (-)
             0 months old (not established) (-)
```

Nothing has ever been found wrong with the site. The score is the standard
penalty for a domain that is new and **uncategorised** — vendors treat unknown
as suspicious — and ISP-level filters such as Plume Online Protection act on
that score, resolving the hostname to their block address **18.204.152.241**
instead of Firebase.

The remedy is therefore to get the domain *categorised*, not to clear a bad
history.

This is a **DNS-level decision made before the site is ever fetched**, so no
amount of application code changes it. How to tell it apart from an outage:

```bash
# Authoritative DNS — should be Firebase Hosting
curl -s "https://dns.google/resolve?name=calgarywatch.ca&type=A"   # 199.36.158.100

# What the local network resolves — if this differs, DNS is being intercepted
getent hosts calgarywatch.ca
```

A blocked host resolves to 18.204.152.241, fails the TLS handshake with
`wrong version number` (the interceptor is not serving real TLS), and answers
plain HTTP with `204`. A working host returns `200` with a valid certificate.

**Status:** the apex has cleared on the networks tested. `www` has been observed
still intercepted, which is the stronger argument for the change below.

**Reduce the blast radius — point `www` at Firebase.** Today `www` is a separate
host on GitHub Pages that only redirects to the apex. That is a second hostname
with its own reputation and its own certificate, and it is the one still getting
blocked. Serving both names from Firebase leaves one host to establish
reputation, one certificate, and a real edge redirect:

1. Firebase Console → Hosting → Add custom domain → `www.calgarywatch.ca`,
   choosing the redirect-to-apex option.
2. Replace the `www` A records at the registrar with the values Firebase gives.
3. Delete `.github/workflows/deploy-pages.yml` and `www-redirect/`.

**Reputation review** (needed once per vendor; none are fixable in code):

Each hostname carries its own reputation record, so `calgarywatch.ca` and
`www.calgarywatch.ca` must be submitted separately — and BrightCloud keeps
*category* and *reputation* in separate queues, so that is four submissions.
The comment field caps at 150 characters.

| Vendor | Where |
|---|---|
| BrightCloud / Webroot (category first) | https://www.brightcloud.com/tools/url-ip-lookup.php |
| Google Safe Browsing | https://search.google.com/search-console (Security Issues) |
| Norton Safe Web | https://safeweb.norton.com/report-a-site |
| Trellix (McAfee) | https://sitelookup.trellix.com |
| Fortinet | https://www.fortiguard.com/webfilter |

`public/.well-known/security.txt` publishes a machine-readable owner and contact,
which several of these scanners weigh as a legitimacy signal.

**Users blocked right now** can reach the identical application at
`https://calgary-map-e70bb.web.app` — same Firebase project, same data.

### Ingest Pipeline

`scripts/ingest/index.ts` runs via GitHub Actions (`ingest-live-data.yml`) on a 30-minute cron schedule.

**Data sources:**

| Source | Type |
|--------|------|
| Environment Canada OGC API | Active, timestamped weather warnings intersecting Calgary |
| 511 Alberta (optional key) | Traffic incidents when `ALBERTA_511_API_KEY` is configured |
| Alberta Emergency Alert | Provincial emergencies |
| News RSS (CBC, CTV, Global) | Local news |
| Calgary Police Service newsroom | Timestamped police releases with named Calgary locations |
| Calgary 311 Open Data | Recent property-crime-related resident service requests |
| Edmonton Open Data (bylaw, 311, traffic) | Live Edmonton incidents |
| Edmonton Police Service (EPS) Dashboard | Edmonton neighbourhood crime stats |
| Statistics Canada WDS (Table 35-10-0183-01) | Annual crime baselines for RCMP towns |

**Firestore optimisation:** Stable source IDs allow direct create-or-refresh writes without a collection-wide deduplication read. Expiry cleanup uses a targeted query and hard-deletes stale system incidents.

---

## Local Development

### Prerequisites
- Node.js 20+
- A Firebase project with Firestore, Storage, and Google Auth enabled

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/Aldo140/Calgary-Watch-.git
   cd Calgary-Watch-
   npm install
   ```

2. Create a `.env` file at the project root:
   ```env
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

### Running the Ingest Pipeline Locally

```bash
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
export VITE_FIREBASE_PROJECT_ID=your-project-id
npx tsx scripts/ingest/index.ts
```

---

## Deployment

### GitHub Actions Secrets Required

| Secret | Description |
|--------|-------------|
| `FIREBASE_SERVICE_ACCOUNT` | Full JSON of a Firebase service-account key |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_API_KEY` | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |

### Workflows

| Workflow | Trigger | Action |
|----------|---------|--------|
| `deploy-firebase.yml` | Push to `main` | Build + deploy to Firebase Hosting |
| `ingest-live-data.yml` | Every 30 min + manual | Run ingest pipeline |

### Firebase Setup (first-time)

1. Enable Firestore, Storage, and Google Sign-In in Firebase Console
2. Deploy security rules: `npx firebase-tools deploy --only firestore:rules,storage:rules`
3. Add `https://calgarywatch.ca` to Authorized Domains in Firebase Console → Authentication → Settings
4. Add `https://calgarywatch.ca/__/auth/handler` to OAuth Redirect URIs in Google Cloud Console

---

## Contributing

Calgary Watch is a non-profit community project. Contributions welcome.

To volunteer, visit [calgarywatch.ca](https://calgarywatch.ca) and submit the volunteer form, or open an issue on GitHub.

---

## License

Apache 2.0 — see `LICENSE`.
