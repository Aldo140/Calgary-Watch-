# Mobile Map Feed Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mobile map's three-point vaul drawer with a two-state sheet we own, on a single dense row design, fixing the five defects that the current split between `MapPage` and `MobileMapSheet` produces.

**Architecture:** Pure logic moves to four small testable modules (`geo`, `format`, `feed`, `useSheetDrag`). The sheet becomes presentational — it loses `mapRef` and routes selection back through `MapPage`'s existing `handleMarkerClick`, so a row tap and a marker tap are one code path. The sheet's content stays mounted at all times and is moved by `translateY`, which is what lets `focus()` run synchronously inside a tap gesture (iOS keyboard requirement) and what replaces vaul's `visibility: hidden` hack.

**Tech Stack:** React 19, TypeScript (strict), Tailwind v4, Leaflet, `motion`, `date-fns`, `lucide-react`. Tests: `node:test` + `tsx`, no DOM harness.

**Spec:** `docs/superpowers/specs/2026-08-17-mobile-feed-restructure-design.md`

## Global Constraints

- **Test imports use relative paths with an explicit extension**, never the `@/` alias: `import { x } from '../src/lib/feed.ts'`. Source files may use `@/src/...` freely — verified that tsx resolves the alias for value imports.
- **Test style:** `import assert from 'node:assert/strict'`, `import { describe, it } from 'node:test'`, docblock header ending `* Run with: npm test`.
- **Baseline before any change: 240 tests, 66 suites, 0 failures.** Every task must leave that count at or above 240 with 0 failures.
- **Typecheck is `npm run lint`** (`tsc --noEmit`). It must pass at the end of every task.
- **Colour comes from `src/lib/tokens.ts`** (`MAP`, `CATEGORY`, `categoryColor`). Never introduce a new hex literal. Colour is applied **inline via `style`**, not Tailwind colour utilities — `index.css` declares `@variant light (&)` and globally remaps utilities, which has repeatedly rendered labels invisible.
- **No text below 10px.** The project raised every sub-9.5px label to a 10px floor (`ce62ae5`); do not regress it.
- **`touch-action: none` is scoped to the drag zone only.** Never set it on `document`, `body`, or the scroll container. This scoping is the entire reason for replacing vaul.
- **Do not touch:** the Near Me panel, desktop `Sidebar`, `IncidentDetailPanel`, `AreaIntelligencePanel`, any data pipeline, Firestore query, ingest script, or the incident schema. `AreaIntelligencePanel` keeps its vaul import.
- **`Map` is shadowed** in `MapPage.tsx` and `Map.tsx` by the map component; use `globalThis.Map` there. New `src/lib/*` files have no shadow and use plain `Map`.
- **Commit after every task.** Conventional-commit subjects, lowercase, narrative style matching repo history.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/geo.ts` | **Create.** `getDistance` — haversine km. Moved out of `MapPage` so the feed sorter can use it without importing the page. |
| `src/lib/format.ts` | **Create.** `formatDistance` — km → human string. |
| `src/lib/feed.ts` | **Create.** `SortBy`, `isSortBy`, `resolveDefaultSort`, `sortIncidents`. All feed ordering policy in one place. |
| `src/hooks/useSheetDrag.ts` | **Create.** `SheetState`, `resolveDragEnd` (pure), `useSheetDrag` (pointer gesture engine). |
| `src/components/IncidentRow.tsx` | **Create.** The one dense row. Memoized, callback-light, so keeping a full page mounted stays cheap. |
| `src/components/MobileMapSheet.tsx` | **Rewrite.** Loses vaul, `useDrawerOpen`, `SNAP_POINTS`, the peek branch, both card designs, the Total box, `mapRef`. |
| `src/pages/MapPage.tsx` | **Modify.** `sheetSnap` → `sheetState`; chrome loses chips; scrim geometry; `feedCount`; `filteredIncidentsCount` deleted. |
| `tests/format-distance.test.ts` | **Create.** |
| `tests/feed-ordering.test.ts` | **Create.** |
| `tests/sheet-drag.test.ts` | **Create.** |

Tasks 1–4 are additive and cannot break the running app. Task 5 is the atomic interface swap (sheet + its call site must change together). Task 6 is `MapPage`-only cleanup. Task 7 is verification.

---

## Task 1: Pure geo and distance formatting

**Files:**
- Create: `src/lib/geo.ts`
- Create: `src/lib/format.ts`
- Create: `tests/format-distance.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number` (kilometres). `formatDistance(km: number): string`.

Folded into one task because both are trivial pure modules that Task 2 depends on; a reviewer would not accept one and reject the other. `getDistance` is a verbatim move — `MapPage`'s copy is deleted in Task 6, not here, so the app keeps working throughout.

- [ ] **Step 1: Create `src/lib/geo.ts`**

```ts
/**
 * Great-circle distance between two coordinates, in kilometres.
 *
 * Lifted out of MapPage so the feed sorter and the sheet can measure distance
 * without importing the page. Haversine is accurate far past any distance this
 * app cares about and cheap enough to run per incident on every re-sort.
 */
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
```

- [ ] **Step 2: Write the failing test for `formatDistance`**

Create `tests/format-distance.test.ts`:

```ts
/**
 * Distance formatting for the mobile feed row.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatDistance } from '../src/lib/format.ts';

describe('formatDistance', () => {
  it('states sub-kilometre distances in metres, rounded to ten', () => {
    assert.equal(formatDistance(0.4), '400 m');
    assert.equal(formatDistance(0.404), '400 m');
    assert.equal(formatDistance(0.437), '440 m');
  });

  it('rounds away GPS jitter rather than implying precision the pin lacks', () => {
    assert.equal(formatDistance(0.4031), '400 m');
    assert.equal(formatDistance(0.4069), '410 m');
  });

  it('promotes to kilometres once rounding would reach 1000 m', () => {
    assert.equal(formatDistance(0.996), '1.0 km');
  });

  it('uses one decimal between one and ten kilometres', () => {
    assert.equal(formatDistance(1.24), '1.2 km');
    assert.equal(formatDistance(9.95), '10.0 km');
  });

  it('uses whole kilometres past ten', () => {
    assert.equal(formatDistance(12), '12 km');
    assert.equal(formatDistance(12.4), '12 km');
    assert.equal(formatDistance(147.6), '148 km');
  });

  it('says "here" rather than "0 m" when the reader is on top of it', () => {
    assert.equal(formatDistance(0), 'here');
    assert.equal(formatDistance(0.004), 'here');
  });

  it('returns an empty string for values it cannot state', () => {
    assert.equal(formatDistance(Number.NaN), '');
    assert.equal(formatDistance(Number.POSITIVE_INFINITY), '');
    assert.equal(formatDistance(-1), '');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --import tsx --test tests/format-distance.test.ts`
Expected: FAIL — cannot resolve `../src/lib/format.ts`.

- [ ] **Step 4: Create `src/lib/format.ts`**

```ts
/**
 * Distance as a resident would say it.
 *
 * Metres are rounded to the nearest ten: a report's pin carries GPS jitter of
 * several metres, so "437 m" claims precision the coordinate does not have.
 * Above a kilometre the unit changes rather than the digit count growing.
 */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '';
  const metres = Math.round((km * 1000) / 10) * 10;
  if (metres <= 0) return 'here';
  if (metres < 1000) return `${metres} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --import tsx --test tests/format-distance.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 6: Typecheck and run the whole suite**

Run: `npm run lint && npm test 2>&1 | tail -8`
Expected: no TS errors; `# fail 0`; total at least 247.

- [ ] **Step 7: Commit**

```bash
git add src/lib/geo.ts src/lib/format.ts tests/format-distance.test.ts
git commit -m "feat(lib): extract distance measurement and give it a reader's units"
```

---

## Task 2: Feed ordering policy

**Files:**
- Create: `src/lib/feed.ts`
- Create: `tests/feed-ordering.test.ts`

**Interfaces:**
- Consumes: `getDistance` from `src/lib/geo.ts` (Task 1).
- Produces:
  - `type SortBy = 'newest' | 'oldest' | 'verified' | 'nearest'`
  - `isSortBy(value: unknown): value is SortBy`
  - `resolveDefaultSort(persisted: unknown, hasLocation: boolean): SortBy`
  - `sortIncidents(list: Incident[], sortBy: SortBy, userLocation: { lat: number; lng: number } | null): Incident[]`

- [ ] **Step 1: Write the failing test**

Create `tests/feed-ordering.test.ts`:

