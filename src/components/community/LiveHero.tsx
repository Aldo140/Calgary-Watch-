import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, Map as MapIcon, Plus, Search, ShieldCheck } from 'lucide-react';
import { INCIDENT_CATEGORIES } from '../../constants';
import { timeAgo, type ExampleReport } from '../../lib/homeClaims';
import type { LivePulse } from '../../hooks/useLivePulse';
import { COLOR, CityMap } from './CityMap';

const clock = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' });
const label = (c: string) => INCIDENT_CATEGORIES.find(x => x.value === c)?.label ?? c;

/** Shown only when there are no real reports to show, and always labelled as examples. */
const EXAMPLES: ExampleReport[] = [
  { id: 'ex1', title: 'Car break-in, glass on the street', neighborhood: 'Inglewood', category: 'crime', timestamp: 0, source: 'Neighbour report' },
  { id: 'ex2', title: 'Road closed after a collision', neighborhood: 'Beltline', category: 'traffic', timestamp: 0, source: 'City of Calgary' },
  { id: 'ex3', title: 'Power out on several blocks', neighborhood: 'Bowness', category: 'infrastructure', timestamp: 0, source: 'ENMAX' },
  { id: 'ex4', title: 'Bike stolen from a garage', neighborhood: 'Kensington', category: 'crime', timestamp: 0, source: 'Neighbour report' },
];


function ReportCard({ r, now, real }: { r: ExampleReport; now: number; real: boolean }) {
  return (
    <div className="lh-card">
      <i style={{ background: COLOR[r.category] ?? '#00c2e0' }} />
      <div>
        <small>{label(r.category)}{r.neighborhood ? ` · ${r.neighborhood}` : ''}</small>
        <b>{r.title}</b>
        <em>{r.source ?? 'Report'}{real ? ` · ${timeAgo(r.timestamp, now)}` : ''}</em>
      </div>
    </div>
  );
}

function Phone({ cards, pins, now, real }: { cards: ExampleReport[]; pins: ExampleReport[]; now: number; real: boolean }) {
  return (
    <div className="lh-phone" aria-hidden="true">
      <span className="lh-btn lh-btn-a" /><span className="lh-btn lh-btn-b" /><span className="lh-btn lh-btn-c" />
      <div className="lh-screen">
        <div className="lh-status"><span>{clock.format(now || Date.now())}</span><span className="lh-island" /><span className="lh-bars"><i /><i /><i /><i /></span></div>
        <div className="lh-appbar">
          <span className="lh-brand"><span className="lh-dot" />CalgaryWatch Live</span>
          <span className="lh-search"><Search size={13} /> Search a neighbourhood</span>
        </div>
        <div className="lh-map">
          <CityMap pins={pins} className="lh-city" quads={false} viewBox="140 140 170 130" />
          <span className="lh-you"><span /></span>
        </div>
        <div className="lh-sheet">
          <p>{real ? 'Latest in Calgary' : 'Example reports'}</p>
          {cards.slice(0, 2).map(r => <ReportCard key={r.id} r={r} now={now} real={real} />)}
          {!real ? <div className="lh-backed"><ShieldCheck size={14} /> Backed by 3 neighbours</div> : null}
        </div>
        <div className="lh-tabs">
          <span className="on"><MapIcon size={17} />Map</span>
          <span className="lh-plus"><Plus size={20} /></span>
          <span><Bell size={17} />Alerts</span>
        </div>
      </div>
      <span className="lh-glare" />
    </div>
  );
}

/** Community Watch hero: the live city map, the app on a phone, reports landing around it. */
export function LiveHero({ pulse, views }: { pulse: LivePulse; views: string }) {
  const { status, total, capped, recent = [], checkedAt } = pulse.reports;
  const now = checkedAt ?? 0;
  const real = recent.filter(r => r.title);
  const hasReal = real.length > 0;
  const cards = hasReal ? real : EXAMPLES;
  const floating = cards.slice(2, 5).length ? cards.slice(2, 5) : cards.slice(0, 2);
  const hoods = new Set(real.map(r => r.neighborhood).filter(Boolean)).size;

  return (
    <section className="lh" aria-labelledby="cm-title">
      <div className="lh-bg" aria-hidden="true">
        <CityMap pins={recent} className="lh-bgmap" labels={false} quads={false} />
      </div>
      <div className="cw-wrap lh-grid">
        <div className="lh-copy">
          <p className="lh-kicker"><span className="lh-live"><span />Live</span>Calgary crime watch · Community Watch</p>
          <h1 id="cm-title">Crime and safety reports from your neighbours, <span>on one map.</span></h1>
          <p className="lh-lead">Calgarians post what they see, next to updates from Calgary Police, the City and Environment Canada. Open the map to see what’s happening near you right now.</p>
          <div className="lh-ctas">
            <Link className="lh-cta lh-cta-primary" to="/map">Open the live map <ArrowUpRight size={18} /></Link>
            <Link className="lh-cta" to="/map?report=true"><Plus size={18} /> Post a report</Link>
          </div>
          <dl className="lh-stats">
            {status === 'ready' ? <div><dt>Reports, last 24 h</dt><dd>{total}{capped ? '+' : ''}</dd></div> : <div><dt>Cost</dt><dd>Free</dd></div>}
            {hoods ? <div><dt>Neighbourhoods</dt><dd>{hoods}</dd></div> : null}
            <div><dt>Views from Calgarians</dt><dd>{views}</dd></div>
          </dl>
        </div>

        <div className="lh-stage">
          <div className="lh-glow" aria-hidden="true" />
          <Phone cards={cards} pins={recent} now={now} real={hasReal} />
          <div className="lh-floats" aria-hidden="true">
            {floating.map((r, i) => (
              <div key={r.id} className={`lh-float lh-float-${i}`} style={{ animationDelay: `${0.5 + i * 0.7}s, ${1.4 + i * 0.7}s` }}>
                <span className="lh-float-tag">{hasReal ? 'New report' : 'Example'}</span>
                <ReportCard r={r} now={now} real={hasReal} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {hasReal ? <div className="lh-ticker" aria-label="Latest reports">
        <div className="lh-ticker-track">
          {[0, 1].map(copy => (
            <span key={copy} aria-hidden={copy === 1}>
              {real.slice(0, 12).map(r => `${label(r.category)} · ${r.title}${r.neighborhood ? ` · ${r.neighborhood}` : ''}`).map((t, i) => (
                <b key={i}><i />{t}</b>
              ))}
            </span>
          ))}
        </div>
      </div> : <div className="lh-ticker-spacer" />}
    </section>
  );
}
