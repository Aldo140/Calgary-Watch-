# Calgary Watch

![Status](https://img.shields.io/badge/status-active-brightgreen) ![Framework](https://img.shields.io/badge/framework-React%2019-blue) ![Database](https://img.shields.io/badge/database-Firestore-orange) ![License](https://img.shields.io/badge/license-Apache%202.0-lightgrey) ![Non-Profit](https://img.shields.io/badge/org-Non--Profit-teal)

Real-time incident map for Calgary, Alberta.

Calgarians report incidents the moment they happen. Road closures, fires, flooding, and safety alerts appear on the map in under 30 seconds. Check what's happening near you before heading out.

**[Live Site](https://calgarywatch.ca)** | **[GitHub](https://github.com/Aldo140/Calgary-Watch-)**

> Calgary Watch is a non-profit initiative. We are actively seeking volunteers and partners to grow the platform.

---

## What It Does

Calgary Watch is a live, community-powered safety map. Drop a pin, pick a category, attach an optional photo, and submit in under 30 seconds. The report goes live instantly. No app install needed — it works on any phone from the browser.

The platform runs four data layers:

- **Community Reports** — submitted by users in real time, labeled with trust indicators that improve as more users confirm them
- **511 Alberta Traffic** — live traffic incidents from 511.alberta.ca, refreshed every 30 minutes
- **Environment Canada Alerts** — official weather warnings and special statements for the Calgary region
- **Calgary Infrastructure & Police** — service requests and crime statistics from Calgary Open Data (SODA API)

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
- Single flag = immediate takedown (incident disappears from map and feed)
- Admin review queue shows all flagged content with Restore / Delete Permanently actions
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

### Ingest Pipeline

`scripts/ingest/index.ts` runs via GitHub Actions (`ingest-live-data.yml`) on a 30-minute cron schedule.

**Data sources:**

| Source | Type |
|--------|------|
| Environment Canada Alerts | Weather warnings |
| Environment Canada Enhanced | Detailed weather |
| 511 Alberta | Traffic incidents |
| Alberta Emergency Alert | Provincial emergencies |
| Reddit r/Calgary | Community signals |
| News RSS (CBC, CTV, Global) | Local news |
| Calgary Police Service | Crime statistics |
| Calgary Open Data Infrastructure | 311 service requests / water main breaks |

**Firestore optimisation:** A single `loadAndPrune()` read handles both deduplication and expiry cleanup in one collection scan per run. Expired incidents are hard-deleted (not soft-deleted) so the collection stays small. At 30-minute intervals = 48 runs/day, leaving ~1,000 reads per run within the 50,000/day free tier.

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
