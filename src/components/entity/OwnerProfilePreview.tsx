import { Clock, Globe, MapPin, Phone, Mail, Tag } from "lucide-react";
import type { Business } from "../../types/discovery";
import { SOCIAL_NAMES, hoursLines, shortLink, todaysHours } from "../../lib/ownerProfileGuide";

/**
 * A small, honest picture of the public profile with the owner's unpublished
 * changes applied. Fields they changed carry a "New" mark so they can see
 * exactly what will move when they publish.
 */
export function OwnerProfilePreview({
  profile,
  changed,
  state,
  now = Date.now(),
}: {
  profile: Business;
  changed: Set<string>;
  state: "draft" | "live";
  now?: number;
}) {
  const today = todaysHours(profile.hours, now);
  const hours = hoursLines(profile.hours);
  const socials = Object.entries(profile.socials ?? {}).filter(([k, v]) => v && !(k === "website" && v === profile.website));
  const mark = (field: string) => (changed.has(field) ? <em className="ow-new">New</em> : null);
  const empty = (text: string) => <span className="ow-pv-empty">{text}</span>;
  return (
    <article className="ow-preview" aria-label="Preview of your public page">
      <header className="ow-pv-bar">
        <span>{state === "draft" ? "Preview with your changes" : "What visitors see now"}</span>
        <b data-state={state}>{state === "draft" ? "Not live yet" : "Live"}</b>
      </header>
      <div className="ow-pv-body">
        <h3>
          {profile.title || empty("Your business name")} {mark("title")}
        </h3>
        <p className="ow-pv-summary">
          {profile.summary || empty("Add a one-line intro so people know what you do.")} {mark("summary")}
        </p>
        {profile.offer ? (
          <p className="ow-pv-offer">
            <Tag size={15} aria-hidden="true" />
            <span>
              <strong>Offer</strong> {profile.offer}
            </span>
            {mark("offer")}
          </p>
        ) : null}
        <ul className="ow-pv-facts">
          <li>
            <Clock size={16} aria-hidden="true" />
            <span>
              {today.value ? (
                <>
                  <strong>{/^closed$/i.test(today.value) ? "Closed today" : `Today ${today.value}`}</strong>
                  {hours.length > 1 ? <small>{hours.join(" · ")}</small> : null}
                </>
              ) : hours.length ? (
                <small>{hours.join(" · ")}</small>
              ) : (
                empty("No hours yet")
              )}
            </span>
            {mark("hours")}
          </li>
          <li>
            <Phone size={16} aria-hidden="true" />
            <span>{profile.phone ? <a href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`}>{profile.phone}</a> : empty("No phone yet")}</span>
            {mark("phone")}
          </li>
          {profile.email ? (
            <li>
              <Mail size={16} aria-hidden="true" />
              <span>{profile.email}</span>
              {mark("email")}
            </li>
          ) : null}
          <li>
            <Globe size={16} aria-hidden="true" />
            <span>{profile.website ? shortLink(profile.website) : empty("No website yet")}</span>
            {mark("website")}
          </li>
          <li>
            <MapPin size={16} aria-hidden="true" />
            <span>{profile.address || empty("No address yet")}</span>
            {mark("address")}
          </li>
        </ul>
        {socials.length ? (
          <p className="ow-pv-socials">
            {socials.map(([k, v]) => (
              <span key={k} title={v}>
                {SOCIAL_NAMES[k] ?? k}
              </span>
            ))}
            {mark("socials")}
          </p>
        ) : null}
        {profile.services?.length ? (
          <p className="ow-pv-services">
            {profile.services.slice(0, 6).map((s) => (
              <span key={s}>{s}</span>
            ))}
            {mark("services")}
          </p>
        ) : null}
        {profile.description ? (
          <p className="ow-pv-desc">
            {profile.description} {mark("description")}
          </p>
        ) : null}
      </div>
    </article>
  );
}
