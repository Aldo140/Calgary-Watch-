/**
 * The attention queue.
 *
 * The old console spread work across eight tabs: flagged content lived in one,
 * unreviewed reports in another, API failures in a third, and nothing told you
 * a data feed had gone quiet. An admin had to go looking for work to discover
 * they had any.
 *
 * This merges every condition that needs a human into one ranked list, with the
 * action attached to the row. If it is empty, the desk is genuinely clear —
 * that is the whole promise, so nothing cosmetic is ever allowed in here.
 */

import { AlertOctagon, CheckCircle2, Eye, EyeOff, RotateCcw, ShieldQuestion, Trash2, WifiOff, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Incident } from '@/src/types';
import type { ApiHealth } from '@/src/hooks/useAdminData';
import { AdminButton, Chip, EmptyState, Panel, StatusDot, T, TimeAgo, display, type Tone } from './ui';

/** How long the ingest may go quiet before it counts as a problem. */
const STALE_INGEST_MS = 3 * 60 * 60 * 1000;

type QueueItem = {
  id: string;
  rank: number;
  tone: Tone;
  icon: React.ElementType;
  kind: string;
  title: string;
  detail?: string;
  ts?: number;
  actions?: React.ReactNode;
};

export function AttentionQueue({
  flagged,
  pendingReview,
  apiHealths,
  incidents,
  onRestore,
  onDelete,
  onApprove,
  onHide,
  restoringId,
  deletingId,
}: {
  flagged: Incident[];
  pendingReview: Incident[];
  apiHealths: ApiHealth[];
  incidents: Incident[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
  onHide: (id: string) => void;
  restoringId: string | null;
  deletingId: string | null;
}) {
  const items: QueueItem[] = [];

  // 1. Flagged content — hidden from the public map, waiting on a decision.
  for (const incident of flagged) {
    items.push({
      id: `flag-${incident.id}`,
      rank: 0,
      tone: 'critical',
      icon: AlertOctagon,
      kind: 'Flagged',
      title: incident.title,
      detail: `${incident.neighborhood} · hidden from the map`,
      ts: incident.flagged_at ?? incident.timestamp,
      actions: (
        <>
          <AdminButton
            size="sm"
            variant="outline"
            tone="ok"
            onClick={() => onRestore(incident.id)}
            disabled={restoringId === incident.id}
          >
            <RotateCcw size={13} /> {restoringId === incident.id ? 'Restoring' : 'Restore'}
          </AdminButton>
          <AdminButton
            size="sm"
            variant="outline"
            tone="critical"
            onClick={() => onDelete(incident.id)}
            disabled={deletingId === incident.id}
          >
            <Trash2 size={13} /> Delete
          </AdminButton>
        </>
      ),
    });
  }

  // 2. API failures — the map is quietly missing a layer until this is fixed.
  for (const api of apiHealths) {
    if (api.status !== 'error' && api.status !== 'slow') continue;
    items.push({
      id: `api-${api.id}`,
      rank: api.status === 'error' ? 1 : 3,
      tone: api.status === 'error' ? 'critical' : 'attention',
      icon: api.status === 'error' ? WifiOff : Zap,
      kind: api.status === 'error' ? 'Feed down' : 'Feed slow',
      title: api.name,
      detail:
        api.status === 'error'
          ? (api.error ?? 'Not responding')
          : `Responded in ${api.responseMs}ms`,
      ts: api.lastChecked ?? undefined,
    });
  }

  // 3. Ingest gone quiet — no scheduled record has landed in hours.
  const newestSystem = incidents
    .filter((i) => i.authorUid === 'system')
    .reduce((max, i) => Math.max(max, i.timestamp), 0);
  if (newestSystem > 0 && Date.now() - newestSystem > STALE_INGEST_MS) {
    items.push({
      id: 'ingest-stale',
      rank: 2,
      tone: 'attention',
      icon: WifiOff,
      kind: 'Ingest quiet',
      title: 'No new official records in over 3 hours',
      detail: 'The scheduled ingest may have stopped. Check the Actions tab on GitHub.',
      ts: newestSystem,
    });
  }

  // 4. Reports awaiting a look.
  for (const incident of pendingReview) {
    items.push({
      id: `pending-${incident.id}`,
      rank: 4,
      tone: 'attention',
      icon: ShieldQuestion,
      kind: 'Unreviewed',
      title: incident.title,
      detail: `${incident.neighborhood} · ${incident.name}`,
      ts: incident.timestamp,
      // Triage is a two-way decision, so both answers live on the row. Hiding
      // is reversible — it drops the report from the map without destroying it.
      actions: (
        <>
          <AdminButton size="sm" variant="outline" tone="ok" onClick={() => onApprove(incident.id)}>
            <CheckCircle2 size={13} /> Approve
          </AdminButton>
          <AdminButton size="sm" variant="outline" tone="attention" onClick={() => onHide(incident.id)}>
            <EyeOff size={13} /> Hide
          </AdminButton>
        </>
      ),
    });
  }

  items.sort((a, b) => a.rank - b.rank || (b.ts ?? 0) - (a.ts ?? 0));

  const critical = items.filter((i) => i.tone === 'critical').length;
  const shown = items.slice(0, 12);

  return (
    <Panel
      title="Needs attention"
      subtitle={
        items.length === 0
          ? 'Everything that would need a human is clear.'
          : `${items.length} open · ranked by urgency`
      }
      action={
        items.length > 0 ? (
          <Chip tone={critical > 0 ? 'critical' : 'attention'} mono>
            <StatusDot tone={critical > 0 ? 'critical' : 'attention'} pulse />
            {critical > 0 ? `${critical} urgent` : `${items.length}`}
          </Chip>
        ) : (
          <Chip tone="ok">
            <StatusDot tone="ok" /> Clear
          </Chip>
        )
      }
      padded={false}
    >
      {items.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={26} />}
          title="Desk is clear"
          body="No flagged content, no unreviewed reports, and every data feed is answering. New work will appear here first."
        />
      ) : (
        <ul className="divide-y divide-[#E4E2DC]">
          {shown.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id} className="p-3 flex items-start gap-3">
                <span
                  className="mt-0.5 h-7 w-7 shrink-0 grid place-items-center rounded-lg"
                  style={{
                    background: `${item.tone === 'critical' ? T.critical : T.attention}14`,
                    color: item.tone === 'critical' ? T.critical : T.attention,
                  }}
                >
                  <Icon size={15} />
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Chip tone={item.tone}>{item.kind}</Chip>
                    <TimeAgo ts={item.ts} />
                  </div>
                  <p
                    className="text-[0.88rem] font-semibold mt-1 leading-snug break-words"
                    style={{ color: T.ink, fontFamily: display }}
                  >
                    {item.title}
                  </p>
                  {item.detail && (
                    <p className="text-xs mt-0.5 leading-snug break-words" style={{ color: T.muted }}>
                      {item.detail}
                    </p>
                  )}
                  {item.actions && <div className="flex gap-1.5 mt-2 flex-wrap">{item.actions}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {items.length > shown.length && (
        <div className="px-3 py-2.5 border-t" style={{ borderColor: T.line }}>
          <Link
            to="/admin/incidents"
            className="inline-flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: T.signal }}
          >
            <Eye size={13} /> {items.length - shown.length} more in the full list
          </Link>
        </div>
      )}
    </Panel>
  );
}
