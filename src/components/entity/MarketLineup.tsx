import { Link } from 'react-router-dom';
import { ArrowUpRight, Store } from 'lucide-react';
import { usePublishedLineups, useVendors } from '../../lib/marketsApi';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import '../../styles/hq.css';

const fmt = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'long', month: 'long', day: 'numeric' });

/**
 * On a market's listing: the next published lineup from Market HQ (who's
 * coming, and the organizer's note), plus "Sell here?" for vendors. Two
 * small public reads; nothing renders until a lineup exists.
 */
export function MarketLineup({ marketId }: { marketId: string }) {
  const lineups = usePublishedLineups(marketId);
  const vendors = useVendors(lineups?.length ? marketId : undefined);
  const now = Date.now() - 12 * 3_600_000;
  const next = (lineups ?? []).filter((l) => Date.parse(l.start) >= now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
  const coming = next ? (vendors ?? []).filter((v) => next.vendorSlugs.includes(v.slug)).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)) : [];
  return (
    <>
      {next ? (
        <section className="hq-lineup" aria-labelledby="hq-lineup-title">
          <p className="pl-kicker">From the organizer</p>
          <h2 id="hq-lineup-title">Who’s at the market {fmt.format(new Date(next.start))}</h2>
          {next.note ? <p className="hq-lineup-note">“{next.note}”</p> : null}
          {coming.length ? (
            <ul>
              {coming.map((v) => (
                <li key={v.slug}>
                  <strong>{v.website ? <a href={v.website} target="_blank" rel="noopener noreferrer">{v.name}</a> : v.name}</strong>
                  <small>{[v.category, v.description].filter(Boolean).join(' · ')}{v.instagram ? ` · @${v.instagram}` : ''}</small>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      <aside className="cl-cta hq-sell">
        <p><Store size={16} aria-hidden="true" /> <strong>Sell here?</strong> Apply to the organizer in a couple of minutes.</p>
        <Link to={`/apply/${encodeURIComponent(marketId)}`}>Apply as a vendor <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </aside>
    </>
  );
}
