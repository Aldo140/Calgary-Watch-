import '../../styles/member-visit.css';
import { ArrowUpRight, Ticket } from 'lucide-react';
import type { MemberVisit } from '../../data/memberVisits';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';

const day = calgaryDateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

/** The member-visit note on an organizer's /local profile. Renders only for a visit that happened. */
export function MemberVisitCard({ visit, name }: { visit: MemberVisit; name: string }) {
  if (!visit.attended) return null;
  const when = day.format(new Date(`${visit.on}T12:00:00-06:00`));
  return (
    <section className="mv" data-reveal aria-labelledby="mv-title">
      <p className="mv-kicker">{visit.partnerLabel}</p>
      <h2 id="mv-title" className="mv-title">A CalgaryWatch member was there</h2>
      <p className="mv-when"><Ticket size={15} aria-hidden="true" />{visit.event} · {when} · {visit.venue}</p>
      <ul className="mv-about">
        {visit.about.map(line => <li key={line}>{line}</li>)}
      </ul>
      {visit.impressions.length ? (
        <div className="mv-notes">
          <p className="mv-label">From our member</p>
          {visit.impressions.map(p => <p key={p}>{p}</p>)}
        </div>
      ) : null}
      <div className="mv-rec">
        <p className="mv-label">Our recommendation</p>
        <p>{visit.recommendation}</p>
        {visit.next ? <a className="lp-btn lp-btn-sun" href={visit.next.url} target="_blank" rel="noopener noreferrer">{visit.next.label}<ArrowUpRight size={16} aria-hidden="true" /></a> : null}
      </div>
      <p className="mv-foot">
        Details come from {name}’s own published information{visit.sources.length > 1 ? ' and press' : ''}:{' '}
        {visit.sources.map((s, i) => <span key={s.url}>{i ? ', ' : ''}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></span>)}.
        {' '}This is a partnership, not paid advertising.
      </p>
    </section>
  );
}
