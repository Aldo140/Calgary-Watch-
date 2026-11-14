import { CalendarDays, MapPin, Ticket } from "lucide-react";
import type { Event } from "../../types/discovery";
import { shortLink } from "../../lib/ownerProfileGuide";
import { calgaryDateTimeFormat } from "../../lib/calgaryTz";

const dayFmt = calgaryDateTimeFormat("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Edmonton" });
const timeFmt = calgaryDateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "America/Edmonton" });
const time = (at: number) => timeFmt.format(at).replace(":00", "").replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase();

/** "Sat, Nov 22 · 7 pm – 10 pm", or a hint when the dates aren't set yet. */
export function eventWhen(start?: string, end?: string): string | undefined {
  const a = Date.parse(start ?? ""),
    b = Date.parse(end ?? "");
  if (!Number.isFinite(a)) return undefined;
  const sameDay = Number.isFinite(b) && dayFmt.format(a) === dayFmt.format(b);
  if (!Number.isFinite(b)) return `${dayFmt.format(a)} · ${time(a)}`;
  return sameDay ? `${dayFmt.format(a)} · ${time(a)} – ${time(b)}` : `${dayFmt.format(a)} ${time(a)} – ${dayFmt.format(b)} ${time(b)}`;
}

/** The event card visitors will see, with the owner's draft applied. */
export function OwnerEventPreview({
  event,
  changed,
  state,
  host,
}: {
  event: Partial<Event> & { title?: string; venue?: string; address?: string; summary?: string };
  changed: Set<string>;
  state: "draft" | "live" | "new";
  host: string;
}) {
  const when = eventWhen(event.start, event.end);
  const mark = (...fields: string[]) => (fields.some((f) => changed.has(f)) ? <em className="ow-new">New</em> : null);
  const empty = (text: string) => <span className="ow-pv-empty">{text}</span>;
  const price =
    event.pricing === "free"
      ? "Free"
      : event.priceRange && event.priceRange[1] > 0
        ? event.priceRange[0] === event.priceRange[1]
          ? `$${event.priceRange[0]}`
          : `$${event.priceRange[0]}–$${event.priceRange[1]}`
        : event.pricing === "paid"
          ? "Paid"
          : undefined;
  return (
    <article className="ow-preview ow-event-preview" aria-label="Preview of your event">
      <header className="ow-pv-bar">
        <span>{state === "new" ? "Your new event" : state === "draft" ? "Preview with your changes" : "What visitors see now"}</span>
        <b data-state={state === "live" ? "live" : "draft"}>{state === "live" ? "Live" : "Not live yet"}</b>
      </header>
      <div className="ow-pv-body">
        <p className="ow-pv-when">
          <CalendarDays size={16} aria-hidden="true" />
          <span>{when ?? empty("Pick a date and time")}</span>
          {mark("start", "end")}
          {event.cancelled ? <b className="ow-pv-cancel">Cancelled</b> : null}
        </p>
        <h3>
          {event.title || empty("Your event name")} {mark("title")}
        </h3>
        <p className="ow-pv-host">by {host}</p>
        {event.summary ? (
          <p className="ow-pv-summary">
            {event.summary} {mark("summary")}
          </p>
        ) : null}
        <ul className="ow-pv-facts">
          <li>
            <MapPin size={16} aria-hidden="true" />
            <span>
              {event.venue ? <strong>{event.venue}</strong> : null}
              {event.address ? <small>{event.address}</small> : event.venue ? null : empty("Add where it happens")}
            </span>
            {mark("venue", "address")}
          </li>
          <li>
            <Ticket size={16} aria-hidden="true" />
            <span>
              {price ? <strong>{price}</strong> : <small>Price not listed</small>}
              {event.tickets ? <small>Tickets: {shortLink(event.tickets)}</small> : null}
            </span>
            {mark("pricing", "priceRange", "tickets")}
          </li>
        </ul>
      </div>
    </article>
  );
}
