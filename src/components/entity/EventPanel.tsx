import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarPlus, Check, Clock, MapPin, Share2, Tag, Ticket, User } from 'lucide-react';
import type { DiscoveryEntity, Event } from '../../types/discovery';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { googleCalendarUrl, icsFile } from '../../lib/calendarFile';
import { interestLabel, interestsFor, pickWhen, type EventInterestId } from '../../lib/eventPicks';
import { entityPath } from '../../lib/discovery';
import { GoingButton } from '../plans/GoingButton';
import '../../styles/plans.css';

const day = calgaryDateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
const time = calgaryDateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit' });

/**
 * The "plan it" block on an event page: the facts a person checks before
 * going, and the three things they do next (say they're going, put it in a
 * calendar, send it to someone). Then a few more like it, so a visit that
 * ends here has somewhere to go.
 */
export function EventPanel({ entity, all, part = 'both' }: { entity: Event; all: readonly DiscoveryEntity[]; part?: 'plan' | 'more' | 'both' }) {
  const [shared, setShared] = useState(false);
  const past = Date.parse(entity.end) <= Date.now();
  const url = `https://calgarywatch.ca${entityPath(entity)}`;
  // The address line under the venue, without repeating the venue's own name.
  const venue = entity.venue || '';
  const address = (entity.address || '').split(',').map((p) => p.trim()).filter((p) => p && p !== 'Calgary' && p !== venue).join(', ');
  const where = [address, entity.neighbourhood].filter(Boolean).join(' · ');
  const sameDay = day.format(new Date(entity.start)) === day.format(new Date(entity.end));
  const cal = { id: entity.id, title: entity.title, start: entity.start, end: entity.end, location: [entity.venue, entity.address].filter(Boolean).join(', '), description: entity.summary, url };
  const interests: EventInterestId[] = interestsFor(entity).filter((i) => i !== 'free');
  const price = entity.cancelled ? 'Cancelled' : entity.pricing === 'free' ? 'Free' : entity.priceRange ? `$${entity.priceRange[0]}${entity.priceRange[1] !== entity.priceRange[0] ? `–$${entity.priceRange[1]}` : ''}` : entity.pricing === 'paid' ? 'Ticketed, see organizer' : 'Check with the organizer';

  const more = all
    .filter((e): e is Event => e.kind === 'event' && e.id !== entity.id && !e.cancelled && Date.parse(e.end) > Date.now())
    .map((e) => ({ e, score: interestsFor(e).filter((i) => interests.includes(i)).length * 2 + (e.neighbourhood && e.neighbourhood === entity.neighbourhood ? 1 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(a.e.start) - Date.parse(b.e.start))
    .slice(0, 3)
    .map((x) => x.e);

  const download = () => {
    const blob = new Blob([icsFile(cal)], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${entity.slug}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: entity.title, text: `${entity.title}, ${pickWhen(entity.start)}`, url });
      else { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2500); }
    } catch { /* dismissed */ }
  };

  return (
    <>
      {part !== 'more' ? <section className="cw-evp" aria-label="Plan it">
        <dl className="cw-evp-facts">
          <div><dt><Clock size={16} aria-hidden="true" /> When</dt><dd>{day.format(new Date(entity.start))}<span>{time.format(new Date(entity.start))}{entity.endTimeEstimated ? '' : ` – ${sameDay ? '' : `${day.format(new Date(entity.end))}, `}${time.format(new Date(entity.end))}`} · Calgary time</span></dd></div>
          {venue || where ? <div><dt><MapPin size={16} aria-hidden="true" /> Where</dt><dd>{venue || entity.neighbourhood || entity.address}{where && where !== (venue || entity.neighbourhood) ? <span>{where}</span> : null}</dd></div> : null}
          <div><dt><Tag size={16} aria-hidden="true" /> Price</dt><dd>{price}</dd></div>
          <div><dt><User size={16} aria-hidden="true" /> Organizer</dt><dd>{entity.organizer}</dd></div>
        </dl>
        {entity.cancelled ? <p className="cw-evp-cancelled">The organizer has cancelled this event.</p> : past ? <p className="cw-evp-cancelled">This event has finished.</p> : (
          <div className="cw-evp-actions">
            {!entity.developmentOnly ? <GoingButton eventId={entity.id} start={entity.start} /> : null}
            <div className="cw-evp-row">
              <button type="button" onClick={download}><CalendarPlus size={17} aria-hidden="true" /> Add to calendar</button>
              <a href={googleCalendarUrl(cal)} target="_blank" rel="noopener noreferrer">Google Calendar</a>
              <button type="button" onClick={() => void share()}>{shared ? <Check size={17} aria-hidden="true" /> : <Share2 size={17} aria-hidden="true" />} {shared ? 'Link copied' : 'Share'}</button>
              {entity.tickets ? <a className="cw-evp-tickets" href={entity.tickets} target="_blank" rel="noopener noreferrer"><Ticket size={17} aria-hidden="true" /> Tickets from organizer</a> : null}
            </div>
          </div>
        )}
        {interests.length ? <p className="cw-evp-tags">{interests.map((i) => <Link key={i} to={`/events?filter=${i === 'outdoors' ? 'outdoor' : i === 'learning' ? 'talks' : i}`}>{interestLabel(i)}</Link>)}</p> : null}
      </section> : null}

      {part !== 'plan' && more.length ? (
        <section className="cw-evp-more" aria-labelledby="cw-evp-more-title">
          <h2 id="cw-evp-more-title">More like this</h2>
          <ul>
            {more.map((e) => (
              <li key={e.id}><Link to={entityPath(e)}><time dateTime={e.start}>{pickWhen(e.start)}</time><strong>{e.title}</strong><span>{e.venue || e.neighbourhood}</span><ArrowUpRight size={17} aria-hidden="true" /></Link></li>
            ))}
          </ul>
          <p><Link to="/plans">Get picks like these every Thursday</Link></p>
        </section>
      ) : null}
    </>
  );
}
