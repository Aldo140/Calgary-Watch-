import { incidentVisibility, type Incident } from '@/src/types';

export type AdminSourceFilter =
  | 'all'
  | 'community'
  | 'official'
  | 'example'
  | 'anonymous'
  | 'hidden'
  | 'images';

/**
 * Seeder and ingestion identities are not resident accounts. Older example
 * rows used `data_source: community`, so the author identity is part of this
 * check until every historical row has been relabelled.
 */
const NON_RESIDENT_AUTHORS = new Set(['system', 'seed', 'demo', 'community']);

/** Accept legacy numeric, Firestore Timestamp, and {seconds} date shapes. */
export function coerceAdminIncidentTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object') {
    const timestamp = value as { toMillis?: () => number; seconds?: number };
    if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
    if (typeof timestamp.seconds === 'number') return timestamp.seconds * 1000;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/**
 * Older submissions may predate the current `timestamp` field. Admin history
 * must still retain and sort them instead of silently dropping them through an
 * orderBy query, which only returns documents containing that field.
 */
export function adminIncidentTimestamp(incident: Record<string, unknown>): number {
  return coerceAdminIncidentTimestamp(incident.timestamp)
    || coerceAdminIncidentTimestamp(incident.createdAt)
    || coerceAdminIncidentTimestamp(incident.created_at)
    || coerceAdminIncidentTimestamp(incident.submittedAt);
}

export function isResidentSubmission(
  incident: Pick<Incident, 'data_source' | 'authorUid'>,
): boolean {
  const communitySource = !incident.data_source || incident.data_source === 'community';
  // Missing authorUid is a legacy resident record, not permission to destroy
  // it. Only an explicit synthetic identity makes a community-shaped row
  // non-resident.
  return communitySource && !NON_RESIDENT_AUTHORS.has(incident.authorUid ?? '');
}

export function isAdminExampleIncident(
  incident: Pick<Incident, 'data_source' | 'authorUid'>,
): boolean {
  return incident.data_source === 'demo'
    || (incident.data_source === 'community'
      && (incident.authorUid === 'seed' || incident.authorUid === 'demo' || incident.authorUid === 'community'));
}

/** Real submissions are retained permanently; moderation may only hide them. */
export function canPermanentlyDeleteIncident(
  incident: Pick<Incident, 'data_source' | 'authorUid'>,
): boolean {
  return !isResidentSubmission(incident);
}

/** API/system records are reproducible operational data, not resident history. */
export function isOperationalIncident(
  incident: Pick<Incident, 'data_source' | 'authorUid'>,
): boolean {
  return !isAdminExampleIncident(incident) && !isResidentSubmission(incident);
}

/**
 * Examples live in their own admin tab even though their public presentation
 * remains anonymous. In particular, they never inflate All, Community, or
 * Anonymous results.
 */
export function matchesAdminSourceFilter(
  incident: Pick<Incident, 'data_source' | 'authorUid' | 'anonymous' | 'image_url' | 'visibility' | 'deleted' | 'flagged'>,
  filter: AdminSourceFilter,
): boolean {
  const isExample = isAdminExampleIncident(incident);
  switch (filter) {
    case 'all': return !isExample;
    case 'community': return isResidentSubmission(incident);
    case 'official': return isOperationalIncident(incident);
    case 'example': return isExample;
    case 'anonymous': return isResidentSubmission(incident) && Boolean(incident.anonymous);
    case 'hidden': return isResidentSubmission(incident) && incidentVisibility(incident) !== 'public';
    case 'images': return isResidentSubmission(incident) && Boolean(incident.image_url);
  }
}
