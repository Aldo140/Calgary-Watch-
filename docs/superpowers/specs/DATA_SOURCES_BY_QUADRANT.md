# Crime & Weather Data Sources by Calgary Quadrant

## Overview

The Calgary Watch ingestion pipeline now includes comprehensive crime incident and weather warning data organized by quadrant of the city (NE, NW, SE, SW, Center).

## New Data Sources

### 1. **Calgary Police Service Crime Data** (`calgary-police.ts`)

**What it covers:**
- Crime incidents (assault, robbery, theft, suspicious activity)
- Community crime alerts
- Traffic-related incidents
- Safety advisories by quadrant

**Organization:**
- Data grouped by city quadrant (NE, NW, SE, SW, Downtown)
- Each incident includes quadrant prefix in title: `[NE] Assault reported in Bridgeland`
- TTL: 24 hours for crime reports, 48 hours for community alerts

**Sample Categories:**
- **NE Quadrant:** Bridgeland, Saddleridge, Skyview, Northeast Calgary
- **NW Quadrant:** Citadel, Hamptons, Bowness, Northwest Calgary  
- **SE Quadrant:** Inglewood, Forest Lawn, Mahogany, Southeast Calgary
- **SW Quadrant:** Coach Hill, Signal Hill, West Springs, Southwest Calgary
- **Downtown:** Core, Beltline, Mission, Hillhurst

### 2. **Environment Canada Enhanced Weather Alerts** (`environment-canada-enhanced.ts`)

**What it covers:**
- Active weather alerts (snow, rain, wind, etc.)
- Directional information (e.g., "Snow moving from SW", "Rain coming from NE")
- Wind speed information when available
- Quadrant-specific impact areas

**Organization:**
- Weather events marked with quadrant prefix: `[SW] Heavy snow from northwest`
- Directional compass descriptions: N, NE, E, SE, S, SW, W, NW
- 8-point compass for granular direction info
- TTL: 6 hours (weather alerts expire quickly)

**Enhanced Features:**
- Automatically detects event centroid and quadrant
- Extracts wind speed from descriptions
- Formats descriptions with directional context
- Includes affected area descriptions like "NE quadrant" or "North area"

### 3. **Calgary Infrastructure & Streets Alerts** (`calgary-infrastructure.ts`)

**What it covers:**
- Street construction projects
- Road closures and detours
- Water main breaks
- Utility outages
- Sidewalk/pathway closures

**Organization:**
- Infrastructure issues grouped by quadrant
- Priority levels: 🔴 URGENT, 🟡 NOTICE, 🟢 INFO
- Specific location descriptions with quadrant affiliation
- Date ranges for construction/maintenance windows

**Sample Events:**
- `[NE] 🟡 NOTICE - Deerfoot Trail NE Median Repair` (2026-04-15 to 2026-05-15)
- `[NW] 🔴 URGENT - Water Main Break - Citadel Blvd` (2026-04-20 to 2026-04-21)
- `[SW] 🟡 NOTICE - Scheduled Power Outage - Coach Hill` (2026-04-21)
- `[SE] 🔴 URGENT - Inglewood Avenue Bridge Closure` (2026-04-10 to 2026-05-10)
- `[Downtown] 🟢 INFO - Bow River Pathway Maintenance` (2026-04-15 to 2026-04-25)

**TTL:**
- Infrastructure issues: 48 hours
- Water main breaks: 72 hours
- Utility outages: 24 hours

## Quadrant Utilities (`quadrant-utils.ts`)

Helper functions for coordinate-to-quadrant mapping:

### Functions:
- `getQuadrant(lat, lng)` — Returns NE, NW, SE, SW, or CENTER
- `getDirectionText(lat, lng)` — Returns 8-point compass direction (N, NE, E, etc.)
- `formatQuadrantPrefix(lat, lng)` — Returns "[NE]" or "[Downtown]" style prefix
- `formatWeatherDirection(description, lat, lng, windSpeed?)` — Enhances description with direction
- `isInCalgarybounds(lat, lng)` — Validates if location is in Calgary metro area
- `estimateQuadrantArea(lat, lng)` — Returns approximate area like "Inner NE" or "Outer SW"

### Quadrant Boundaries:
- **Center threshold:** ±0.01° (approximately ±1-1.5 km from downtown)
- **Inner ring:** 0.02-0.05° from center
- **Outer ring:** >0.05° from center

## Integration in Ingestion Pipeline

Updated files:
- `scripts/ingest/index.ts` — Imports and calls new source functions
- `src/types/index.ts` — Added `calgary_police_crime` and `calgary_infrastructure` to SourceType enum

The new sources are fetched in parallel with existing sources and deduplicated using:
- Unique `dedup_key` format: `source_name:location:event_type:time_bucket`
- SHA256 hashing for consistent dedup IDs

## Example Incident Output

### Crime Alert:
```
Title: [NE] Robbery reported in Downtown
Description: Crime report: Robbery in NE quadrant. Report location: Downtown. 
             Status: Under review. If you have information, contact CPS.
Category: crime
Expires: 24 hours from now
Source: Calgary Police Service
```

### Weather Alert:
```
Title: [SW] Snow warning from northwest
Description: Snow warning arriving from the NW. Heavy snow expected 10-15 cm. 
             Expected wind speeds around 30 km/h in the SW quadrant.
Category: weather
Expires: 6 hours from now
Source: Environment Canada
```

### Infrastructure Alert:
```
Title: [NW] 🔴 URGENT - Water Main Break - Citadel Blvd
Description: Water main repair in progress. Some residents may experience reduced water pressure.
             Location: Citadel Blvd NW (Outer NW)
             Start: 2026-04-20
             Expected end: 2026-04-21
             Please plan your route accordingly.
Category: infrastructure
Expires: 72 hours from end date
Source: Streets Calgary / Water Services
```

## Future Enhancements

Potential data sources that could be added:
1. **Real-time traffic flow data** — Congestion by quadrant
2. **Potholes and road damage reports** — Crowdsourced via 311
3. **Event announcements** — Concerts, protests, sports events
4. **Emergency shelter alerts** — Weather-related closures
5. **Air quality data** — Pollution levels by area
6. **Noise complaint data** — Construction/event noise
7. **Transit delays** — CTrain, bus disruptions by route
8. **Community notices** — Local alerts from community boards

## Running the Pipeline

```bash
# Set environment variables
export FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
export VITE_FIREBASE_PROJECT_ID='your-project-id'

# Run ingestion
npx tsx scripts/ingest/index.ts
```

The pipeline will output:
```
[ingest] Starting — 2026-04-20T10:30:00Z
[ingest] Pruned 0 expired incident(s).
[ingest] Environment Canada: 2 alert(s).
[ingest] 511 Alberta: 3 event(s).
[ingest] Alberta Emergency Alert: 0 alert(s).
[ingest] Reddit r/Calgary: 5 post(s).
[ingest] News RSS feeds: 4 article(s).
[ingest] Environment Canada Enhanced: 2 alert(s).
[ingest] Calgary Police Service: 8 incident(s).
[ingest] Calgary Infrastructure: 5 alert(s).
[ingest] 14 existing ingested key(s) in Firestore.
[ingest] Done — created: 15, updated: 8.
```
