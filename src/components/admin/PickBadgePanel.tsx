/**
 * Earned links for the Pick desks (docs/cw-picks.md). Every listed company can
 * put the "Listed on CalgaryWatch" badge on its site, linking to its desk. The
 * link is what helps the desk rank for "best <trade> Calgary" and get cited in
 * AI answers; the badge says listed, never Pick, until a company is vetted.
 */
import { useMemo, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { allShelves, pickDeskPath } from '@/src/lib/cwPicks';
import { deskIndexable } from '@/src/lib/pickSeo';
import type { DiscoveryEntity } from '@/src/types/discovery';
import { Chip, Panel, T } from './ui';

const ORIGIN = 'https://calgarywatch.ca';

export function badgeHtml(serviceId: string, label: string): string {
  return `<a href="${ORIGIN}${pickDeskPath(serviceId)}" title="${label} in Calgary on CalgaryWatch"><img src="${ORIGIN}/badges/listed-on-calgarywatch.svg" alt="Listed on CalgaryWatch: ${label} in Calgary" width="260" height="72" loading="lazy"></a>`;
}

export function badgeNote(company: string, serviceId: string, label: string): string {
  return `Hi ${company} team,\n\nYou're listed on CalgaryWatch's ${label.toLowerCase()} page for Calgary: ${ORIGIN}${pickDeskPath(serviceId)}\n\nIt's free and never paid for. Calgarians call you straight from it. If you'd like to show it on your site, here's a badge that links to your listing:\n\n${badgeHtml(serviceId, label)}\n\nAnd if anything about you there is out of date, reply and we'll fix it.\n\nCalgaryWatch`;
}

export function PickBadgePanel({ entities }: { entities: readonly DiscoveryEntity[] }) {
  const shelves = useMemo(() => allShelves(entities).filter(s => s.contenders.length), [entities]);
  const [copied, setCopied] = useState('');
  const copy = (key: string, text: string) => { void navigator.clipboard?.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1600); };
  return (
    <Panel title="Earn links: the Listed badge" subtitle="Links from listed companies' own sites are what push a desk up for “best plumber Calgary” and get it quoted by AI answers. Copy the note or the badge code for each company. It says Listed, never Pick." padded={false}>
      <div className="px-4 py-3 border-t flex items-center gap-3" style={{ borderColor: T.line }}>
        <img src="/badges/listed-on-calgarywatch.svg" alt="Listed on CalgaryWatch badge" width={195} height={54} />
        <span className="text-xs" style={{ color: T.muted }}>What companies put on their site. It links to their service desk.</span>
      </div>
      <ul>{shelves.map(s => (
        <li key={s.service.id} className="px-4 py-3 border-t" style={{ borderColor: T.line }}>
          <div className="flex flex-wrap items-center gap-2">
            <strong>{s.service.label}</strong>
            {deskIndexable(s) ? <Chip tone="ok">Indexed</Chip> : <Chip>{s.service.best ? 'Ranks via Best list' : 'Not indexed yet'}</Chip>}
            <a className="text-xs inline-flex items-center gap-1 ml-auto" style={{ color: T.signal }} href={pickDeskPath(s.service.id)} target="_blank" rel="noreferrer">Desk <ExternalLink size={12} /></a>
          </div>
          <ul className="mt-2 grid gap-1">{s.contenders.map(c => (
            <li key={c.key} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{c.name}</span>
              {c.website ? <a className="text-xs" style={{ color: T.muted }} href={c.website} target="_blank" rel="noreferrer">{c.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a> : null}
              <span className="ml-auto flex gap-3 text-xs">
                <button type="button" className="inline-flex items-center gap-1" style={{ color: T.signal }} onClick={() => copy(`n-${s.service.id}-${c.key}`, badgeNote(c.name, s.service.id, s.service.label))}><Copy size={12} /> {copied === `n-${s.service.id}-${c.key}` ? 'Copied' : 'Copy note'}</button>
                <button type="button" className="inline-flex items-center gap-1" style={{ color: T.signal }} onClick={() => copy(`b-${s.service.id}-${c.key}`, badgeHtml(s.service.id, s.service.label))}><Copy size={12} /> {copied === `b-${s.service.id}-${c.key}` ? 'Copied' : 'Badge code'}</button>
              </span>
            </li>
          ))}</ul>
        </li>
      ))}</ul>
    </Panel>
  );
}
