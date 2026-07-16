# Map Section — Complete Functional Audit

Snapshot of every function the `/map` route provides, by auth state and screen size.
Written before the UX redesign so nothing gets dropped. Source: `src/pages/MapPage.tsx`
plus `Map`, `Sidebar`, `MobileMapSheet`, `IncidentForm`, `EmergencyModal`,
`IncidentDetailPanel`, `AreaIntelligencePanel`, `LayerToggle`.

## Data pipelines (run for everyone once auth is ready)

| Feed | Source | Refresh | Notes |
|---|---|---|---|
| Community incidents | Firestore `incidents`, realtime `onSnapshot`, newest 60 | live | pagination via `startAfter` ("Load more"), dedup by id, deleted/flagged filtered, 24 h map decay |
| Traffic incidents | Calgary Open Data `35ra-9556` | 5 min | title/description normalization, 8 h expiry |
| 311 service requests | Calgary Open Data `iahh-g8bj` (Open only) | 5 min | boring-category filter, category mapping, 24 h expiry |
| Water main breaks | Calgary Open Data `dpcu-jr23` (ACTIVE) | 5 min | pipe-material label, 60-day recency gate |
| Edmonton open data | `useEdmontonOpenData` | hook-managed | merged into the same incident list |
| Weather alerts | Open-Meteo, 15 Alberta zones | 30 min | WMO code → alert copy, wind/extreme-cold synthesis, one most-severe alert per zone, 2 h expiry |
| Crime stats | `useCrimeStats` + StatCan municipal + property assessments | on demand | feeds Area Intelligence panel + crime choropleth layer |
| Proximity dedup | all official feeds | on merge | 50 m same-category / 15 m cross-category; community posts never merged |

## Anonymous (signed-out) capabilities

- View the live map (light CARTO tiles), all markers, clustering, popups
  (popup buttons: "Learn more" → detail panel, "View details").
- Filter by category (all/crime/traffic/weather/infrastructure/emergency) —
  emergency always shows on the map regardless of filter.
- Layer toggles: Live Reports, Heatmap, Crime Stats choropleth.
- Sidebar feed (desktop) / bottom sheet (mobile): browse, search category,
  incident click → fly-to + popup + detail panel, "Load more" pagination.
- Incident detail panel: full description, source attribution, neighbourhood
  link, "Report similar" (prompts sign-in).
- Area Intelligence panel via neighbourhood links: safety score, trend,
  crime/disorder stats, StatCan yearly, property assessments, city averages.
- Near me (mobile button / geolocation): 3 km radius list sorted by distance,
  emergencies first, prev/next stepping that flies the map.
- Notifications bell: new-incident alerts accumulate live (max 20, unread badge).
- Locate button: fly to GPS position (or Calgary centre fallback + denied banner).
- Deep links: `/map?i=<incidentId>` opens that incident once;
  `/map?report=true` opens the report form (sign-in gate first).
- Home button → landing page. Bottom status bar: marker count + disclaimer.
- Attempting to report/SOS opens the Google sign-in panel.

## Signed-in additions

- Google sign-in (popup) → Firestore `users/{uid}` profile (realtime subscription).
- **First-run profile onboarding** (forced panel until completed or skipped):
  address OR neighbourhood (autocomplete guesses + Nominatim geocode to
  community), PII consent checkbox (required), weekly digest opt-in,
  skip-for-now writes `onboardingCompletedAt`.
- Account settings panel (same modal, `settings` mode): summary view,
  edit preferences, cancel/save (dirty-check), sign out via avatar menu.
- Post a report: form modal — category, title, description, neighbourhood,
  photo upload, anonymous toggle, location via GPS / tap map / pin mode
  (crosshair, "Set pin here", cancel), writes to Firestore with
  author uid + sanitized fields.
- Emergency SOS: red FAB → EmergencyModal (call-911-first messaging,
  category, description, GPS or emergency pin mode), writes incident.
- "Neighbourhood report ready" notification on sign-in when a saved address
  exists → opens Area Intelligence for their community.
- Admin users: "Admin" entry in avatar menu → `/admin`.

## Screen-size behaviours

- **Desktop (lg+)**: left `Sidebar` (feed, category chips, search), floating
  top chrome (home, locate | bell, avatar/sign-in), FABs bottom-right
  (SOS + report) with hover tooltips, LayerToggle dock bottom-centre,
  status bar bottom, detail/area panels as right-side slide-overs.
- **Mobile (<lg)**: top glass bar (home, feed-title button toggling sheet
  snap, count badge) + marker-count hero chip; right action rail (near me,
  notifications); `MobileMapSheet` bottom sheet (snap 80px / 0.38 / 0.82,
  category chips, list, report press); near-me card overlay; FABs lifted
  above layer dock; tap-to-close scrim when sheet expanded.
- Pin modes hide all chrome (`opacity-0 invisible`) on both sizes.
- Page locks document scroll/overscroll while mounted.

## Interconnections to preserve

- `?report=true` → auth gate → form open → param stripped (used by landing CTAs).
- `?i=` written/removed as detail panel opens/closes (share links).
- `handleMarkerClick` ↔ sidebar/sheet active-incident highlight ↔ popup.
- Category filter is shared by sidebar, sheet, map markers and count badges.
- Pin modes are mutually exclusive with chrome, sheet and forms
  (see `MobileMapSheet`/vaul touch-action bug history).
- Area Intelligence fuzzy community resolution feeds from crime stats keys.

## Redesign log (this pass)

- New first-run coach-mark tour (`MapTour`), separate desktop/mobile step
  sets, `data-tour` anchors, localStorage `cw_tour_done_v1`, replay from
  avatar menu ("App tour").
- Desktop chrome: branded command bar (identity + grouped actions);
  FABs become labelled pills on desktop for discoverability.
- All existing handlers, panels, params and layer logic untouched.
