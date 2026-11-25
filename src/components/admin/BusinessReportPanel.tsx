import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { discoveryRepository } from '../../data/discovery';
import { businessReport, type ListingStatus } from '../../lib/businessReport';
import { entityPath } from '../../lib/discovery';
import { Chip, Panel, StatGrid, StatTile, T, inputClass, inputStyle, mono } from './ui';

const STATUS: Record<ListingStatus, { label: string; tone: 'neutral' | 'signal' | 'attention' | 'ok' }> = {
  'white-pages': { label: 'White pages', tone: 'attention' },
  live: { label: 'Live', tone: 'neutral' },
  verified: { label: 'Verified', tone: 'ok' },
  featured: { label: 'Featured', tone: 'signal' },
};

const day = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Edmonton' }) : '';

/**
 * Every business we carry, including the ones waiting in the white pages,
 * filed by trade, with who owns which niche and when each Featured spot ends.
 */
export function BusinessReportPanel() {
  const report = useMemo(() => businessReport(discoveryRepository.claimable()), []);
  const [trade, setTrade] = useState('');
  const [status, setStatus] = useState<'' | ListingStatus>('');
  const [needle, setNeedle] = useState('');
  const shown = useMemo(() => report.listings.filter(l => (!trade || l.trade === trade) && (!status || l.status === status)
    && (!needle || `${l.title} ${l.trade} ${l.email ?? ''}`.toLowerCase().includes(needle.toLowerCase()))), [report, trade, status, needle]);
  const t = report.totals;
  const openNiches = report.trades.filter(r => r.total >= 3 && !r.featured.length);
  return (
    <div className="space-y-4">
      <StatGrid>
        <StatTile label="Businesses listed" value={t.businesses} hint={`${t.withEmail} with an email on file`} />
        <StatTile label="In the white pages" value={t.whitePages} tone="attention" hint="Unclaimed: search rows only" />
        <StatTile label="Owner verified" value={t.verified} tone="ok" hint="Approved claims" />
        <StatTile label="Featured partners" value={t.featured} tone="signal" hint={`${openNiches.length} trades with 3+ listings and no owner`} />
      </StatGrid>

      <Panel title="Featured partners" subtitle="Who owns which searches, paid or trial, and when each spot ends. A spot switches itself off at its end date.">
        {report.featured.length ? <ul className="divide-y" style={{ borderColor: T.line }}>
          {report.featured.map(f => (
            <li key={f.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="min-w-0 flex-1 text-sm font-semibold" style={{ color: T.ink }}>{f.title} <span className="font-normal" style={{ color: T.muted }}>· {f.trade}</span></span>
              <Chip tone={f.plan === 'paid' ? 'ok' : 'neutral'}>{f.plan ?? 'plan not set'}</Chip>
              <Chip>{f.niches.length ? `Owns: ${f.niches.join(', ')}` : 'No niche set'}</Chip>
              <Chip tone={!f.active ? 'neutral' : f.daysLeft === null ? 'attention' : f.daysLeft <= 14 ? 'attention' : 'ok'}>
                {!f.active ? `Ended ${day(f.until)}` : f.until ? `Ends ${day(f.until)} · ${f.daysLeft} days` : 'No end date'}
              </Chip>
            </li>
          ))}
        </ul> : <p className="text-sm" style={{ color: T.muted }}>No Featured partners yet.</p>}
      </Panel>

      <Panel title="Trades" subtitle="Service listings share one category, so they're filed by their trade. Open niches with demand are the next Featured pitches." padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[0.68rem] uppercase" style={{ color: T.muted, fontFamily: mono }}>
              <th className="px-4 py-2">Trade</th><th className="px-2 py-2 text-right">Listed</th><th className="px-2 py-2 text-right">White pages</th><th className="px-2 py-2 text-right">Verified</th><th className="px-4 py-2">Niche owner</th>
            </tr></thead>
            <tbody>{report.trades.map(r => (
              <tr key={r.trade} className="border-t" style={{ borderColor: T.line }}>
                <td className="px-4 py-2"><button type="button" className="font-semibold hover:underline" style={{ color: T.signal }} onClick={() => setTrade(r.trade)}>{r.trade}</button></td>
                <td className="px-2 py-2 text-right tabular-nums">{r.total}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.whitePages || ''}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.verified || ''}</td>
                <td className="px-4 py-2">{r.featured.length ? r.featured.map(f => f.title).join(', ') : <span style={{ color: T.muted }}>Open · <Link className="underline" to={`/search?q=${encodeURIComponent(r.trade)}`} target="_blank">see search</Link></span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Panel>

      <Panel title="All listings" subtitle="Including the white-pages ones you can't open from the site." padded={false}>
        <div className="grid gap-2 px-4 pt-3 sm:grid-cols-3">
          <input className={inputClass} style={inputStyle} type="search" value={needle} onChange={e => setNeedle(e.target.value)} placeholder="Name, trade or email" aria-label="Find a listing" />
          <select className={inputClass} style={inputStyle} value={trade} onChange={e => setTrade(e.target.value)} aria-label="Trade"><option value="">All trades</option>{report.trades.map(r => <option key={r.trade} value={r.trade}>{r.trade} ({r.total})</option>)}</select>
          <select className={inputClass} style={inputStyle} value={status} onChange={e => setStatus(e.target.value as ListingStatus | '')} aria-label="Status"><option value="">Any status</option>{(Object.keys(STATUS) as ListingStatus[]).map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}</select>
        </div>
        <p className="px-4 pt-2 text-xs" style={{ color: T.muted }} role="status">{shown.length} of {report.listings.length}</p>
        <ul className="divide-y" style={{ borderColor: T.line }}>
          {shown.slice(0, 200).map(l => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
              <span className="min-w-0 flex-1 text-sm"><span className="font-semibold" style={{ color: T.ink }}>{l.title}</span> <span style={{ color: T.muted }}>· {l.trade}{l.listedAt ? ` · listed ${day(l.listedAt)}` : ''}</span></span>
              <Chip tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Chip>
              <span className="flex gap-3 text-xs font-semibold" style={{ color: T.signal }}>
                {l.status === 'white-pages' ? <Link to={`/claim/${encodeURIComponent(l.id)}`} target="_blank">Claim page</Link> : <Link to={entityPath({ kind: 'business', slug: l.slug })} target="_blank">Profile</Link>}
                {l.website ? <a href={l.website} target="_blank" rel="noreferrer">Site ↗</a> : null}
              </span>
            </li>
          ))}
        </ul>
        {shown.length > 200 ? <p className="px-4 py-2 text-xs" style={{ color: T.muted }}>Showing the first 200. Narrow by trade or status.</p> : null}
      </Panel>
    </div>
  );
}
