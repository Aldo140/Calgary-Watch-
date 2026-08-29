# My Watch — Design

**Status:** Approved design (2026-08-29)
**Author:** Aldo + Claude
**Branch:** `feat/my-watch`

## Problem

Calgary Watch has more useful inputs than most local-safety products (community
reports, 311, CPS, ENMAX outages, traffic, weather) but no persistent loop that
answers the one question a resident actually returns for: **"What changed near
the places I care about since I last looked?"**

Verified gaps in the current code:

- **Notifications are ephemeral.** `MapPage.tsx:755` holds them in React state,
  capped at 20, repopulated from a live listener each session (`:1008`). Nothing
  survives a reload; the "updates for your saved area" promise (`:3337`) is not
  persistent.
- **Digest topics are stored but unused as a filter.** `weeklyDigestTopics` is
  loaded into the recipient (`scripts/digest/weekly.ts:157`) but never narrows
  the email content.
- **`report_count` already lifts digest ranking** (`src/lib/digest.ts:410`,
  `confirmation` bonus) but residents have no way to contribute that signal.
- Saved address, geocoding, home-distance (`distanceMetres`), personal briefing,
  and digest ranking (`digestHighlightScore`, `selectDigestHighlights`,
  `buildDigestSummary`) already exist and are reusable.

Auth is real (Google sign-in via `FirebaseProvider`); per-user profiles live in
the Firestore `users` collection.

## Locked decisions

1. **Full spec now, staged execution.** Every idea is captured here; build in
   safe, tested slices starting with Phase 1 + analytics.
2. **Signed-in is source of truth; localStorage is the signed-out fallback.**
   Profile fields win on sign-in.
3. **Feedback is signed-in, one deterministic record per user per incident**,
   enforced in Firestore rules (doc id = `{uid}_{incidentId}`).

## Non-goals (YAGNI)

AI summaries, additional external data feeds, commute briefing, organization
dashboard, and shareable neighbourhood snapshot are explicitly out of scope. The
product needs synthesis and participation, not more markers.

## Workstreams

Built in order; each is independently testable.

### W0 — Shared engine + digest topic-filter fix (foundation)

**New:** `src/lib/watch.ts` exporting a pure

```ts
buildWatchFeed(input: {
  incidents: Incident[];
  home: Point | null;
  since: number | null;          // watchLastSeenAt
  prefs: WatchPrefs;             // radiusM, categories
  now: number;
}): WatchFeed                     // { sections, counts, sinceSummary }
```

Priority order inside the feed: (1) emergencies, (2) real community
submissions, (3) meaningful outages / infrastructure / official reports,
(4) routine 311/API activity only when especially close or relevant.

Reuses `distanceMetres` and a scoring function **factored out of**
`digestHighlightScore` so the map and the weekly email rank identically. Pure —
no Firestore, no DOM — and fully unit-tested.

**Digest topic-filter fix:** `weeklyDigestTopics`, when non-empty, filters the
incidents considered in `buildDigestSummary` (and therefore the weekly email).
Empty array = no filter (current behaviour), so existing subscribers are
unaffected.

### W1 — Phase 1: persistent "Since you last checked" + product analytics

**Profile schema** (`users` doc), all optional/back-compatible:

- `watchLastSeenAt?: number`
- `watchRadiusM?: number` (default = outer digest ring)
- `watchCategories?: IncidentCategory[]` (empty = all)

Signed-in reads/writes go to the profile; signed-out mirror in localStorage
(`cw_watch_lastSeen`, `cw_watch_radius`, `cw_watch_categories`). On sign-in the
profile value wins.

**Persistent feed on the map:** on load, compute the "since `watchLastSeenAt`"
set from the already-loaded incidents via `buildWatchFeed`, rather than only
session-live arrivals. The notification panel header reads, e.g.:

> **Since you last checked** — 2 neighbour reports, 1 outage and 1 official
> update near home.

Each row deep-links to its marker (reuse `handleNotificationClick`).
`watchLastSeenAt` advances when the panel is opened and read. This stays
client-derived — no per-user server fan-out.

**Product analytics:** new `src/lib/productEvents.ts`:

```ts
logProductEvent(name: ProductEventName, props?: Record<string, string | number>): void
```

