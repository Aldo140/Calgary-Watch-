# Calgary Watch — Real-Time Urban Awareness

Calgary Watch is a production-grade community safety platform that combines live community reports with verified official data from the Calgary Police Service (CPS) and the City of Calgary.

## 🚀 Overview

The platform provides Calgarians with a real-time view of their city, enabling them to stay informed about incidents, road closures, and safety concerns as they happen.

### Key Features

- **Live Community Map:** Interactive Leaflet-based map with real-time incident pins.
- **Heatmap Visualization:** Toggleable heatmap layer to identify incident clusters and high-activity zones.
- **Area Intelligence:** Deep-dive panels for every Calgary neighborhood, featuring safety scores, crime trends, and historical context.
- **Verified vs. Unverified:** Clear visual distinction between community reports and official data sources.
- **Responsive Design:** Purpose-built experiences for both Desktop (sidebar-based) and Mobile (bottom-sheet based).
- **Keyboard Shortcuts:** Power-user navigation for quick filtering and searching.

## 📊 Data Sources & Trust

Calgary Watch aggregates data from multiple high-integrity sources:

1.  **Calgary Police Service (CPS):** Official crime reports and major incident data via the [CPS Open Data Portal](https://www.calgary.ca/cps/statistics/calgary-police-service-open-data.html).
2.  **City of Calgary 311:** Infrastructure issues, water main breaks, and road maintenance reports.
3.  **Environment Canada:** Real-time weather alerts and severe storm warnings.
4.  **ENMAX Power:** Live power outage data and restoration estimates.
5.  **Community Reports:** Crowdsourced data from verified local residents, cross-referenced for accuracy.

### Verification Layers
- **Level 1 (Unverified):** Single community report.
- **Level 2 (Multiple Reports):** 3+ independent reports in the same vicinity.
- **Level 3 (Verified):** Matches official data patterns or confirmed by city agencies.

## 🛠 Tech Stack

- **Frontend:** React 18, Vite, TypeScript
- **Styling:** Tailwind CSS (Modern Dark Theme)
- **Animations:** Framer Motion (motion/react), GSAP
- **Maps:** Leaflet, Leaflet.heat
- **Charts:** Recharts
- **Icons:** Lucide React
- **Routing:** React Router DOM
- **Forms:** React Hook Form, Zod
- **Backend:** Firebase (Firestore, Authentication)

## 🔥 Backend Architecture (Firebase)

The application leverages Firebase for its real-time capabilities and secure data management:

-   **Firestore:** A NoSQL document database used to store incidents, community notes, and neighborhood intelligence.
    -   `incidents` collection: Stores live reports with geo-coordinates, categories, and verification statuses.
    -   `neighborhoods` collection: Stores historical crime stats and safety scores.
-   **Authentication:** Firebase Auth handles secure user sign-in (Google OAuth), ensuring only authenticated users can submit reports.
-   **Security Rules:** Granular Firestore rules ensure that users can only write their own reports and cannot modify official data.

## 📁 Project Structure

```text
/src
  /components        # Reusable UI components
    /ui              # Base UI components (Button, Card, etc.)
    Sidebar.tsx      # Main desktop sidebar with live feed
    Map.tsx          # Leaflet map implementation with heatmap
    AreaIntelligencePanel.tsx # Neighborhood deep-dive
    IncidentDetailPanel.tsx   # Premium incident view with source links
    IncidentForm.tsx # Responsive reporting form
    MobileBottomSheet.tsx     # Mobile-specific drawer
    SkeletonLoader.tsx        # Loading states
  /pages             # Main application routes
    LandingPage.tsx  # Conversion-focused homepage
    MapPage.tsx      # The core map application
    AboutPage.tsx    # Mission and trust explanation
  /lib               # Utility functions (cn, etc.)
  /services          # API and Firebase services (mockData, etc.)
  /types             # TypeScript definitions and constants
  App.tsx            # Main router and layout orchestrator
```

## 📖 Developer Guide

### Getting Started

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Environment Setup:**
   Create a `.env` file with your Firebase configuration:
   ```env
   VITE_FIREBASE_API_KEY=your_key
   VITE_FIREBASE_AUTH_DOMAIN=your_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

3. **Run Development Server:**
   ```bash
   npm run dev
   ```

### Adding New Features

- **New Categories:** Update `IncidentCategory` in `src/types.ts` and add corresponding icons/colors in `CATEGORY_ICONS` and `CATEGORY_COLORS`.
- **New Map Layers:** Add the layer logic to `src/components/Map.tsx` and update `LayerToggle.tsx`.
- **New Pages:** Create the component in `src/pages/` and add the route to `src/App.tsx`.

## 🛡 Security & Trust

- **Firestore Rules:** All data is protected by granular security rules.
- **Verification Logic:** Incidents are tagged with `verified_status` based on report density and official data matching.
- **Privacy:** User PII is never exposed. Reports are tagged with pseudo-users or anonymous identifiers.

## 🌆 Future Expansion

The platform is designed to be city-agnostic. To expand to a new city:
1. Update the neighborhood data in `src/types.ts`.
2. Adjust the map's initial center and bounds.
3. Integrate the new city's open data portal (e.g., Edmonton Open Data).

---
*Built for the Calgary Community.*
