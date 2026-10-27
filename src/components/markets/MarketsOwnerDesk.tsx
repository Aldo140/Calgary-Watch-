import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { BadgeCheck, Check, Copy, Eye, Inbox, MapPinOff, Store, TriangleAlert } from 'lucide-react';
import type { DiscoveryEntity, Market, MarketOccurrence } from '../../types/discovery';
import { db } from '../../firebase';
import { useAuth } from '../FirebaseProvider';
import { adminReadCache } from '../../lib/readEfficiency';
import { entityPath } from '../../lib/discovery';
import { organizationClaimPath } from '../../lib/claimOrganization';
import { isOwnerVerified } from '../../lib/verified';
import { APPLICATIONS } from '../../lib/markets';
import { coordsApprox, daysUntil, monthDay, nextOpen, shortName } from '../../lib/marketDays';

const TTL = 10 * 60_000;
const STALE_DAYS = 10;

type Counts = Record<string, { views?: number; pending?: number }>;

/** Page views (all time) and pending vendor applications per market. Count queries: one read per thousand rows, cached for the session. */
function useMarketCounts(markets: readonly Market[], uid: string | undefined, enabled: boolean): Counts {
  const [counts, setCounts] = useState<Counts>({});
  const ids = markets.map(m => m.id).join(',');
  useEffect(() => {
    if (!enabled || !db || !uid) return;
    const database = db;
    let active = true;
    const put = (id: string, patch: Counts[string]) => { if (active) setCounts(c => ({ ...c, [id]: { ...c[id], ...patch } })); };
    for (const m of markets) {
      const path = entityPath(m);
      void adminReadCache.read(`${uid}:mk:views:${path}`, () => getCountFromServer(query(collection(database, 'page_views'), where('path', '==', path))).then(s => s.data().count), TTL)
        .then(views => put(m.id, { views }))
        .catch(() => undefined);
      void adminReadCache.read(`${uid}:mk:apps:${m.id}`, () => getCountFromServer(query(collection(database, APPLICATIONS), where('marketId', '==', m.id), where('status', '==', 'pending'))).then(s => s.data().count), TTL)
        .then(pending => put(m.id, { pending }))
        .catch(() => undefined);
    }
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, uid, ids]);
  return counts;
}

/**
 * Only an admin sees this: which markets are worth an outreach email next
 * (most viewed and unclaimed), where vendor applications are waiting, and
 * what the listing is missing. Everything else on /markets is public.
 */