```ts
/**
 * Feed ordering policy for the mobile sheet.
 *
 * Emergencies pin to the top in every mode. 'nearest' is the default once the
 * reader's location is known, but a stored 'nearest' must not strand the feed
 * in a mode it cannot compute when permission is later denied.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Incident } from '../src/types/index.ts';
import { isSortBy, resolveDefaultSort, sortIncidents } from '../src/lib/feed.ts';

const DOWNTOWN = { lat: 51.0447, lng: -114.0719 };

function incident(over: Partial<Incident> & { id: string }): Incident {
  return {
    title: 'Report',
    description: 'Description',
    category: 'crime',
    neighborhood: 'Beltline',
    lat: DOWNTOWN.lat,
    lng: DOWNTOWN.lng,
    timestamp: 1_700_000_000_000,
    name: 'Ana',
    verified_status: 'unverified',
    report_count: 1,
    ...over,
  } as Incident;
}

const ids = (list: Incident[]) => list.map((i) => i.id);

describe('isSortBy', () => {
  it('accepts every mode the control offers', () => {
    for (const v of ['newest', 'oldest', 'verified', 'nearest']) assert.equal(isSortBy(v), true);
  });

  it('rejects anything else, including junk from localStorage', () => {
    for (const v of ['', 'closest', null, undefined, 7, {}]) assert.equal(isSortBy(v), false);
  });
});

describe('resolveDefaultSort', () => {
  it('honours a valid persisted preference', () => {
    assert.equal(resolveDefaultSort('oldest', true), 'oldest');
    assert.equal(resolveDefaultSort('verified', false), 'verified');
    assert.equal(resolveDefaultSort('nearest', true), 'nearest');
  });

  it('falls back to nearest when nothing is persisted and location is known', () => {
    assert.equal(resolveDefaultSort(null, true), 'nearest');
    assert.equal(resolveDefaultSort('rubbish', true), 'nearest');
  });

  it('falls back to newest when location is unknown', () => {
    assert.equal(resolveDefaultSort(null, false), 'newest');
    assert.equal(resolveDefaultSort('rubbish', false), 'newest');
  });

  it('does not strand the feed in nearest when location is unavailable', () => {
    assert.equal(resolveDefaultSort('nearest', false), 'newest');
  });
});

describe('sortIncidents', () => {
  it('pins emergencies to the top in every mode', () => {
    const list = [
      incident({ id: 'old-crime', timestamp: 1 }),
      incident({ id: 'sos', category: 'emergency', timestamp: 0 }),
      incident({ id: 'new-crime', timestamp: 9 }),
    ];
    for (const mode of ['newest', 'oldest', 'verified', 'nearest'] as const) {
      assert.equal(ids(sortIncidents(list, mode, DOWNTOWN))[0], 'sos', mode);
    }
  });

  it('orders by recency for newest and reverses it for oldest', () => {
    const list = [
      incident({ id: 'b', timestamp: 200 }),
      incident({ id: 'a', timestamp: 100 }),
      incident({ id: 'c', timestamp: 300 }),
    ];
    assert.deepEqual(ids(sortIncidents(list, 'newest', null)), ['c', 'b', 'a']);
    assert.deepEqual(ids(sortIncidents(list, 'oldest', null)), ['a', 'b', 'c']);
  });

  it('orders by verification strength, then recency', () => {
    const list = [
      incident({ id: 'unverified', verified_status: 'unverified', timestamp: 300 }),
      incident({ id: 'confirmed', verified_status: 'community_confirmed', timestamp: 100 }),
      incident({ id: 'multiple', verified_status: 'multiple_reports', timestamp: 200 }),
    ];
    assert.deepEqual(ids(sortIncidents(list, 'verified', null)), ['confirmed', 'multiple', 'unverified']);
  });

  it('orders by true distance from the reader', () => {
    const list = [
      incident({ id: 'far', lat: 51.29, lng: -114.01 }),
      incident({ id: 'near', lat: 51.045, lng: -114.072 }),
      incident({ id: 'mid', lat: 51.09, lng: -114.13 }),
    ];
    assert.deepEqual(ids(sortIncidents(list, 'nearest', DOWNTOWN)), ['near', 'mid', 'far']);
  });

  it('degrades nearest to newest when location is unknown, without throwing', () => {
    const list = [
      incident({ id: 'a', timestamp: 100, lat: 51.045, lng: -114.072 }),
      incident({ id: 'b', timestamp: 200, lat: 51.29, lng: -114.01 }),
    ];
    assert.deepEqual(ids(sortIncidents(list, 'nearest', null)), ['b', 'a']);
  });

  it('breaks distance ties by recency', () => {
    const list = [
      incident({ id: 'older', timestamp: 100 }),
      incident({ id: 'newer', timestamp: 200 }),
    ];
    assert.deepEqual(ids(sortIncidents(list, 'nearest', DOWNTOWN)), ['newer', 'older']);
  });

  it('does not mutate the list it is given', () => {
    const list = [incident({ id: 'a', timestamp: 100 }), incident({ id: 'b', timestamp: 200 })];
    const before = ids(list);
    sortIncidents(list, 'newest', DOWNTOWN);
    assert.deepEqual(ids(list), before);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/feed-ordering.test.ts`
Expected: FAIL — cannot resolve `../src/lib/feed.ts`.

- [ ] **Step 3: Create `src/lib/feed.ts`**

```ts
import type { Incident } from '@/src/types';
import { getDistance } from '@/src/lib/geo';

/**
 * How the feed is ordered.
 *
 * All ordering policy lives here rather than inside the sheet, so the mobile
 * sheet and its tests read the same rules and a mode cannot mean two things.
 */
export type SortBy = 'newest' | 'oldest' | 'verified' | 'nearest';

const SORT_VALUES: readonly string[] = ['newest', 'oldest', 'verified', 'nearest'];

/** Type guard for values coming back out of localStorage. */
export function isSortBy(value: unknown): value is SortBy {
  return typeof value === 'string' && SORT_VALUES.includes(value);
}

/** Verification strength, strongest first. */
const VERIFIED_SCORE: Record<string, number> = {
  community_confirmed: 3,
  multiple_reports: 2,
  pending_review: 1,
  unverified: 0,
};

/**
 * The mode the control should open in.
 *
 * A stored preference wins, with one exception: 'nearest' cannot be honoured
 * without a location. Permission can be granted on one visit and denied on the
 * next, and a stored 'nearest' must not leave the feed in a mode it is unable
 * to compute. The caller leaves the *stored* value alone in that case, so the
 * preference returns intact once location is available again.
 */
export function resolveDefaultSort(persisted: unknown, hasLocation: boolean): SortBy {
  if (isSortBy(persisted) && !(persisted === 'nearest' && !hasLocation)) return persisted;
  return hasLocation ? 'nearest' : 'newest';
}

/**
 * Order the feed. Never mutates the input — `incidents` upstream is memoized
 * and sorting it in place would corrupt every other consumer.
 *
 * Emergencies pin to the top in every mode: someone is in danger, and that
 * outranks whatever the reader asked to sort by.
 */
export function sortIncidents(
  list: Incident[],
  sortBy: SortBy,
  userLocation: { lat: number; lng: number } | null,
): Incident[] {
  const effective: SortBy = sortBy === 'nearest' && !userLocation ? 'newest' : sortBy;

  // Measured once per incident rather than inside the comparator, which would
  // recompute haversine O(n log n) times.
  const distance = new Map<string, number>();
  if (effective === 'nearest' && userLocation) {
    for (const i of list) {
      distance.set(i.id, getDistance(userLocation.lat, userLocation.lng, i.lat, i.lng));
    }
  }

  return [...list].sort((a, b) => {
    const aEmergency = a.category === 'emergency';
    const bEmergency = b.category === 'emergency';
    if (aEmergency !== bEmergency) return aEmergency ? -1 : 1;

    if (effective === 'nearest') {
      const byDistance =
        (distance.get(a.id) ?? Number.POSITIVE_INFINITY) -
        (distance.get(b.id) ?? Number.POSITIVE_INFINITY);
      return byDistance || b.timestamp - a.timestamp;
    }
    if (effective === 'oldest') return a.timestamp - b.timestamp;
    if (effective === 'verified') {
      const byStrength =
        (VERIFIED_SCORE[b.verified_status] ?? 0) - (VERIFIED_SCORE[a.verified_status] ?? 0);
      return byStrength || b.timestamp - a.timestamp;
    }
    return b.timestamp - a.timestamp;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/feed-ordering.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Typecheck and run the whole suite**

Run: `npm run lint && npm test 2>&1 | tail -8`
Expected: no TS errors; `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/feed.ts tests/feed-ordering.test.ts
git commit -m "feat(feed): name the ordering rules, and add nearest-first"
```

---

## Task 3: Sheet gesture engine

**Files:**
- Create: `src/hooks/useSheetDrag.ts`
- Create: `tests/sheet-drag.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type SheetState = 'rail' | 'raised'`
  - `resolveDragEnd(input: { deltaY: number; velocity: number; travel: number; state: SheetState }): SheetState`
  - `useSheetDrag(args): { headerHandlers, listHandlers, offsetY: number, isDragging: boolean }` where both handler objects carry `onPointerDown`, `onPointerMove`, `onPointerUp`, `onPointerCancel`.

- [ ] **Step 1: Write the failing test**

Create `tests/sheet-drag.test.ts`:

```ts
/**
 * Release decision for the map sheet drag.
 *
 * The sheet has two states and one rule: a drag commits if it travelled far
 * enough or was flung hard enough, otherwise it springs back to where it
 * started. Movement that would push past the end the sheet already sits at
 * can never commit anything.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveDragEnd } from '../src/hooks/useSheetDrag.ts';

const TRAVEL = 600; // px between rail and raised

describe('resolveDragEnd from raised', () => {
  const from = 'raised' as const;

  it('commits to rail once the drag passes a quarter of the travel', () => {
    assert.equal(resolveDragEnd({ deltaY: 150, velocity: 0, travel: TRAVEL, state: from }), 'rail');
    assert.equal(resolveDragEnd({ deltaY: 400, velocity: 0, travel: TRAVEL, state: from }), 'rail');
  });

  it('springs back when the drag is short of the threshold', () => {
    assert.equal(resolveDragEnd({ deltaY: 149, velocity: 0, travel: TRAVEL, state: from }), 'raised');
    assert.equal(resolveDragEnd({ deltaY: 20, velocity: 0, travel: TRAVEL, state: from }), 'raised');
  });

  it('commits on a downward fling that never reached the threshold', () => {
    assert.equal(resolveDragEnd({ deltaY: 40, velocity: 0.9, travel: TRAVEL, state: from }), 'rail');
  });

  it('ignores an upward fling — it is already raised', () => {
    assert.equal(resolveDragEnd({ deltaY: -40, velocity: -0.9, travel: TRAVEL, state: from }), 'raised');
  });

  it('cannot be dragged further open', () => {
    assert.equal(resolveDragEnd({ deltaY: -400, velocity: 0, travel: TRAVEL, state: from }), 'raised');
  });
});

describe('resolveDragEnd from rail', () => {
  const from = 'rail' as const;

  it('commits to raised once the upward drag passes a quarter of the travel', () => {
    assert.equal(resolveDragEnd({ deltaY: -150, velocity: 0, travel: TRAVEL, state: from }), 'raised');
  });

  it('springs back when the upward drag is short', () => {
    assert.equal(resolveDragEnd({ deltaY: -149, velocity: 0, travel: TRAVEL, state: from }), 'rail');
  });

  it('commits on an upward fling that never reached the threshold', () => {
    assert.equal(resolveDragEnd({ deltaY: -30, velocity: -0.9, travel: TRAVEL, state: from }), 'raised');
  });

  it('cannot be dragged further closed', () => {
    assert.equal(resolveDragEnd({ deltaY: 400, velocity: 0.9, travel: TRAVEL, state: from }), 'rail');
  });
});

describe('resolveDragEnd degenerate input', () => {
  it('holds state when there is no travel to measure against', () => {
    assert.equal(resolveDragEnd({ deltaY: 500, velocity: 2, travel: 0, state: 'raised' }), 'raised');
    assert.equal(resolveDragEnd({ deltaY: -500, velocity: -2, travel: 0, state: 'rail' }), 'rail');
  });

  it('holds state on a tap that did not move', () => {
    assert.equal(resolveDragEnd({ deltaY: 0, velocity: 0, travel: TRAVEL, state: 'rail' }), 'rail');
    assert.equal(resolveDragEnd({ deltaY: 0, velocity: 0, travel: TRAVEL, state: 'raised' }), 'raised');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/sheet-drag.test.ts`
Expected: FAIL — cannot resolve `../src/hooks/useSheetDrag.ts`.

- [ ] **Step 3: Create `src/hooks/useSheetDrag.ts` with the pure decision only**

```ts
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

/** The sheet has two positions and nothing in between that persists. */
export type SheetState = 'rail' | 'raised';

