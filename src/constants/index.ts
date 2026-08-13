export const CALGARY_CENTER = {
  lng: -114.0719,
  lat: 51.0447,
};

/**
 * The single source of truth for incident categories.
 *
 * Everything downstream derives from this list: the `IncidentCategory` type,
 * the report form's zod enum, the admin dropdowns and category chart, and the
 * Firestore rules enum. `tests/category-contract.test.ts` asserts that
 * firestore.rules still matches — if you add a category here and the rules are
 * not regenerated, that test fails rather than writes being rejected in
 * production.
 */
export const INCIDENT_CATEGORIES = [
  { value: 'emergency', label: 'Emergency', color: '#dc2626' }, // red-600
  { value: 'crime', label: 'Crime', color: '#ef4444' }, // red-500
  { value: 'traffic', label: 'Traffic', color: '#f97316' }, // orange-500
  { value: 'infrastructure', label: 'Infrastructure', color: '#3b82f6' }, // blue-500
  { value: 'weather', label: 'Weather', color: '#a855f7' }, // purple-500
] as const;

/** Category values accepted on new reports, in display order. */
export const INCIDENT_CATEGORY_VALUES = INCIDENT_CATEGORIES.map((c) => c.value) as unknown as readonly [
  'emergency',
  'crime',
  'traffic',
  'infrastructure',
  'weather',
];

/**
 * Categories that no longer appear in the UI but still exist on old documents.
 *
 * These stay in the Firestore rules enum on purpose. The admin update rule
 * revalidates `category` on every write, so dropping a legacy value here would
 * make any surviving document carrying it permanently uneditable and
 * un-moderatable.
 */
export const LEGACY_INCIDENT_CATEGORIES = ['gas'] as const;

/** Every category the Firestore rules must accept: active + legacy. */
export const ALL_ACCEPTED_CATEGORIES = [
  ...INCIDENT_CATEGORY_VALUES,
  ...LEGACY_INCIDENT_CATEGORIES,
] as const;

export const CREDIBILITY_STATUSES = [
  { value: 'unverified', label: 'Unverified', color: '#94a3b8' }, // slate-400
  { value: 'multiple_reports', label: 'Multiple Reports', color: '#facc15' }, // yellow-400
  { value: 'community_confirmed', label: 'Community Confirmed', color: '#22c55e' }, // green-500
] as const;
