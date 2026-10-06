import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Mail, MapPin, Radio } from 'lucide-react';
import { BADGES, type BadgeState } from '../../lib/badges';
import { pickWhen, type PickItem } from '../../lib/eventPicks';
import { setupPercent, type EmailPlan, type NearReport, type SetupStep, type SetupStepId } from '../../lib/memberHome';
import { BadgeMark } from './BadgeMark';

const dayLabel = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'long', month: 'short', day: 'numeric' }).format(t);
const ago = (t: number, now: number) => {
  const m = Math.max(1, Math.round((now - t) / 60_000));
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/** Four numbers across the top, the same glance the email opens with. */
export function Glance({ near, nearReady, picks, going, badges, total }: {
  near: number; nearReady: boolean; picks: number; going: PickItem[]; badges: number; total: number;
}) {
  const tiles = [
    { tone: near ? 'coral' : 'green', n: nearReady ? near : '…', label: 'Near home', sub: nearReady ? (near ? 'Reported in the last 24 h' : 'All quiet, last 24 h') : 'Checking the map', href: '/map' },
    { tone: 'sun', n: picks, label: 'Picks for you', sub: 'Next 10 days', href: '#pl-picks-title' },
    { tone: 'cyan', n: going.length, label: 'You’re going', sub: going[0] ? `Next: ${pickWhen(going[0].start).split(' · ')[0]}` : 'Tap “I’m going”', href: going.length ? '#pl-going-title' : '#pl-picks-title' },
    { tone: 'navy', n: `${badges}/${total}`, label: 'Badges', sub: badges === total ? 'Every one. Nice.' : `${total - badges} left to earn`, href: '#pl-badges-title' },
  ];
  return (
    <div className="pl-glance" role="list">
      {tiles.map((t) => (
        <a key={t.label} href={t.href} className="pl-tile" data-tone={t.tone} role="listitem">
          <span className="pl-tile-n">{t.n}</span>
          <span className="pl-tile-l">{t.label}</span>
          <span className="pl-tile-s">{t.sub}</span>
        </a>
      ))}
    </div>
  );
}

/** Setup as a short checklist with a ring. Each step names the badge it earns. */
export function SetupCard({ steps, onAct, busy }: { steps: SetupStep[]; onAct: (id: SetupStepId) => void; busy: SetupStepId | null }) {
  const pct = setupPercent(steps);
  const [open, setOpen] = useState(pct < 100);
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const action: Record<SetupStepId, string> = { home: 'Add', monday: 'Turn on', events: 'Turn on', interests: 'Choose', plan: 'See picks', share: 'Add one' };
  return (
    <section className="pl-setup" aria-labelledby="pl-setup-title" data-complete={pct === 100}>
      <button type="button" className="pl-setup-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="pl-ring" style={{ ['--pct' as string]: `${pct}%` }} aria-hidden="true"><span>{pct}%</span></span>
        <span className="pl-setup-text">
          <span id="pl-setup-title" className="pl-setup-title">{pct === 100 ? 'All set up. Nice.' : `Your CalgaryWatch is ${pct}% set up`}</span>
          <span className="pl-setup-sub">{pct === 100 ? 'Every step done and every setup badge earned.' : next ? <>Next: <strong>{next.label.toLowerCase()}</strong>, {done} of {steps.length} done</> : null}</span>
        </span>
        <span className="pl-setup-toggle">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? (
        <ol className="pl-steps">
          {steps.map((s) => {
            const badge = BADGES.find((b) => b.id === s.badge)!;
            return (
              <li key={s.id} data-done={s.done} data-next={s === next}>
                <span className="pl-step-tick" aria-hidden="true">{s.done ? <Check size={14} strokeWidth={3} /> : null}</span>
                <span className="pl-step-text">
                  <strong>{s.label}</strong>
                  <small>{s.done ? `Earned ${badge.label}` : `${s.why} Earns ${badge.label}.`}</small>
                </span>
                <BadgeMark badge={{ ...badge, unlocked: s.done }} size={40} />
                {!s.done ? (
                  <button type="button" className="pl-step-go" disabled={busy === s.id} onClick={() => onAct(s.id)}>
                    {busy === s.id ? 'Adding…' : action[s.id]}
                  </button>
                ) : <span className="pl-step-done">Done</span>}
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}

/** What arrives and when, in the email's own words. */
export function EmailsCard({ plan, area, onEdit, onAdd, busy }: {
  plan: EmailPlan; area: string; onEdit: () => void; onAdd: (which: 'monday' | 'thursday') => void; busy: boolean;
}) {
  return (
    <section className="pl-card pl-mailcard" aria-labelledby="pl-mail-title" data-kind={plan.kind}>
      <p className="pl-kicker"><Mail size={13} aria-hidden="true" /> Your email</p>
      <h2 id="pl-mail-title" className="pl-mailcard-name">{plan.name}</h2>
      <p className="pl-mailcard-inside">{plan.inside}</p>
      {plan.next ? (
        <p className="pl-mailcard-next"><span>Next one</span> {dayLabel(plan.next)} · {plan.cadence.split(', ')[1]}</p>
      ) : null}
      {plan.kind === 'monday' ? (
        <div className="pl-mailcard-up">
          <p><strong>Add event picks?</strong> They’ll ride along inside the same Monday email{area ? `, near ${area} first` : ''}.</p>
          <button type="button" disabled={busy} onClick={() => onAdd('thursday')}>{busy ? 'Adding…' : 'Add picks'}</button>
        </div>
      ) : plan.kind === 'thursday' ? (
        <div className="pl-mailcard-up">
          <p><strong>Add safety near home?</strong> Your picks move to Monday and arrive with it, as one email.</p>
          <button type="button" disabled={busy} onClick={() => onAdd('monday')}>{busy ? 'Adding…' : 'Add safety'}</button>
        </div>
      ) : plan.kind === 'none' ? (
        <div className="pl-mailcard-up">
          <p><strong>Get your week by email.</strong> Free, one tap to stop.</p>
          <button type="button" disabled={busy} onClick={() => onAdd('monday')}>{busy ? 'Adding…' : 'Turn on'}</button>
        </div>
      ) : null}
      <button type="button" className="pl-textbtn" onClick={onEdit}>Change emails, area or interests</button>
    </section>
  );
}

/** Reports near home from the live map, newest first. Quiet is good news. */
export function NearHomeCard({ reports, ready, area, now }: { reports: NearReport[]; ready: boolean; area: string; now: number }) {
  return (
    <section className="pl-card pl-near" aria-labelledby="pl-near-title">
      <p className="pl-kicker"><Radio size={13} aria-hidden="true" /> Live · last 24 hours</p>
      <h2 id="pl-near-title" className="pl-side-title">Near {area || 'home'}</h2>
      {!ready ? <p className="pl-near-empty">Checking the live map…</p>
        : reports.length ? (
          <ul className="pl-near-list">
            {reports.slice(0, 4).map((r) => (
              <li key={r.id}>
                <Link to={`/map?i=${encodeURIComponent(r.id)}`}>
                  <span className="pl-near-dot" data-cat={r.category} aria-hidden="true" />
                  <span>
                    <strong>{r.title}</strong>
                    <small>{[r.neighborhood, r.distanceM !== null ? (r.distanceM < 1000 ? `${Math.max(100, Math.round(r.distanceM / 100) * 100)} m` : `${(r.distanceM / 1000).toFixed(1)} km`) : null, ago(r.timestamp, now)].filter(Boolean).join(' · ')}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="pl-near-empty"><Check size={16} aria-hidden="true" /> All quiet near {area || 'home'}. Nothing reported in the last day.</p>}
      <Link to="/map" className="pl-near-cta">Open the live map <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </section>
  );
}

/** The closest badge still to earn, with a bar, then the full set. */
export function BadgesCard({ badges, signedIn }: { badges: BadgeState[]; signedIn: boolean }) {
  const unlocked = badges.filter((b) => b.unlocked && signedIn).length;
  const next = signedIn ? [...badges].filter((b) => !b.unlocked).sort((a, b) => ((b.progress ?? 0) / (b.target ?? 1)) - ((a.progress ?? 0) / (a.target ?? 1)))[0] : undefined;
  return (
    <section className="pl-card" aria-labelledby="pl-badges-title">
      <h2 id="pl-badges-title" className="pl-side-title">Badges <span>{signedIn ? `${unlocked} of ${badges.length}` : `${badges.length} to collect`}</span></h2>
      {next ? (
        <div className="pl-nextbadge">
          <BadgeMark badge={next} size={52} />
          <div>
            <p className="pl-kicker">Next up</p>
            <strong>{next.label}</strong>
            <small>{next.hint}</small>
            {next.target ? (
              <span className="pl-bar" aria-label={`${next.progress ?? 0} of ${next.target}`}><span style={{ width: `${((next.progress ?? 0) / next.target) * 100}%` }} /></span>
            ) : null}
          </div>
        </div>
      ) : null}
      <ul className="pl-badges">
        {badges.map((b) => (
          <li key={b.id} data-locked={!b.unlocked || !signedIn}>
            <BadgeMark badge={{ ...b, unlocked: b.unlocked && signedIn }} size={56} />
            <strong>{b.label}</strong>
            <small>{b.unlocked && signedIn ? b.earned : b.hint}{b.target && signedIn && !b.unlocked ? ` ${b.progress}/${b.target}` : ''}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Plans as a short timeline: big dates, soonest first. */
export function GoingTimeline({ going }: { going: PickItem[] }) {
  if (!going.length) return null;
  return (
    <section className="pl-going" aria-labelledby="pl-going-title">
      <div className="pl-sec-head"><h2 id="pl-going-title">You’re going<span> · {going.length} plan{going.length === 1 ? '' : 's'}</span></h2></div>
      <ol className="pl-timeline">
        {going.map((g) => {
          const d = new Date(g.start);
          const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', ...o }).format(d);
          return (
            <li key={g.key}>
              <Link to={g.path}>
                <span className="pl-tl-date"><small>{fmt({ weekday: 'short' })}</small><strong>{fmt({ day: 'numeric' })}</strong><small>{fmt({ month: 'short' })}</small></span>
                <span className="pl-tl-body">
                  <strong>{g.title}</strong>
                  <small>{[pickWhen(g.start).split(' · ')[1], g.venue || g.neighbourhood].filter(Boolean).join(' · ')}</small>
                </span>
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="pl-fine"><MapPin size={12} aria-hidden="true" /> Each one comes back in your email as a reminder.</p>
    </section>
  );
}
