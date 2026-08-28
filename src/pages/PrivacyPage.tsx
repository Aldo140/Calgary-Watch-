/**
 * Privacy policy.
 *
 * Written against what the code actually does rather than from a template. The
 * data tables below are an inventory of every collection the client writes to
 * and every third party a page contacts; if you add either, update this page in
 * the same change.
 *
 * Not legal advice and not reviewed by counsel. It is an accurate description of
 * the system, which is the part a lawyer would otherwise have to reconstruct.
 */

import { Link } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';

const UPDATED = '28 August 2026';
const CONTACT = 'jorti104@mtroyal.ca';

const T = {
  paper: '#F7F3EA',
  panel: '#FFFDF8',
  ink: '#1C2B3A',
  inkSoft: '#5A6B7D',
  line: '#D9D2C3',
  bow: '#2E8B7A',
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2
        className="font-display text-[1.35rem] font-extrabold tracking-[-0.02em] sm:text-[1.6rem]"
        style={{ color: T.ink }}
      >
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed" style={{ color: T.inkSoft }}>
        {children}
      </div>
    </section>
  );
}

function DataTable({
  caption,
  rows,
}: {
  caption: string;
  rows: { what: string; why: string; kept: string }[];
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border" style={{ borderColor: T.line, background: T.panel }}>
      <table className="w-full min-w-[34rem] border-collapse text-left text-[13.5px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {['What we store', 'Why', 'How long'].map((h) => (
              <th
                key={h}
                className="border-b px-3.5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{ borderColor: T.line, color: T.inkSoft }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.what} className="border-b last:border-0" style={{ borderColor: T.line }}>
              <td className="px-3.5 py-3 font-semibold align-top" style={{ color: T.ink }}>{r.what}</td>
              <td className="px-3.5 py-3 align-top" style={{ color: T.inkSoft }}>{r.why}</td>
              <td className="px-3.5 py-3 align-top" style={{ color: T.inkSoft }}>{r.kept}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: T.paper }}>
      <header className="border-b" style={{ borderColor: T.line }}>
        <div className="mx-auto flex max-w-[52rem] items-center gap-3 px-5 py-4 sm:px-8">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[13px] font-bold transition-opacity hover:opacity-70"
            style={{ color: T.inkSoft }}
          >
            <ArrowLeft size={15} /> Calgary Watch
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[52rem] px-5 py-10 sm:px-8 sm:py-14">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em]" style={{ color: T.bow }}>
          Privacy
        </p>
        <h1
          className="mt-3 font-display font-extrabold tracking-[-0.03em] leading-[1.05]"
          style={{ color: T.ink, fontSize: 'clamp(2rem, 5vw, 3rem)' }}
        >
          What we collect, and what we do with it.
        </h1>
        <p className="mt-4 text-[15.5px] leading-relaxed" style={{ color: T.inkSoft }}>
          Calgary Watch is a free, non-profit community safety map. We do not sell personal
          information, we do not run advertising, and we do not track you across other websites.
          This page describes exactly what the service stores. Last updated {UPDATED}.
        </p>

        <div className="mt-12 space-y-12">
          <Section id="account" title="If you create an account">
            <p>
              Signing in uses Google. We never see or store your Google password. Google returns
              your name, email address and profile photo, which we store so reports can be
              attributed and so administrators can contact you about a report.
            </p>
            <DataTable
              caption="Account information"
              rows={[
                { what: 'Name, email address, profile photo', why: 'Attribute your reports; contact you about them', kept: 'Until you ask us to delete your account' },
                { what: 'Account role and sign-up date', why: 'Decide who can moderate', kept: 'Until account deletion' },
                { what: 'Weekly digest preference and the date you gave it', why: 'Only send email you asked for, and be able to show you asked', kept: 'Until you change it' },
                { what: 'A random unsubscribe token', why: 'Let the link in a digest email work without signing in', kept: 'Until account deletion' },
                { what: 'A record of each digest sent to you, and of any unsubscribe request', why: 'Avoid sending the same issue twice; prove a withdrawal was honoured', kept: 'Indefinitely, as a compliance record' },
                { what: 'A reply you send to a Calgary Watch email, including sender, subject, message text and attachment names', why: 'Let approved administrators read and respond to subscriber feedback', kept: 'Up to 180 days' },
                { what: 'Administrator notes about you', why: 'Record moderation decisions', kept: 'Until account deletion' },
              ]}
            />
          </Section>

          <Section id="reports" title="When you file a report">
            <p>
              A report is public the moment you submit it. Anyone can read its title, description,
              category, neighbourhood and map location without signing in. Please do not include
              anything in a report you would not want read publicly.
            </p>
            <DataTable
              caption="Report information"
              rows={[
                { what: 'Title, description, category, neighbourhood', why: 'The report itself', kept: 'Indefinitely, unless you delete it' },
                { what: 'Map coordinates you chose', why: 'Place the pin', kept: 'Indefinitely, unless you delete it' },
                { what: 'Your first name, or "Anonymous"', why: 'Attribution on the public map', kept: 'Indefinitely, unless you delete it' },
                { what: 'Your email address, stored separately', why: 'Moderation and abuse handling only', kept: 'Until account deletion' },
                { what: 'A photo, if you attach one', why: 'Show what was reported', kept: 'Until the report is deleted' },
              ]}
            />
          </Section>

          <Section id="anonymous" title='What "anonymous" actually means'>
            <p>
              Choosing to post anonymously hides your name from the public map and the public feed.
              It does <strong style={{ color: T.ink }}>not</strong> hide you from us. Your account
              identifier and email address are still recorded against the report, stored in an
              administrator-only area, and used if a report has to be investigated for abuse or is
              the subject of a legal request.
            </p>
            <p>
              We say this plainly because "anonymous" is easy to misread. If you need to report
              something without any record connecting it to you, do not use this service — contact
              the relevant agency directly, or use Crime Stoppers.
            </p>
          </Section>

          <Section id="others" title="Reporting about other people">
            <p>
              Reports frequently concern places and, sometimes, people. Do not post names, licence
              plates, phone numbers or other details identifying a private individual, and avoid
              photographing faces, licence plates or house numbers where you can. Report what
              happened and where, not who you believe did it.
            </p>
            <p>
              Content that identifies a private individual, or that accuses someone of a crime, may
              be removed. Two community flags hide a report from the map pending review, and
              administrators can remove content permanently.
            </p>
          </Section>

          <Section id="visitors" title="If you only look at the map">
            <p>
              We record a small analytics event per page view. It carries no name, no account and
              no advertising identifier, and it is not shared with anyone.
            </p>
            <DataTable
              caption="Analytics"
              rows={[
                { what: 'Page path and timestamp', why: 'Know which pages are used', kept: 'Indefinitely, in aggregate' },
                { what: 'Referring website — hostname only', why: 'Know how people find us', kept: 'Indefinitely, in aggregate' },
                { what: 'Campaign tags from a shared link', why: 'Measure outreach', kept: 'Indefinitely, in aggregate' },
                { what: 'A random per-tab session id', why: 'Count visits rather than clicks', kept: 'Cleared when you close the tab' },
              ]}
            />
            <p>
              We deliberately do not record search keywords. A full referring URL can carry the
              terms someone searched, so we store only the hostname.
            </p>
            <p>
              If you allow location access, your position is used in your browser to centre the map
              and sort reports by distance. It is never sent to us or stored.
            </p>
          </Section>

          <Section id="traffic-flow" title="Traffic flow and public cameras">
            <p>
              The traffic-flow layer is designed around roads, not people. When a live aggregate
              provider is configured, Calgary Watch stores road-segment speeds, counts, confidence,
              timestamps and road geometry. It rejects records containing device, trip, licence-plate,
              face or vehicle identifiers. Until then, the layer is clearly labelled as an annual
              traffic-volume baseline rather than live movement.
            </p>
            <p>
              Public City traffic-camera images remain separate from flow measurements. Calgary Watch
              does not perform licence-plate recognition, face recognition, cross-camera matching or
              persistent vehicle tracking. Opening a camera requests that public still image from the
              City camera host.
            </p>
          </Section>

          <Section id="third-parties" title="Who else is involved">
            <p>
              The service runs on Google Firebase (authentication, database, file storage and
              hosting). Google processes this data on our behalf and may store it outside Canada.
            </p>
            <p>
              Some pages contact these sources for public information. They are not given anything
              about you beyond the ordinary network request your browser makes:
            </p>
            <ul className="ml-5 list-disc space-y-1">
              <li>City of Calgary and City of Edmonton Open Data — incidents, boundaries, assessments, traffic cameras</li>
              <li>Open-Meteo — current weather and air-quality conditions</li>
              <li>Alberta Rivers — public river-level readings</li>
              <li>Statistics Canada — annual crime baselines</li>
              <li>OpenStreetMap and CARTO — map tiles</li>
              <li>Nominatim — address search</li>
              <li>EmailJS — sends volunteer and city-request emails</li>
              <li>Resend — sends weekly emails and, when you reply, receives that response for the private administrator inbox</li>
            </ul>
            <p>
              Separate Calgary Watch scheduled jobs retrieve attributed public information from
              Calgary 311, the Calgary Police newsroom, Environment Canada, Alberta Emergency
              Alert, Global News Calgary, ENMAX and, when configured, 511 Alberta and an aggregate
              traffic-flow provider. Those server-side
              requests do not include information about site visitors.
            </p>
            <p>
              Replies to Calgary Watch emails are synchronized from Resend into an
              administrator-only inbox. We store plain text rather than active email HTML, do not
              download attachments automatically, and remove synchronized replies after 180 days.
            </p>
          </Section>

          <Section id="rights" title="Your rights">
            <p>You can ask us to:</p>
            <ul className="ml-5 list-disc space-y-1">
              <li>tell you what personal information we hold about you</li>
              <li>correct anything that is wrong</li>
              <li>delete your account and the personal information attached to it</li>
              <li>withdraw consent for the weekly digest at any time</li>
            </ul>
            <p>
              You can delete any report you filed yourself from the report's own panel. For anything
              else, email us and we will respond within 30 days. We may need to confirm you control
              the account before acting.
            </p>
            <p>
              Deleting your account removes your profile, the email stored against your reports, and
              any photos you uploaded. Reports themselves may remain on the map without attribution
              where others have relied on them, unless you ask for those to be removed too.
            </p>
          </Section>

          <Section id="security" title="How it is protected, and what happens if that fails">
            <p>
              Database rules restrict every read and write. Reporter email addresses are held in a
              separate area readable only by administrators and the person concerned, so they are
              never exposed by the public map. Administrator access is limited to approved accounts.
            </p>
            <p>
              If personal information is exposed in a way that creates a real risk of significant
              harm, we will notify the people affected and the Office of the Privacy Commissioner as
              soon as we reasonably can, and keep a record of the breach.
            </p>
          </Section>

          <Section id="children" title="Children">
            <p>
              The service is not intended for children under 13. If you believe a child has given us
              personal information, contact us and we will remove it.
            </p>
          </Section>

          <Section id="changes" title="Changes">
            <p>
              If this policy changes materially we will update the date at the top and note the
              change on the site. Continuing to use the service after that means you accept the
              updated policy.
            </p>
          </Section>

          <Section id="contact" title="Contact">
            <p>
              Calgary Watch is a non-profit community project based in Calgary, Alberta. Questions,
              access requests and complaints all go to the same place:
            </p>
            <a
              href={`mailto:${CONTACT}`}
              className="mt-2 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-bold transition-opacity hover:opacity-90"
              style={{ background: T.ink, color: T.paper }}
            >
              <Mail size={15} /> {CONTACT}
            </a>
            <p className="mt-4 text-[13.5px]">
              If you are not satisfied with our response you can contact the Office of the
              Information and Privacy Commissioner of Alberta, or the Office of the Privacy
              Commissioner of Canada.
            </p>
          </Section>
        </div>
      </main>
    </div>
  );
}
