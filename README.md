# Calgary Watch

![Status](https://img.shields.io/badge/status-active-brightgreen) ![Framework](https://img.shields.io/badge/framework-React%2019-blue) ![Database](https://img.shields.io/badge/database-Firestore-orange) ![License](https://img.shields.io/badge/license-Apache%202.0-lightgrey) ![Non-Profit](https://img.shields.io/badge/org-Non--Profit-teal)

Real-time community safety for Calgary. Calgarians report incidents the moment they happen and they appear on the map in under 30 seconds. Road closures, fires, flooding, safety alerts, all in one place.

**[Live Site](https://aldo140.github.io/Calgary-Watch-/)** | **[GitHub](https://github.com/Aldo140/Calgary-Watch-)**

> Calgary Watch is a non-profit initiative. We are actively seeking volunteers and partners to grow the platform.

---

## What It Does

Calgary Watch is a live, community-powered incident map. Users drop a pin, pick a category, and submit in under 30 seconds. The report goes live instantly with no moderation delay. A native-app-quality web experience means it works on any phone without installing anything.

The platform distinguishes between three data layers:

- **Community Reports** - submitted by users in real time, labeled with trust indicators
- **Official Data** - aggregated from Calgary Police Service open datasets for historical context
- **System Signals** - inferred from clustered activity to surface patterns even at low usage

---

## Features

### Landing Page
- Transparent nav that blends into the hero and hides on scroll-down, reappears on scroll-up
- Full-screen hero with live Calgary background image, phone mockup simulation, and live incident feed
- Bento feature grid with animated visuals: radar rings (Live Map), zone heatmap (Neighbourhood Intelligence), verification pipeline (Verified Reports), redacted report doc (Anonymous posting)
- Horizontal snap-scroll How It Works on mobile
- Compact mobile layouts throughout, no duplicate sections

### Map
- Real-time Firestore `onSnapshot` stream, zero reload needed
- Custom incident markers with category icons, pulse rings, and severity-based sizing
- Leaflet heatmap layer for historical density
- Bottom-sheet incident detail panel (mobile native feel)
- Crosshair pin mode for precise location reporting
- Floating action buttons: SOS, report, layer toggle, GPS

### Reporting
- 7 incident categories
- Anonymous option by default
- GPS or manual pin placement
- Optimistic UI, form submits in under 100ms perceived

### Admin
- Incident management dashboard
- Analytics: incidents over time, category breakdown, community safety breakdown
- User management and moderation tools

---

## Roadmap

| Phase | Title | Status |
|---|---|---|
| 01 | Calgary Launch | Active |
| 02 | Native App | Upcoming |
| 03 | More Cities | Planned |
| 04 | Enterprise | Planned |

Phase 2 targets iOS and Android apps with push notifications and an enhanced credibility system. Phase 3 expands to other Canadian cities on demand.

---

## Trust and Safety

Calgary Watch is not an emergency service. Always call 911.

- Anonymous reporting is on by default
- User emails are never exposed publicly
- Community reports are labeled as unverified until confirmed by multiple sources
- Official data is sourced from Calgary Police Service open datasets and is not real-time

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript |
| Build | Vite 6 + Tailwind CSS v4 |
| Database | Google Cloud Firestore |
| Animation | Framer Motion + GSAP |
| Maps | Leaflet + CARTO tiles + Leaflet.heat |
| Auth | Firebase Authentication |
| Icons | Lucide React |

---

## Get Involved

Calgary Watch runs entirely on volunteers.

- **Engineering** - React, TypeScript, Firebase, mapping
- **Design** - UX, mobile patterns, data visualization
- **Operations** - community outreach, moderation, partnerships

Contact: `jorti104@mtroyal.ca`

---

## Local Setup

```bash
git clone https://github.com/Aldo140/Calgary-Watch-.git
cd Calgary-Watch--main
npm install

# Create .env with your Firebase config
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

npm run dev
```

See [IMAGE_SETUP.md](IMAGE_SETUP.md) for adding local image assets.

---

*Built for Calgary. Non-profit, community-powered, real-time.*
