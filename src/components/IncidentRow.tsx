import { memo } from 'react';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { CATEGORY_ICONS, type Incident } from '@/src/types';
import { categoryColor } from '@/src/lib/tokens';
import { formatDistance } from '@/src/lib/format';
import { shortAgo } from '@/src/lib/nowBriefing';
import { cn } from '@/src/lib/utils';
import '@/src/styles/map-feed.css';

export interface IncidentRowProps {
  incident: Incident;
  /** Kilometres from the reader, or null when their location is unknown. */
  distanceKm: number | null;
  isActive: boolean;
  onSelect: (incident: Incident) => void;
  /**
   * `row` (default) is the phone sheet's compact line. `card` is the desktop
   * rail's report card: same anatomy, plus a two-line description and the
   * reporter's first name.
   */
  variant?: 'row' | 'card';
  /** A reporter's photo, shown as a thumbnail. */
  photoUrl?: string;
  /** Clock for the "New" tag; defaults to render time. */
  now?: number;
}

const NEW_MS = 30 * 60 * 1000;

/** Official and pipeline rows are public sources; everything else a neighbour posted. */
function isPublicSource(incident: Incident): boolean {
  return incident.data_source === 'official' || incident.data_source === 'system';
}

function reporterFirstName(incident: Incident): string {
  const raw = incident.name?.trim() || 'Community Member';
  const anonymous = Boolean(incident.anonymous) || raw.toLowerCase().includes('anonymous');
  return anonymous ? 'Anonymous' : (raw.split(/\s+/)[0] || 'Neighbour');
}

/** Where a report came from, in the words a resident would use. */
export function incidentSourceLabel(incident: Incident, withReporter = false): string {
  if (isPublicSource(incident)) {
    const name = incident.source_name?.trim() || 'Public source';
    const more = (incident.related_sources?.length ?? 0) - 1;
    return more > 0 ? `${name} +${more}` : name;
  }
  if (incident.source_type === 'news_rss') return incident.source_name?.trim() || 'News';
  if (incident.source_type === 'reddit_calgary') return 'Reddit';
  return withReporter ? `Neighbour · ${reporterFirstName(incident)}` : 'Neighbour';
}

/**
 * How much to trust a report, in calm words. Public-source rows are stamped
 * `community_confirmed` by the pipeline, which is not a neighbour confirming
 * anything, so they read as their source instead.
 */
export function credibilityLabel(incident: Incident): { label: string; tone: 'quiet' | 'several' | 'confirmed' | 'source' } {
  if (isPublicSource(incident)) return { label: 'Public source', tone: 'source' };
  switch (incident.verified_status) {
    case 'community_confirmed': return { label: 'Confirmed', tone: 'confirmed' };
    case 'multiple_reports': return { label: 'Multiple reports', tone: 'several' };
    case 'pending_review': return { label: 'Under review', tone: 'quiet' };
    default: return { label: 'Unverified', tone: 'quiet' };
  }
}

/**
 * One report, one shape, shared by the phone sheet and the desktop rail.
 *
 * Severity reads through the category bar and icon tile, never through card
 * height, so a wind warning and a break-in occupy the same space and the list
 * stays scannable. Emergencies keep red, but as an edge and a tag rather than
 * a flooded block.
 */
function IncidentRowBase({
  incident,
  distanceKm,
  isActive,
  onSelect,
  variant = 'row',
  photoUrl,
  now = Date.now(),
}: IncidentRowProps) {
  const Icon = CATEGORY_ICONS[incident.category] ?? AlertCircle;
  const colour = categoryColor(incident.category);
  const isEmergency = incident.category === 'emergency';
  const isCard = variant === 'card';
  const isNew = now - incident.timestamp >= 0 && now - incident.timestamp < NEW_MS;
  const cred = credibilityLabel(incident);

  const meta = [
    shortAgo(incident.timestamp, now),
    distanceKm === null ? '' : formatDistance(distanceKm),
    incident.neighborhood || 'Calgary',
    incidentSourceLabel(incident, isCard),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      onClick={() => onSelect(incident)}
      aria-current={isActive ? 'true' : undefined}
      className={cn('lv-feed-row', isCard && 'lv-feed-row--card', isEmergency && 'is-emergency', isActive && 'is-active')}
      style={{ ['--lv-cat' as string]: colour }}
    >
      <span className="lv-feed-row-bar" aria-hidden="true" />

      <span className="lv-feed-row-icon" aria-hidden="true">
        <Icon size={isCard ? 18 : 16} strokeWidth={2} />
      </span>

      <span className="lv-feed-row-body">
        <span className="lv-feed-row-title">{incident.title}</span>
        <span className="lv-feed-row-meta">{meta}</span>
        {isCard && incident.description && <span className="lv-feed-row-desc">{incident.description}</span>}
        <span className="lv-feed-row-tags">
          {isEmergency && <span className="lv-feed-tag lv-feed-tag-emergency">Emergency</span>}
          <span className={cn('lv-feed-tag', `lv-feed-tag-${cred.tone}`)}>{cred.label}</span>
          {isNew && <span className="lv-feed-tag lv-feed-tag-new">New</span>}
        </span>
      </span>

      {photoUrl ? (
        <img className="lv-feed-row-photo" src={photoUrl} alt="" loading="lazy" />
      ) : (
        !isCard && <ChevronRight size={16} className="lv-feed-row-chev" aria-hidden="true" />
      )}
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
