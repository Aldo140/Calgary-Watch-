# Calgary Watch: Urban Intelligence Platform

![Status](https://img.shields.io/badge/status-active-brightgreen) ![Framework](https://img.shields.io/badge/framework-React%2019-blue) ![Database](https://img.shields.io/badge/database-Firestore-orange) ![License](https://img.shields.io/badge/license-Apache%202.0-lightgrey) ![Non-Profit](https://img.shields.io/badge/org-Non--Profit-teal)

Calgary Watch is an advanced, **real-time urban intelligence platform** designed to provide Calgarians with immediate, localized situational awareness. By fusing crowdsourced community reports with verified public safety datasets, the platform delivers a cinematic, highly-responsive map ecosystem where data is democratized and instantly accessible. 

Built with enterprise-grade performance, native mobile aesthetics, and a deep commitment to data transparency, Calgary Watch stands apart as a community-driven safety initiative.

**[Visit Live Site](https://aldo140.github.io/Calgary-Watch-/)** | **[GitHub Repository](https://github.com/Aldo140/Calgary-Watch-)**

![Mobile First Experience](https://img.shields.io/badge/experience-mobile--first-purple)

> *Calgary Watch operates as a non-profit initiative. We are actively seeking dedicated volunteers and strategic business partnerships to further our mission of community safety and accessibility.*

---

## 🎯 Vision

Our mission is to establish the definitive real-time urban intelligence layer for the city of Calgary. 

While traditional news cycles operate on a delayed timeline—often reporting on incidents long after they've resolved—Calgary Watch closes the "40-minute gap," empowering citizens with instant updates on road closures, severe weather, social disturbances, and critical infrastructure issues.

---

## 🚀 Key Features

### 1. Immersive Native-App Web Experience
- **Cinematic Urban Intelligence Grid UI**: High-end visual aesthetic utilizing dark-mode-first glassmorphism, depth-blurring, and fluid layout scaling. 
- **Interactive Device Simulation**: The landing page features a fully dynamic, scroll-animated iPhone mockup that identically replicates the live behavior of the platform using `framer-motion`, complete with native mobile bottom-sheet UI paradigms and live "Sync" indicators.
- **Micro-Animations & Gestures**: Sweeping highlights, dynamic pulse dots, and robust viewport-triggered animations.

### 2. Live Sync Mapping Engine
- **Zero-Latency Incident Feed**: Fully decoupled `onSnapshot` Firestore architecture streams events instantly bounding boxes and clustering algorithms to prevent visual clutter.
- **Dynamic Action Overlays**: Custom "Floating Action Buttons" mimicking high-end native experiences, allowing rapid access to layers, user location, and reporting interfaces.

### 3. Neighbourhood Intelligence Layers
- Granular, community-level data analytics presenting safety scores, historical incident density heatmaps (powered by Leaflet.heat), and comparative metrics. 

### 4. Seamless Mobile Delivery
- Painstakingly engineered for perfect cross-device scaling. Mobile views adapt organically with intelligent DOM reordering to ensure text readability alongside unobstructed visual simulations. Forms submit in under <100ms via optimized transition buffers.

---

## 🛡 Trust & Data Transparency

Calgary Watch distinguishes rigorously between data sources:

1. **Community Reports (Real-Time)**: Submitted by users dynamically. Unverified statuses are explicitly labeled, and system logic measures "Trust Indicators" based on report confluence.
2. **Official Data**: Aggregated non-real-time datasets from the Calgary Police Service, used for historical context and intelligence baselines rather than immediate response.

### Disclaimers & Privacy
- **Not an Emergency Service**: Calgary Watch does not replace 911.
- **Anonymity First**: Identifiable user metrics are strictly localized. Anonymous reporting is enabled by default. 
- **Non-Governmental**: Unaffiliated with the City of Calgary or CPS.

---

## 🗺 Roadmap

- **Phase 1 (Active)**: Core Calgary deployment, real-time sync mapping, UI/UX conceptual modeling, and public launch.
- **Phase 2 (Upcoming)**: Geofenced push-notifications, "Credibility Engine" for users, robust Admin Moderation dashboard mobile optimization.
- **Phase 3**: Integration with open transit architectures (CTrain delays) and live meteorological sensors.

---

## 💻 Tech Stack & Architecture

Calgary Watch is engineered using modern, high-performance web topologies:

| Element | Technology |
|---|---|
| **Frontend Foundation** | React 19 + TypeScript (strict) |
| **Tooling & Build** | Vite 6 + Tailwind CSS v4 |
| **Database Ecosystem** | Google Cloud Firestore (NoSQL Live Sync) |
| **Autonomic Motion** | Framer Motion & GSAP |
| **Geospatial Engine** | Leaflet + Custom CARTO tileset mappings |
| **Auth & Security** | Firebase Authentication (OAuth) + strict Firestore Validation Rules |
| **Icons & Assets** | Lucide React |

### Performance Optimization Directives
- **React 18 Transitions**: `startTransition` handles deep network writes off-critical-thread.
- **Image Transcoding**: All assets, including Hero panoramas natively encoded to WebP format, delivering an 82% footprint reduction.
- **Component Splitting**: Heavy tree branches (Admin Portals, Geographic processing logic) utilize `React.lazy` and Suspense boundaries. 

---

## 🤝 Get Involved

Calgary Watch is entirely volunteer-driven. We are expanding and heavily recruiting contributors across:
- **Design & Engineering**: React developers, UX researchers, mapping experts.
- **Operations & Marketing**: Social strategy, moderation management, local advocacy.

To pitch partnerships or join the development team, contact us via the platform or at `jorti104@mtroyal.ca`.

---

## 🔧 Developer Access

```bash
# Clone and Install
git clone https://github.com/Aldo140/Calgary-Watch-.git
cd Calgary-Watch--main
npm install

# Required Environment bindings (.env)
VITE_FIREBASE_API_KEY=x
VITE_FIREBASE_AUTH_DOMAIN=x
VITE_FIREBASE_PROJECT_ID=x
VITE_FIREBASE_STORAGE_BUCKET=x
VITE_FIREBASE_MESSAGING_SENDER_ID=x
VITE_FIREBASE_APP_ID=x

# Run Development Server
npm run dev
```

---

*Built for Calgary — non-profit, community-powered, and real-time.*