export interface DragEndInput {
  /** Pixels moved since the drag began. Positive is downward. */
  deltaY: number;
  /** Pixels per millisecond at release. Positive is downward. */
  velocity: number;
  /** Pixel distance between the rail and raised positions. */
  travel: number;
  /** The state the drag began from. */
  state: SheetState;
}

/** Fraction of the travel a drag must cover to commit without a fling. */
const COMMIT_FRACTION = 0.25;
/** px/ms past which a short drag still commits. */
const FLING_VELOCITY = 0.5;
/** px of movement before a touch on the list is treated as a drag, not a tap. */
const DRAG_SLOP = 6;

/**
 * Where the sheet lands when the finger lifts.
 *
 * Kept pure and separate from the hook so the rule is testable without a DOM —
 * this repo has no component harness, so anything worth asserting has to be
 * reachable from plain Node.
 */
export function resolveDragEnd({ deltaY, velocity, travel, state }: DragEndInput): SheetState {
  if (travel <= 0) return state;
  const closing = state === 'raised';
  const target: SheetState = closing ? 'rail' : 'raised';

  // Progress toward the *other* state. Negative means the finger moved toward
  // the end the sheet already occupies, which can never commit anything.
  const progress = closing ? deltaY : -deltaY;
  const flung = closing ? velocity >= FLING_VELOCITY : velocity <= -FLING_VELOCITY;

  if (flung && progress > 0) return target;
  if (progress >= travel * COMMIT_FRACTION) return target;
  return state;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/sheet-drag.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Append the hook to `src/hooks/useSheetDrag.ts`**

```ts
interface ActiveDrag {
  pointerId: number;
  startY: number;
  lastY: number;
  lastT: number;
  velocity: number;
}

/**
 * Pointer-driven drag for a two-state bottom sheet.
 *
 * Replaces vaul for this sheet. The substantive difference is that
 * `touch-action: none` is applied by the *consumer* to the drag zone alone
 * (see MobileMapSheet) and never to the document — vaul mutated global
 * touch-action during its springs, which broke Leaflet's touch tracking and
 * froze form inputs after a pin drop three separate times.
 *
 * Two handler sets, because the two zones have different rules:
 *  - `headerHandlers` always drags.
 *  - `listHandlers` drags only from `scrollTop === 0` and only downward, so
 *    mid-list scrolling is untouched.
 */
export function useSheetDrag({
  state,
  onStateChange,
  scrollRef,
  travel,
  enabled = true,
}: {
  state: SheetState;
  onStateChange: (next: SheetState) => void;
  scrollRef: RefObject<HTMLElement | null>;
  travel: number;
  enabled?: boolean;
}) {
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const active = useRef<ActiveDrag | null>(null);
  const pending = useRef<{ pointerId: number; startY: number } | null>(null);

  const begin = useCallback((pointerId: number, clientY: number, el: HTMLElement) => {
    active.current = { pointerId, startY: clientY, lastY: clientY, lastT: performance.now(), velocity: 0 };
    setIsDragging(true);
    try {
      el.setPointerCapture(pointerId);
    } catch {
      /* capture is an optimisation; the drag still works without it */
    }
  }, []);

  const move = useCallback(
    (clientY: number) => {
      const drag = active.current;
      if (!drag) return;
      const now = performance.now();
      const dt = now - drag.lastT;
      if (dt > 0) drag.velocity = (clientY - drag.lastY) / dt;
      drag.lastY = clientY;
      drag.lastT = now;

      // Clamp so the sheet cannot be pulled past either end.
      const raw = clientY - drag.startY;
      setOffsetY(state === 'raised' ? Math.max(0, raw) : Math.min(0, raw));
    },
    [state],
  );

  const finish = useCallback(() => {
    const drag = active.current;
    active.current = null;
    pending.current = null;
    setIsDragging(false);
    setOffsetY(0);
    if (!drag) return;
    const next = resolveDragEnd({
      deltaY: drag.lastY - drag.startY,
      velocity: drag.velocity,
      travel,
      state,
    });
    if (next !== state) onStateChange(next);
  }, [onStateChange, state, travel]);

  const headerHandlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      begin(e.pointerId, e.clientY, e.currentTarget);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => move(e.clientY),
    onPointerUp: () => finish(),
    onPointerCancel: () => finish(),
  };

  const listHandlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || state !== 'raised') return;
      // Only a candidate. Whether this becomes a drag or a scroll is decided on
      // the first move, once we know the direction.
      pending.current = { pointerId: e.pointerId, startY: e.clientY };
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (active.current) {
        move(e.clientY);
        return;
      }
      const candidate = pending.current;
      if (!candidate || candidate.pointerId !== e.pointerId) return;
      const delta = e.clientY - candidate.startY;
      const atTop = (scrollRef.current?.scrollTop ?? 0) <= 0;
      if (delta > DRAG_SLOP && atTop) {
        pending.current = null;
        begin(e.pointerId, candidate.startY, e.currentTarget);
        move(e.clientY);
      } else if (Math.abs(delta) > DRAG_SLOP) {
        // Upward, or not at the top: this is a scroll. Stop watching.
        pending.current = null;
      }
    },
    onPointerUp: () => {
      pending.current = null;
      if (active.current) finish();
    },
    onPointerCancel: () => {
      pending.current = null;
      if (active.current) finish();
    },
  };

  return { headerHandlers, listHandlers, offsetY, isDragging };
}
```

- [ ] **Step 6: Typecheck and run the whole suite**

Run: `npm run lint && npm test 2>&1 | tail -8`
Expected: no TS errors; `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useSheetDrag.ts tests/sheet-drag.test.ts
git commit -m "feat(map): own the sheet gesture, scoped to its own drag zone"
```

---

## Task 4: The dense incident row

**Files:**
- Create: `src/components/IncidentRow.tsx`

**Interfaces:**
- Consumes: `formatDistance` (Task 1); `categoryColor`, `MAP` from `src/lib/tokens.ts`; `CATEGORY_ICONS`, `Incident` from `src/types`; `DemoBadge`.
- Produces: default export `IncidentRow` (memoized) with props
  `{ incident: Incident; distanceKm: number | null; isActive: boolean; onSelect: (incident: Incident) => void }`.

There is no component test harness in this repo, so verification here is typecheck plus the device pass in Task 7. That is a real gap, stated rather than papered over with a fake assertion.

- [ ] **Step 1: Create `src/components/IncidentRow.tsx`**

```tsx
import { memo } from 'react';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { CATEGORY_ICONS, type Incident } from '@/src/types';
import { MAP, categoryColor } from '@/src/lib/tokens';
import { formatDistance } from '@/src/lib/format';
import DemoBadge from '@/src/components/DemoBadge';
import { cn } from '@/src/lib/utils';

export interface IncidentRowProps {
  incident: Incident;
  /** Kilometres from the reader, or null when their location is unknown. */
  distanceKm: number | null;
  isActive: boolean;
  onSelect: (incident: Incident) => void;
}

/**
 * One incident, one row, one shape.
 *
 * This replaces the two designs the sheet used to carry — a glance row at the
 * peek snap and a full card when expanded — for the same piece of data.
 * Severity reads through the spine colour and the SOS ribbon, never through
 * height, so a wind warning and a break-in occupy the same space and the list
 * stays scannable. Description, image, reporter and verification move to
 * IncidentDetailPanel, where a reader who wants them is already headed.
 */
function IncidentRowBase({ incident, distanceKm, isActive, onSelect }: IncidentRowProps) {
  const Icon = CATEGORY_ICONS[incident.category] ?? AlertCircle;
  const colour = categoryColor(incident.category);
  const isEmergency = incident.category === 'emergency';
  const isOfficial = incident.data_source === 'official' || incident.data_source === 'system';

  const meta = [
    `${formatDistanceToNow(incident.timestamp)} ago`,
    distanceKm === null ? '' : formatDistance(distanceKm),
    incident.neighborhood || 'Calgary',
  ]
    .filter(Boolean)
    .join(' · ');

  const sourceLabel = isOfficial ? 'Official source' : 'Community report';

  return (
    <button
      type="button"
      onClick={() => onSelect(incident)}
      aria-current={isActive ? 'true' : undefined}
      className="relative mb-1.5 flex w-full items-center gap-3 py-2.5 pl-4 pr-3 text-left transition-transform active:scale-[0.99]"
      style={{
        background: isEmergency ? 'rgba(192,57,43,0.07)' : MAP.panel,
        border: `1.5px solid ${isEmergency ? MAP.danger : isActive ? MAP.accent : MAP.line}`,
        boxShadow: isActive ? '0 0 0 2px rgba(74,144,217,0.25)' : undefined,
      }}
    >
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-[3px]"
        style={{ background: colour }}
        aria-hidden="true"
      />

      <span
        className={cn('flex h-8 w-8 shrink-0 items-center justify-center', isEmergency && 'animate-pulse')}
        style={{ background: `${colour}18`, color: colour }}
      >
        <Icon size={14} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-bold leading-tight" style={{ color: MAP.ink }}>
          {incident.title}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10px]" style={{ color: MAP.muted }}>
          {meta}
        </span>
        {incident.data_source === 'demo' && (
          <span className="mt-1 block">
            <DemoBadge size="xs" />
          </span>
        )}
      </span>

      {isEmergency && (
        <span
          className="shrink-0 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ background: MAP.danger, color: MAP.panel }}
        >
          SOS
        </span>
      )}

      {/* Filled dot for a neighbour's report, hollow for an official feed. The
          title carries the same information for anyone who cannot see shape. */}
      <span className="shrink-0" title={sourceLabel} aria-label={sourceLabel} role="img">
        <span
          className="block h-2 w-2 rounded-full"
          style={isOfficial ? { border: `1.5px solid ${MAP.muted}` } : { background: MAP.muted }}
        />
      </span>

      <ChevronRight size={14} className="shrink-0" style={{ color: MAP.muted }} aria-hidden="true" />
    </button>
  );
}

/**
 * Memoized because the sheet keeps a whole page of rows mounted at all times
 * (see MobileMapSheet — the always-mounted tree is what lets search focus run
 * synchronously inside a tap). `onSelect` must be a stable callback or this
 * does nothing.
 */
export default memo(IncidentRowBase);
```

- [ ] **Step 2: Verify `DemoBadge` accepts the `size` prop used here**

Run: `grep -n "size" src/components/DemoBadge.tsx | head`
Expected: a `size` prop including an `'xs'` variant. If `'xs'` is absent, use the smallest variant that exists and note the substitution in the commit body.

- [ ] **Step 3: Typecheck**

Run: `npm run lint`
Expected: no TS errors. (The component is not yet rendered anywhere; this confirms its types and imports resolve.)

- [ ] **Step 4: Run the whole suite**

Run: `npm test 2>&1 | tail -8`
Expected: `# fail 0`, unchanged count.

- [ ] **Step 5: Commit**

```bash
git add src/components/IncidentRow.tsx
git commit -m "feat(map): one row shape for an incident, whatever its source"
```

---

## Task 5: Rewrite the sheet and swap its interface

**Files:**
- Rewrite: `src/components/MobileMapSheet.tsx`
- Modify: `src/pages/MapPage.tsx` — `sheetSnap` state at `:715`; call sites at `:1085`, `:1736`, `:2594`, `:2598`, `:2614-2615`, `:2620`, `:2645`, `:3506`; sheet usage at `:2604-2624`

**Interfaces:**
- Consumes: `SheetState`, `useSheetDrag` (Task 3); `SortBy`, `resolveDefaultSort`, `sortIncidents`, `isSortBy` (Task 2); `getDistance` (Task 1); `IncidentRow` (Task 4).
- Produces:
  - `export interface MapSheetRef { raiseAndFocusSearch: () => void }`
  - `MobileMapSheet` as a `forwardRef<MapSheetRef, MobileMapSheetProps>` with the props listed in Step 1.
  - `SNAP_POINTS` and `SnapPoint` are **deleted**; `MapPage` must stop importing them.

This is the one task that cannot be split: the sheet's props and its only call site must change together or the build breaks. Both files are edited before the first typecheck.

- [ ] **Step 1: Rewrite `src/components/MobileMapSheet.tsx`**

Replace the file entirely:

```tsx
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Search, X, ChevronDown, Plus, Activity, Layers, Siren, AlertCircle, Car, Construction, CloudRain } from 'lucide-react';
import { TimeWindowFilter, type TimeWindow } from '@/src/components/TimeWindowFilter';
import { Incident, IncidentCategory, isPubliclyVisible } from '@/src/types';
import { cn, publicAsset } from '@/src/lib/utils';
import { useNeighborhoodPulse, RISK_CONFIG } from '@/src/hooks/useNeighborhoodPulse';
import IncidentRow from '@/src/components/IncidentRow';
import { useSheetDrag, type SheetState } from '@/src/hooks/useSheetDrag';
import { resolveDefaultSort, sortIncidents, type SortBy } from '@/src/lib/feed';
import { getDistance } from '@/src/lib/geo';
import { MAP } from '@/src/lib/tokens';

const SORT_KEY = 'cw_sortBy';
const FEED_FILTER_KEY = 'cw_feedFilter';

/** Height of the collapsed rail, in px. Also the sheet's resting offset. */
const RAIL_HEIGHT = 80;
/** Fraction of the viewport the raised sheet occupies. */
const RAISED_FRACTION = 0.82;

// Palette aliases onto MAP so this file holds no hex of its own. Colour is
// applied inline because index.css globally remaps Tailwind colour utilities.
const P = {
  paper: MAP.panel,
  card: MAP.paper,
  ink: MAP.ink,
  soft: MAP.muted,
  line: MAP.line,
  ground: '#06162F',
  onGround: '#F2EFE8',
  eyebrow: '#AFC5DF',
  accent: MAP.accent,
  live: '#7FDCC6',
};

const CATEGORY_OPTIONS = [
  { id: 'all' as const,            label: 'All',     Icon: Layers,       color: '#1C2B3A' },
  { id: 'emergency' as const,      label: 'SOS',     Icon: Siren,        color: '#C0392B' },
  { id: 'crime' as const,          label: 'Crime',   Icon: AlertCircle,  color: '#C0392B' },
  { id: 'traffic' as const,        label: 'Traffic', Icon: Car,          color: '#C77F18' },
  { id: 'infrastructure' as const, label: 'Infra',   Icon: Construction, color: '#4A90D9' },
  { id: 'weather' as const,        label: 'Weather', Icon: CloudRain,    color: '#0284C7' },
] as const;

function getNeighborhoodCenter(incidents: Incident[], name: string): { lat: number; lng: number } | null {
  const matching = incidents.filter((i) => i.neighborhood === name && isFinite(i.lat) && isFinite(i.lng));
  if (!matching.length) return null;
  return {
    lat: matching.reduce((s, i) => s + i.lat, 0) / matching.length,
    lng: matching.reduce((s, i) => s + i.lng, 0) / matching.length,
  };
}

export interface MapSheetRef {
  /**
   * Raise the sheet and put the caret in the search field in one motion.
   *
   * Called from the chrome's search-shaped button. Focus runs synchronously
   * inside the tap gesture because iOS Safari only opens the keyboard for a
   * synchronous focus on an element already in the DOM — which is why this
   * component's tree stays mounted at the rail rather than being conditionally
   * rendered.
   */
  raiseAndFocusSearch: () => void;
}

export interface MobileMapSheetProps {
  incidents: Incident[];
  /** The one derived feed count, shared with the chrome badge. */
  feedCount: number;
  timeWindow?: TimeWindow;
  onTimeWindowChange?: (v: TimeWindow) => void;
  selectedCategory: IncidentCategory | 'all';
  onCategoryChange: (c: IncidentCategory | 'all') => void;
  state: SheetState;
  onStateChange: (s: SheetState) => void;
  userLocation: { lat: number; lng: number } | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onIncidentClick: (i: Incident) => void;
  onNeighbourhoodSelect: (name: string) => void;
  onReportPress: () => void;
  activeIncidentId?: string | null;
  /** Report form open or a pin being placed — translate fully offscreen. */
  hidden: boolean;
}

const MobileMapSheet = forwardRef<MapSheetRef, MobileMapSheetProps>(function MobileMapSheet(
  {
    incidents,
    feedCount,
    timeWindow,
    onTimeWindowChange,
    selectedCategory,
    onCategoryChange,
    state,
    onStateChange,
    userLocation,
    hasMore,
    isLoadingMore,
    onLoadMore,
    onIncidentClick,
    onNeighbourhoodSelect,
    onReportPress,
    activeIncidentId,
    hidden,
  },
  ref,
) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [feedFilter, setFeedFilter] = useState<'community' | 'recent' | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [sortRestored, setSortRestored] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isRaised = state === 'raised';
  const hasLocation = Boolean(userLocation);

  /** Skip the spring entirely when the reader has asked for less motion. */
  const reducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
  ).current;

  // Distance between the two positions, in px. Recomputed on resize and
  // rotation — a value captured once goes stale the moment the phone turns,
  // and it is the denominator the commit threshold is measured against.
  const [travel, setTravel] = useState(0);
  useEffect(() => {
    const measure = () => setTravel(Math.max(0, window.innerHeight * RAISED_FRACTION - RAIL_HEIGHT));
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  const { headerHandlers, listHandlers, offsetY, isDragging } = useSheetDrag({
    state,
    onStateChange,
    scrollRef,
    travel,
    enabled: !hidden,
  });

  useImperativeHandle(ref, () => ({
    raiseAndFocusSearch: () => {
      inputRef.current?.focus({ preventScroll: true });
      onStateChange('raised');
    },
  }), [onStateChange]);

  // Restore persisted preferences once, then resolve the effective sort. The
  // stored value is deliberately not rewritten when it cannot be honoured —
  // see resolveDefaultSort.
  useEffect(() => {
    let storedSort: string | null = null;
    try {
      storedSort = localStorage.getItem(SORT_KEY);
      const f = localStorage.getItem(FEED_FILTER_KEY);
      if (f === 'community' || f === 'recent') setFeedFilter(f);
    } catch { /* private mode */ }
    setSortBy(resolveDefaultSort(storedSort, hasLocation));
    setSortRestored(true);
    // Runs once; location arriving later must not re-sort under the reader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sortRestored) return;
    try { localStorage.setItem(SORT_KEY, sortBy); } catch { /* private mode */ }
  }, [sortBy, sortRestored]);

  useEffect(() => {
    try {
      if (feedFilter) localStorage.setItem(FEED_FILTER_KEY, feedFilter);
      else localStorage.removeItem(FEED_FILTER_KEY);
    } catch { /* private mode */ }
  }, [feedFilter]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  // Hidden means a form or pin flow owns the screen; drop the query so
  // returning to the sheet is not filtered by something forgotten.
  useEffect(() => {
    if (hidden) setSearch('');
  }, [hidden]);

  const neighborhoodPulse = useNeighborhoodPulse(incidents);

  const neighborhoods = useMemo(() => {
    const seen = new Set<string>();
    for (const i of incidents) if (i.neighborhood) seen.add(i.neighborhood);
    return [...seen].sort();
  }, [incidents]);

  const neighborhoodResults = useMemo(() => {
    if (debouncedSearch.length < 2) return [];
    const q = debouncedSearch.toLowerCase();
    return neighborhoods.filter((n) => n.toLowerCase().includes(q)).slice(0, 3);
  }, [debouncedSearch, neighborhoods]);

  const filteredIncidents = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    const matching = incidents
      .filter((i) => isPubliclyVisible(i))
      .filter((i) => selectedCategory === 'all' || i.category === selectedCategory)
      .filter((i) =>
        feedFilter === 'community'
          ? !i.data_source || i.data_source === 'community'
          : feedFilter === 'recent'
            ? Date.now() - i.timestamp <= 2 * 60 * 60 * 1000
            : true,
      )
      .filter((i) =>
        !q ||
        i.title.toLowerCase().includes(q) ||
        (i.neighborhood || '').toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q),
      );
    return sortIncidents(matching, sortBy, userLocation);
  }, [incidents, selectedCategory, feedFilter, debouncedSearch, sortBy, userLocation]);

  const distanceFor = useCallback(
    (incident: Incident) =>
      userLocation ? getDistance(userLocation.lat, userLocation.lng, incident.lat, incident.lng) : null,
    [userLocation],
  );

  const hasActiveFilters = Boolean(feedFilter) || Boolean(search) || selectedCategory !== 'all';

  const clearAllFilters = useCallback(() => {
    setFeedFilter(null);
    setSearch('');
    onCategoryChange('all');
  }, [onCategoryChange]);

  const handleNeighborhood = useCallback(
    (name: string) => {
      setSearch('');
      onNeighbourhoodSelect(name);
    },
    [onNeighbourhoodSelect],
  );

  // Selection routes up to MapPage rather than reaching into the map, so a row
  // tap and a marker tap are the same code path and activeIncidentId is set
  // either way.
  const handleSelect = useCallback((incident: Incident) => onIncidentClick(incident), [onIncidentClick]);

  const translate = hidden
    ? '110%'
    : `calc(${isRaised ? '0px' : `${100 * RAISED_FRACTION}vh - ${RAIL_HEIGHT}px`} + ${offsetY}px)`;

  return (
    <section
      aria-label="Incident feed"
      aria-hidden={hidden || undefined}
      className="fixed inset-x-0 bottom-0 z-[50] flex flex-col lg:hidden"
      style={{
        height: `${RAISED_FRACTION * 100}vh`,
        background: P.paper,
        boxShadow: '0 -4px 12px rgba(11,31,51,0.16)',
        transform: `translateY(${translate})`,
        transition: isDragging || reducedMotion ? 'none' : 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)',
        pointerEvents: hidden ? 'none' : undefined,
      }}
    >
      {/* ── Masthead. Always the drag zone; touch-action is scoped here and
             nowhere else, which is the whole point of not using vaul. ──── */}
      <div
        {...headerHandlers}
        className="relative shrink-0 overflow-hidden"
        style={{ background: P.ground, touchAction: 'none' }}
      >
        <img
          src={publicAsset('images/illustration/calgary-bow-emblem.webp')}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-5 -top-6 h-32 w-32 select-none object-contain opacity-[0.18]"
          style={{ filter: 'invert(1)' }}
        />

        <div className="relative flex justify-center pt-2 pb-1.5">
          <div className="w-10 h-1" style={{ background: 'rgba(242,239,232,0.42)' }} />
        </div>

        {!isRaised ? (
          <div className="relative flex items-center justify-between px-4 pb-3">
            <button
              type="button"
              onClick={() => onStateChange('raised')}
              aria-label="Open the incident feed"
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            >
              <span className="relative flex h-2 w-2 items-center justify-center">
                <span className="absolute inset-0 animate-ping opacity-70" style={{ background: P.live }} />
                <span className="relative h-2 w-2" style={{ background: P.live }} />
              </span>
              <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.2em]" style={{ color: P.onGround }}>
                {feedCount} live report{feedCount !== 1 ? 's' : ''}
              </span>
            </button>
            {/* A sibling of the expand button, never nested inside it. Nesting
                interactive elements breaks keyboard and screen-reader
                behaviour — the same fix this codebase already made to the
                notification card in MapPage. */}
            <button
              type="button"
              onClick={onReportPress}
              className="ml-3 flex h-9 shrink-0 items-center gap-1.5 px-3.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none"
              style={{ background: P.onGround, color: P.ground, boxShadow: `4px 4px 0 ${P.accent}` }}
            >
              <Plus size={11} />
              Report
            </button>
          </div>
        ) : (
          <div className="relative flex items-end justify-between gap-3 px-4 pb-2.5">
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: P.eyebrow }}>
                51.05°N · 114.07°W
              </p>
              <h2 className="mt-1 font-display text-[21px] font-black uppercase leading-[0.9] tracking-[-0.035em]" style={{ color: P.onGround }}>
                Calgary Watch
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onStateChange('rail')}
              aria-label="Lower the feed"
              className="flex h-9 w-9 shrink-0 items-center justify-center"
              style={{ color: P.eyebrow }}
            >
              <ChevronDown size={18} />
            </button>
          </div>
        )}
      </div>

      {/* ── Search. Mounted at the rail as well as raised, so focus() can run
             synchronously inside the chrome's tap. ─────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 px-3 pt-2.5 pb-2">
        <div className="flex h-11 flex-1 items-center gap-2 px-3" style={{ background: P.card, border: `1.5px solid ${P.line}` }}>
          <Search size={15} className="shrink-0" style={{ color: P.soft }} />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => onStateChange('raised')}
            placeholder="Search reports or neighbourhoods…"
            aria-label="Search reports or neighbourhoods"
            className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
            style={{ color: P.ink }}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="shrink-0" style={{ color: P.soft }}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Category chips — the only copy in the app now. */}
      <div className="shrink-0 px-3 pb-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {CATEGORY_OPTIONS.map(({ id, label, Icon, color }) => {
            const count = id === 'all'
              ? incidents.filter((i) => isPubliclyVisible(i)).length
              : incidents.filter((i) => i.category === id && isPubliclyVisible(i)).length;
            const isSelected = selectedCategory === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onCategoryChange(id as IncidentCategory | 'all')}
                className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap border-[1.5px] px-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] transition-transform active:scale-[0.98]"
                style={isSelected
                  ? { background: color, borderColor: color, color: '#fff' }
                  : { background: P.paper, borderColor: P.line, color: P.soft }}
              >
                <Icon size={12} style={{ color: isSelected ? '#fff' : color }} />
                <span>{label}</span>
                <span
                  className="px-1 py-0.5 font-sans text-[10px] font-black tabular-nums tracking-normal"
                  style={isSelected ? { background: 'rgba(255,255,255,0.22)', color: '#fff' } : { background: P.card, color: P.soft }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters — raised only. */}
      {isRaised && (
        <div className="shrink-0 space-y-2 px-3 pb-3" style={{ borderBottom: `1px solid ${P.line}` }}>
          <div className="flex items-center justify-between gap-2">
            <label className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: P.soft }}>
              Sort
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="ml-2 h-7 cursor-pointer px-2 text-[10px] font-bold focus:outline-none"
                style={{ background: P.paper, border: `1.5px solid ${P.line}`, color: P.ink }}
              >
                <option value="nearest" disabled={!hasLocation}>
                  {hasLocation ? 'Nearest First' : 'Nearest (needs location)'}
                </option>
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="verified">Most Verified</option>
              </select>
            </label>
          </div>

          {onTimeWindowChange && timeWindow && (
            <div className="pb-1">
              <TimeWindowFilter value={timeWindow} onChange={onTimeWindowChange} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={feedFilter === 'community'}
              onClick={() => setFeedFilter((v) => (v === 'community' ? null : 'community'))}
              className="h-7 border-[1.5px] px-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] transition-transform active:scale-95"
              style={feedFilter === 'community'
                ? { background: 'rgba(46,139,122,0.14)', borderColor: 'rgba(46,139,122,0.45)', color: '#1F6D5F' }
                : { background: P.paper, borderColor: P.line, color: P.soft }}
            >
              Community only
            </button>
            <button
              type="button"
              aria-pressed={feedFilter === 'recent'}
              onClick={() => setFeedFilter((v) => (v === 'recent' ? null : 'recent'))}
              className="h-7 border-[1.5px] px-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] transition-transform active:scale-95"
              style={feedFilter === 'recent'
                ? { background: P.ink, borderColor: P.ink, color: P.paper }
                : { background: P.paper, borderColor: P.line, color: P.soft }}
            >
              Last 2 h
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="h-7 border-[1.5px] px-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] transition-transform active:scale-95"
                style={{ borderColor: P.line, color: '#8E2B23', background: P.paper }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Scrollable list. Drags only from scrollTop 0 and only downward. */}
      <div
        {...listHandlers}
        ref={scrollRef}
        className="flex-1 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] no-scrollbar"
        style={{
          overflowY: isRaised ? 'auto' : 'hidden',
          overscrollBehavior: 'contain',
        }}
      >
        {neighborhoodResults.length > 0 && (
          <div className="mb-2 mt-2">
            {neighborhoodResults.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => handleNeighborhood(name)}
                className="mb-1 flex w-full items-center gap-3 px-3 py-2.5 text-left"
                style={{ background: 'rgba(74,144,217,0.09)', border: `1.5px solid rgba(74,144,217,0.40)` }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-black" style={{ color: P.ink }}>{name}</span>
                  <span className="block text-[10px]" style={{ color: P.soft }}>Fly to area</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {isRaised && neighborhoodPulse.length > 0 && !debouncedSearch && (
          <div className="mb-2 py-3" style={{ borderBottom: `1px solid ${P.line}` }}>
            <div className="mb-2 flex items-center gap-1.5">
              <Activity size={12} style={{ color: MAP.ok }} />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: P.soft }}>
                Live area pulse · 2 h
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {neighborhoodPulse.map(({ name, count, level }) => {
                const cfg = RISK_CONFIG[level];
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleNeighborhood(name)}
                    className={cn('flex h-7 items-center gap-1.5 px-2.5 text-[10px] font-bold', cfg.bg)}
                    style={{ border: `1.5px solid ${P.line}` }}
                    title={`${count} incident${count !== 1 ? 's' : ''} in the last 2h`}
                  >
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', cfg.dot)} />
                    <span style={{ color: P.ink }}>{name}</span>
                    <span className={cn('font-black tabular-nums', cfg.text)}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <p className="mb-2 mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: P.soft }}>
          {filteredIncidents.length === 0
            ? 'No reports found'
            : `${filteredIncidents.length} report${filteredIncidents.length !== 1 ? 's' : ''}`}
        </p>

        {filteredIncidents.length > 0 ? (
          filteredIncidents.map((incident) => (
            <IncidentRow
              key={incident.id}
              incident={incident}
              distanceKm={distanceFor(incident)}
              isActive={activeIncidentId === incident.id}
              onSelect={handleSelect}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center space-y-3 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center" style={{ background: P.card, border: `1.5px solid ${P.line}` }}>
              <Search size={26} style={{ color: P.soft }} />
            </div>
            {hasActiveFilters ? (
              <>
                <div>
                  <p className="font-display text-base font-black uppercase tracking-[-0.02em]" style={{ color: P.ink }}>No reports match</p>
                  <p className="mt-1 text-xs" style={{ color: P.soft }}>Try clearing your filters or searching a different term.</p>
                </div>
                <button type="button" onClick={clearAllFilters} className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#2F6FB0' }}>
                  Clear all filters
                </button>
              </>
            ) : (
              <div>
                <p className="font-display text-base font-black uppercase tracking-[-0.02em]" style={{ color: P.ink }}>All clear right now</p>
                <p className="mt-1 max-w-[200px] text-xs" style={{ color: P.soft }}>No incidents in Calgary at the moment.</p>
              </div>
            )}
          </div>
        )}

        {hasMore && isRaised && filteredIncidents.length > 0 && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="mt-2 w-full py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ border: `1.5px solid ${P.line}`, background: P.paper, color: P.ink }}
          >
            {isLoadingMore ? 'Loading more…' : 'Load older reports'}
          </button>
        )}
      </div>

      {isRaised && (
        <div className="shrink-0 px-3 py-3" style={{ borderTop: `1px solid ${P.line}`, background: P.paper }}>
          <button
            type="button"
            onClick={onReportPress}
            className="flex h-12 w-[calc(100%-4px)] items-center justify-center gap-2 font-display text-[13px] font-black uppercase tracking-[0.02em] transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none"
            style={{ background: P.ground, color: P.onGround, boxShadow: `4px 4px 0 ${P.accent}` }}
          >
            <Plus size={15} />
            Report an incident
          </button>
        </div>
      )}
    </section>
  );
});

export default MobileMapSheet;
```

- [ ] **Step 2: Replace the `MobileMapSheet` import in `src/pages/MapPage.tsx`**

At `:10`, change:

```tsx
import MobileMapSheet, { SnapPoint } from '@/src/components/MobileMapSheet';
```

to:

```tsx
import MobileMapSheet, { type MapSheetRef } from '@/src/components/MobileMapSheet';
import type { SheetState } from '@/src/hooks/useSheetDrag';
```

- [ ] **Step 3: Replace the sheet state and add the ref**

At `:715`, change:

```tsx
const [sheetSnap, setSheetSnap] = useState<SnapPoint>('80px');
```

to:

```tsx
const [sheetState, setSheetState] = useState<SheetState>('rail');
const sheetRef = useRef<MapSheetRef>(null);
```

- [ ] **Step 4: Update the four plain collapse call sites**

At `:1085`, `:1736`, `:2620`, and `:3506`, replace `setSheetSnap('80px')` with `setSheetState('rail')`.

- [ ] **Step 5: Add the handler that routes sheet selection through the marker path**

Immediately after `handleSidebarIncidentClick` (around `:1076`), add:

```tsx
/**
 * A row tap in the mobile sheet.
 *
 * Routed through handleMarkerClick rather than the sheet reaching into the map
 * itself, so tapping a row and tapping its marker are one code path — which is
 * what makes activeIncidentId correct for both.
 */
const handleSheetIncidentClick = useCallback((incident: Incident) => {
  handleMarkerClick(incident);
  setSheetState('rail');
}, [handleMarkerClick]);

const handleSheetNeighbourhoodSelect = useCallback((name: string) => {
  handleViewNeighborhood(name);
  setSheetState('rail');
}, [handleViewNeighborhood]);
```

- [ ] **Step 6: Replace the sheet usage at `:2604-2624`**

```tsx
<MobileMapSheet
  ref={sheetRef}
  incidents={feedIncidents}
  feedCount={feedCount}
  timeWindow={timeWindow}
  onTimeWindowChange={setTimeWindow}
  selectedCategory={selectedCategory}
  onCategoryChange={setSelectedCategory}
  state={sheetState}
  onStateChange={setSheetState}
  userLocation={userLocation}
  hasMore={hasMoreIncidents}
  isLoadingMore={isLoadingMoreIncidents}
  onLoadMore={handleLoadMoreIncidents}
  onIncidentClick={handleSheetIncidentClick}
  onNeighbourhoodSelect={handleSheetNeighbourhoodSelect}
  onReportPress={() => {
    setSheetState('rail');
    setIsFormOpen(true);
  }}
  activeIncidentId={activeIncidentId}
  hidden={isFormOpen || isPinMode || isEmergencyPinMode}
/>
```

`feedCount` does not exist yet — Task 6 adds it. For this task, add a temporary definition directly above the `return` so the build passes, and Task 6 replaces it in place:

```tsx
const feedCount = feedIncidents.filter(
  (i) => selectedCategory === 'all' || i.category === selectedCategory,
).length;
```

- [ ] **Step 7: Force the sheet to the rail when a pin flow starts**

The old sheet self-collapsed on `isPinMode`. Add near the other effects (after `:1736`'s effect):

```tsx
// The sheet used to collapse itself when pin mode began. Ownership of sheet
// position now sits here, so the page does it.
useEffect(() => {
  if (isPinMode || isEmergencyPinMode) setSheetState('rail');
}, [isPinMode, isEmergencyPinMode]);
```

- [ ] **Step 8: Typecheck**

Run: `npm run lint`
Expected: errors only at `:2594`/`:2598` (the scrim still referencing `sheetSnap`) and `:2645` (the chrome button). Fix those two by pointing them at the new state for now — Task 6 rewrites both properly:

```tsx
{sheetState === 'raised' && (
```
```tsx
onClick={() => setSheetState('raised')}
```

Re-run `npm run lint`. Expected: clean.

- [ ] **Step 9: Confirm vaul is gone from this file**

Run: `grep -n "vaul\|Drawer\|SNAP_POINTS\|useDrawerOpen\|SnapPoint" src/components/MobileMapSheet.tsx src/pages/MapPage.tsx`
Expected: no output. If anything matches, remove it.

Then confirm vaul survives where it should: `grep -rn "from 'vaul'" src/`
Expected: only `src/components/AreaIntelligencePanel.tsx`.

- [ ] **Step 10: Run the whole suite**

Run: `npm test 2>&1 | tail -8`
Expected: `# fail 0`.

- [ ] **Step 11: Smoke the dev server**

Run: `npm run dev` and load `http://localhost:3000/map` in a narrow viewport (≤640px). Confirm: the rail shows a live count; tapping it raises the sheet; the chevron lowers it; dragging the masthead down lowers it; the list scrolls; tapping a row lowers the sheet and flies the map. Stop the server.

- [ ] **Step 12: Commit**

```bash
git add src/components/MobileMapSheet.tsx src/pages/MapPage.tsx
git commit -m "feat(map): two-state sheet on one row design, without vaul

The sheet stops reaching into the map: selection routes through
handleMarkerClick, so a row tap and a marker tap are one path and
activeIncidentId is finally correct for both. Retires the peek snap, the
second card design, useDrawerOpen and the visibility:hidden hack."
```

---

## Task 6: Chrome, scrim, and one count

**Files:**
- Modify: `src/pages/MapPage.tsx` — `getDistance` at `:36`; `filteredIncidentsCount` at `:1491`; scrim at `:2593`; chrome bar at `:2642`; chip row at `:2672`

**Interfaces:**
- Consumes: `getDistance` from `src/lib/geo.ts` (Task 1); `sheetRef` and `sheetState` (Task 5).
- Produces: no new exports. `filteredIncidentsCount` ceases to exist.

- [ ] **Step 1: Delete the local `getDistance` and import it**

Remove lines `:36-45` (the whole `function getDistance`). Add to the import block:

```tsx
import { getDistance } from '@/src/lib/geo';
```

- [ ] **Step 2: Replace `filteredIncidentsCount` with `feedCount`**

Delete the `filteredIncidentsCount` memo at `:1491`. Replace the temporary `feedCount` const from Task 5 Step 6 with a memo placed directly after the `feedIncidents` memo (`:1512`):

```tsx
/**
 * The one number the mobile feed reports.
 *
 * The value this replaces was derived from `incidents`, so it ignored both the
 * time window and the five-day decay — the chrome badge and the sheet's rail
 * could sit on screen together showing different totals for the same feed.
 */
const feedCount = useMemo(
  () => feedIncidents.filter((i) => selectedCategory === 'all' || i.category === selectedCategory).length,
  [feedIncidents, selectedCategory],
);
```

- [ ] **Step 3: Confirm nothing else referenced the deleted count**

Run: `grep -n "filteredIncidentsCount" src/`
Expected: no output.

- [ ] **Step 4: Measure the chrome and publish its height**

Add a ref and an effect near the other refs (after `:715`):

```tsx
const chromeRef = useRef<HTMLDivElement>(null);

/**
 * Publish the chrome's height so the tap-to-close scrim can start below it.
 *
 * The scrim used to be `top-0` with `bottom: 82vh`, which put it over the
 * chrome at every common phone height — a category chip, Home, and the
 * near-me button all collapsed the sheet instead of acting. The height is
 * measured rather than assumed because it varies with
 * env(safe-area-inset-top), and a hard-coded guess meeting a variable-height
 * element is exactly what caused the bug.
 */
useEffect(() => {
  const el = chromeRef.current;
  if (!el) return;
  const publish = () => {
    document.documentElement.style.setProperty('--cw-chrome-h', `${el.offsetHeight}px`);
  };
  publish();
  const observer = new ResizeObserver(publish);
  observer.observe(el);
  window.addEventListener('orientationchange', publish);
  return () => {
    observer.disconnect();
    window.removeEventListener('orientationchange', publish);
    document.documentElement.style.removeProperty('--cw-chrome-h');
  };
}, []);
```

- [ ] **Step 5: Attach the ref and raise the chrome above the scrim**

At `:2626`, the chrome wrapper becomes:

```tsx
<div
  ref={chromeRef}
  className={cn(
    'absolute inset-x-0 top-0 z-[51] px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-[#0B1F33] transition-all duration-200 pointer-events-none lg:hidden',
    (isPinMode || isEmergencyPinMode) && 'opacity-0 invisible -translate-y-4'
  )}
>
```

Only two things change: `ref={chromeRef}` is added and `z-30` becomes `z-[51]`.

- [ ] **Step 6: Re-geometry the scrim**

Replace the block at `:2593-2601`:

```tsx
{/* Tap-to-close: covers the exposed map only. It starts below the chrome —
    at top-0 it swallowed the chrome's own controls, so tapping Home or a
    category chip collapsed the sheet instead of acting. */}
{sheetState === 'raised' && (
  <div
    className="fixed inset-x-0 z-[49] cursor-pointer lg:hidden"
    style={{ top: 'var(--cw-chrome-h, 0px)', bottom: '82vh' }}
    onClick={() => setSheetState('rail')}
    aria-hidden="true"
  />
)}
```

- [ ] **Step 7: Make the chrome bar a real search entry point**

Replace the button's `onClick` at `:2645`:

```tsx
onClick={() => sheetRef.current?.raiseAndFocusSearch()}
```

and give it an honest label — add to the same element:

```tsx
aria-label="Search reports and open the feed"
```

- [ ] **Step 8: Point the bar's badge and label at `feedCount`**

Within that button, replace `{filteredIncidentsCount}` with `{feedCount}`, and replace both `mapIncidents.length` reads (the live dot at `:2650` and the sub-label at `:2662`) with `feedCount`, so the dot, the label and the badge describe one thing:

```tsx
<span className={cn('relative inline-flex h-2 w-2', feedCount > 0 ? 'bg-[#2E8B7A]' : 'bg-[#5A6B7D]')} />
```
```tsx
{feedCount === 0 ? 'Be first to report' : 'Tap to search the feed'}
```

- [ ] **Step 9: Delete the duplicate chip row**

Remove the entire `{/* One-tap category filter … */}` block at `:2672` through its closing `</div>`. The sheet holds the only copy now.

- [ ] **Step 10: Typecheck and run the suite**

Run: `npm run lint && npm test 2>&1 | tail -8`
Expected: no TS errors; `# fail 0`.

- [ ] **Step 11: Verify the desktop marker count is untouched**

Run: `grep -n "Map Markers" -A2 -B6 src/pages/MapPage.tsx`
Expected: still reads `{mapIncidents.length} Map Markers`. That one is correct — it counts markers, not feed rows.

- [ ] **Step 12: Commit**

```bash
git add src/pages/MapPage.tsx
git commit -m "fix(map): stop the scrim eating the chrome, and settle on one count

The tap-to-close target started at top-0 and reached 18vh, which covered
the chrome at every common phone height. It now starts below a measured
chrome height. The badge that ignored the time window is gone, the
category chips have one home, and the bar finally opens a focused field."
```

---

## Task 7: Verification and dead-code sweep

**Files:**
- Modify: `docs/superpowers/plans/2026-08-17-mobile-feed-restructure.md` (record results)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Confirm the full suite and typecheck are green**

Run: `npm run lint && npm test 2>&1 | tail -10`
Expected: no TS errors; `# fail 0`; total 284 (240 baseline + 44 added across Tasks 1-5, including fix-round extractions: clampOffset, exceedsDragSlop, shouldAutoResolveNearest).

- [ ] **Step 2: Sweep for orphaned symbols**

Run:

```bash
grep -rn "SnapPoint\|SNAP_POINTS\|useDrawerOpen\|filteredIncidentsCount\|sheetSnap" src/ || echo "clean"
grep -rn "from 'vaul'" src/
```

Expected: first prints `clean`; second lists only `AreaIntelligencePanel.tsx`.

- [ ] **Step 3: Confirm no new hex literals entered the changed files**

Run: `git diff main --stat && git diff main -- src/ | grep -E "^\+.*#[0-9A-Fa-f]{6}" | grep -v "tokens.ts"`

Review each hit. Values carried over verbatim from the old sheet (`#06162F`, `#F2EFE8`, `#AFC5DF`, `#7FDCC6`, the chip colours) are acceptable — they already existed. Anything genuinely new must move to `src/lib/tokens.ts`.

- [ ] **Step 4: Build the production bundle**

Run: `npm run build`
Expected: build and prerender both succeed. This is the check that catches a Vite-only resolution problem the dev server would tolerate.

- [ ] **Step 5: Device pass — record each result inline in this file**

Run `npm run dev` and open the map on a **physical device** (or at minimum a real iOS Safari, since the focus behaviour is the open question).

- [ ] **5a. iOS keyboard on first tap.** Tap the chrome search bar. The sheet raises *and* the keyboard appears, one tap. If the keyboard does not appear, record it — the field should still be visibly focused, and a second tap opens it. Do not mark this task complete without recording the actual outcome.
- [ ] **5b. Pin-drop flow (the important one).** From the raised sheet: tap Report → request a map pin → drop the pin → confirm every form input still responds. This is the regression that has returned three times (`5cc5d0b → b60d6fa → 8b3a5e1`); a failure here blocks the work.
- [ ] **5c. Scrim geometry.** With the sheet raised, tap Home (navigates), the near-me button (opens Near Me), and a category chip in the sheet (filters). None of them may collapse the sheet. Repeat at three viewport heights — 667, 844, and 915 px.
- [ ] **5d. Scroll versus drag.** Scroll the list mid-way: it scrolls and the sheet does not move. Return to the top and pull down: the sheet lowers.
- [ ] **5e. Reduced motion.** Enable Reduce Motion. State changes still work; the transform animation is gone.
- [ ] **5f. Counts agree.** At the rail, the chrome badge and the rail's "N live reports" show the same number. Change the time window and confirm both move together.
- [ ] **5g. Location denied.** Deny geolocation and reload. No distances appear in rows, "Nearest" is disabled in the sort control, and the feed defaults to newest.

- [ ] **Step 6: Commit the recorded results**

```bash
git add docs/superpowers/plans/2026-08-17-mobile-feed-restructure.md
git commit -m "docs(plan): record the mobile feed device verification results"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 State ownership | Task 5 (steps 2–7) |
| §2 Sheet mechanics / `useSheetDrag` | Task 3 |
| §3 `raiseAndFocusSearch`, iOS focus | Task 5 step 1; verified Task 7 step 5a |
| §4 Chrome, scrim geometry, counts | Task 6 |
| §5 `IncidentRow` | Task 4 |
| §6 Ordering, `resolveDefaultSort`, `formatDistance`, `geo` move | Tasks 1, 2; wired Task 5 step 1; `geo` deletion Task 6 step 1 |
| §7 Error handling — geolocation denied | Task 2 (`resolveDefaultSort`), Task 7 step 5g |
| §7 Error handling — `pointercancel` | Task 3 (`onPointerCancel` → `finish`) |
| §7 Error handling — reduced motion | Task 5 step 1 — **see note below** |
| §7 Error handling — empty states | Task 5 step 1 (both retained) |
| §7 Error handling — `hidden` mid-drag | Task 3 (`enabled: !hidden`), Task 5 step 1 |
| §8 Automated tests | Tasks 1, 2, 3 |
| §8 Device checklist | Task 7 step 5 |

**Two gaps found and fixed inline in Task 5 Step 1:**

1. **Reduced motion was specified but not implemented.** §7 requires `prefers-reduced-motion` to skip the animation; the `transition` only checked `isDragging`. A `reducedMotion` ref now gates it too.
2. **`travel` was computed in a `useMemo` keyed on `state`**, which neither used nor tracked the thing it depends on — it would have gone stale on rotation. Since `travel` is the denominator the 25% commit threshold is measured against, a stale value silently changes how far a drag must go. Now measured in state with `resize` and `orientationchange` listeners.

**Placeholder scan:** no TBD/TODO. Every code step carries real code. Task 4 has no automated test and says so explicitly rather than implying coverage.

**Type consistency:** `SheetState` is defined once in `useSheetDrag.ts` and imported by both the sheet and `MapPage`. `SortBy` is defined once in `feed.ts`. `resolveDragEnd` takes `DragEndInput` in both the hook and the test. `formatDistance` returns `string` everywhere. `IncidentRowProps.distanceKm` is `number | null` and the sheet's `distanceFor` returns `number | null`. `feedCount` is `number` in both files. `MapSheetRef.raiseAndFocusSearch` matches its `useImperativeHandle`.

**Known soft spot:** Task 5 Step 6 introduces `feedCount` as a plain const and Task 6 Step 2 promotes it to a memo. If the tasks are executed out of order, Task 6 will not find the const to replace — it should then simply add the memo and delete any duplicate.