Writes privacy-safe docs to a new `product_events` collection. **No** address,
report text, or exact coordinates — neighbourhood name and a rounded distance
bucket at most. Events wired for the activation funnel:

`watch_opened`, `notification_opened`, `report_viewed`, `report_started`,
`report_submitted`, `feedback_added`, `digest_enabled`.

Funnel: search visit → map opened → location saved → My Watch reopened → report
viewed → contribution made → weekly digest retained.

### W2 — Phase 2: community report lifecycle

**New `incident_feedback` collection.** One document per user per incident,
id = `{uid}_{incidentId}`:

```ts
{ uid, incidentId, kind: 'saw_it' | 'still_happening' | 'resolved',
  createdAt, updatedAt, neighborhood? }
```

Rules enforce that the id matches `request.auth.uid` — one record per user, no
ballot-stuffing, no growing arrays on incident documents.

**Aggregation** rolls feedback into: corroboration count, last-active timestamp,
resolved signal, moderator priority, and digest ranking input. (Aggregator
mechanism — Cloud Function vs on-read reducer — decided in the plan.) Original
submissions are **never deleted**, even when resolved or hidden.

**Resident-facing copy** replaces the vague "confirmed" badge, without claiming
police verification:

- "Backed by 3 neighbours"
- "Last seen active 24 minutes ago"
- "Reported resolved by nearby residents"
- "No recent confirmation"

The admin attention queue surfaces disputed/contradictory reports; the digest
`confirmation` bonus is now fed by real resident signal.

### W3 — Phase 3: alerts & multiple watch zones

Gated behind Phase-1 usage proving the loop matters:

- Work / School / Family watch zones (array of watch areas on the profile).
- Immediate email alerts only for emergencies and highly relevant community
  reports.
- Quiet hours and category preferences.
- Browser push, added last, behind explicit consent.
- Short morning/evening briefing generated from the same shared engine.

## Data flow

```
incidents (live Firestore listener, already present)
        │
        ▼
buildWatchFeed(incidents, home, watchLastSeenAt, prefs, now)   ← W0, pure
        │
        ├─► MapPage "Since you last checked" panel   (W1, client-derived)
        ├─► weekly digest email                       (W0/W1, same ranking)
        └─► morning/evening briefing                  (W3)

incident_feedback (W2)  ─► aggregation ─► corroboration copy + digest bonus
product_events   (W1)   ─► activation/retention funnel
```

## Firestore rules

- `product_events`: create-only, shape-validated, no read for clients.
- `incident_feedback`: create/update only where doc id == `{auth.uid}_{incidentId}`;
  no deletes by clients; validated `kind` enum. **Read is owner+admin only** —
  the doc id is the writer's uid, so world-readable feedback would leak who
  said what about which report (the same identity leak the `incident_reporters`
  split avoids). The public reads counts, not names.

### Feedback privacy architecture (decided during W2b)

Public corroboration counts (great for trust and traffic) must not come at the
cost of exposing who corroborated. So:

- Per-user `incident_feedback` is **private** (owner + admin read).
- An `onIncidentFeedbackWritten` **Cloud Function** recomputes counts-only
  fields on the incident document: `feedback_corroborations`,
  `feedback_disputed`, `feedback_resolved`, `feedback_last_active`. These are
  public (incident read is public) and clients cannot spoof them — the incident
  update rules use `changedKeys().hasOnly([...])` allowlists that exclude them.
- The detail panel reads the public aggregate from the incident and reads only
  the reader's *own* feedback doc to show which button they pressed.
- The weekly digest and the admin queue read feedback with the Admin SDK /
  admin rule, so they are unaffected.

## Testing

- **W0**: pure unit tests for `buildWatchFeed` (priority ordering, since-window,
  radius/category filtering) and for the topic filter in the digest builder.
  Extend `tests/feed-ordering.test.ts` / `tests/digest.test.ts`.
- **W1**: unit-test the since-last-visit selection given a `watchLastSeenAt` and
  an incident set; rules test for `product_events` create-only.
- **W2**: rules tests for `incident_feedback` one-record-per-user and no-delete;
  unit tests for the aggregation reducer.
- **W3**: unit tests for zone matching, quiet-hours gating, alert eligibility.

## Rollout order

W0 → W1 (+ analytics) → W2 → W3. Each slice merges green before the next
starts. Phase 3 begins only after Phase 1 activation data justifies it.