export function MarketsOwnerDesk({ markets, all, occurrences, now }: { markets: readonly Market[]; all: readonly DiscoveryEntity[]; occurrences: readonly MarketOccurrence[]; now: Date }) {
  const { user, isAdmin } = useAuth();
  const counts = useMarketCounts(markets, user?.uid, isAdmin);
  const [copied, setCopied] = useState('');

  const rows = useMemo(() => markets.map(m => {
    const next = nextOpen(m, occurrences, now);
    const checked = Math.floor((now.getTime() - Date.parse(m.verifiedAt || m.updatedAt)) / 86_400_000);
    const gaps = [
      !next ? 'No dates ahead' : daysUntil(next.start, now) > 30 ? 'Next date 30+ days out' : null,
      coordsApprox(m) ? 'Pin is the neighbourhood' : null,
      !m.organizerEntityId ? 'No organizer profile' : null,
      checked >= STALE_DAYS ? `Checked ${checked}d ago` : null,
    ].filter((g): g is string => !!g);
    return { m, next, verified: isOwnerVerified(m), gaps, checked };
  }), [markets, occurrences, now]);

  if (!isAdmin) return null;

  const views = (id: string) => counts[id]?.views;
  const sorted = [...rows].sort((a, b) => (Number(a.verified) - Number(b.verified)) || ((views(b.m.id) ?? -1) - (views(a.m.id) ?? -1)));
  const total = (k: 'views' | 'pending') => rows.reduce((n, r) => n + (counts[r.m.id]?.[k] ?? 0), 0);
  const loaded = rows.every(r => counts[r.m.id]?.views !== undefined);
  const stale = rows.filter(r => r.checked >= STALE_DAYS).length;

  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 2200); } catch { /* clipboard blocked */ }
  };
  const pitch = (m: Market) => {
    const n = views(m.id);
    const seen = n ? `Your ${m.title} page on CalgaryWatch has been viewed ${n.toLocaleString('en-CA')} times. ` : `${m.title} is listed on CalgaryWatch. `;
    return `${seen}Claim it free to get the Verified badge, post your weekly vendor lineup and take vendor applications in one place: https://calgarywatch.ca${organizationClaimPath(m, all)}`;
  };

  return (
    <section className="mk-owner" aria-labelledby="mk-owner-title">
      <header className="mk-owner-head">
        <p className="mk-owner-tag"><Eye size={14} aria-hidden="true" /> Owner’s desk · only admins see this</p>
        <h2 id="mk-owner-title">Where markets need you next</h2>
        <p>Unclaimed first, most viewed at the top: that’s the outreach order. “Copy pitch” gives a line with the real view count and the claim link.</p>
      </header>
      <dl className="mk-owner-kpis">
        <div><dt>Market page views</dt><dd>{loaded ? total('views').toLocaleString('en-CA') : '…'}</dd><span>all time, every market page</span></div>
        <div><dt>Verified</dt><dd>{rows.filter(r => r.verified).length}<small>/{rows.length}</small></dd><span>claimed by the organizer</span></div>
        <div className={total('pending') ? 'is-hot' : undefined}><dt>Vendor applications</dt><dd>{total('pending')}</dd><span>waiting for a decision</span></div>
        <div className={stale ? 'is-warn' : undefined}><dt>Going stale</dt><dd>{stale}</dd><span>checked {STALE_DAYS}+ days ago; hidden at 14</span></div>
      </dl>
      <div className="mk-owner-table" role="region" aria-label="Every market" tabIndex={0}>
        <table>
          <thead><tr><th scope="col">Market</th><th scope="col">Views</th><th scope="col">Applications</th><th scope="col">Next date</th><th scope="col">Needs</th><th scope="col"><span className="cw-sr">Actions</span></th></tr></thead>
          <tbody>
            {sorted.map(({ m, next, verified, gaps }) => {
              const pending = counts[m.id]?.pending;
              return (
                <tr key={m.id}>
                  <th scope="row"><Link to={entityPath(m)}>{shortName(m)}</Link>{verified ? <span className="mk-owner-ok"><BadgeCheck size={13} aria-hidden="true" /> Verified</span> : <span className="mk-owner-no">Unclaimed</span>}</th>
                  <td data-label="Views">{views(m.id)?.toLocaleString('en-CA') ?? '…'}</td>
                  <td data-label="Applications">{pending ? <Link className="mk-owner-hot" to={`/organizer/${encodeURIComponent(m.id)}`}><Inbox size={13} aria-hidden="true" /> {pending} pending</Link> : pending === 0 ? '0' : '…'}</td>
                  <td data-label="Next date">{next ? monthDay.format(new Date(next.start)) : '—'}</td>
                  <td data-label="Needs">{gaps.length ? <ul className="mk-owner-gaps">{gaps.map(g => <li key={g}>{/Pin/.test(g) ? <MapPinOff size={12} aria-hidden="true" /> : <TriangleAlert size={12} aria-hidden="true" />}{g}</li>)}</ul> : <span className="mk-owner-ok"><Check size={13} aria-hidden="true" /> All set</span>}</td>
                  <td className="mk-owner-act">
                    {verified
                      ? <Link to={`/organizer/${encodeURIComponent(m.id)}`}><Store size={14} aria-hidden="true" /> Market HQ</Link>
                      : <button type="button" onClick={() => void copy(m.id, pitch(m))}>{copied === m.id ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied === m.id ? 'Copied' : 'Copy pitch'}</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mk-owner-foot">Claims are approved in <Link to="/admin">Admin</Link>. For a personal sign-up link, run <code>npm run claims:invite -- --entity &lt;id&gt; --email &lt;address&gt;</code>.</p>
    </section>
  );
}
