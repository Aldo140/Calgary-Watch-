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

import { Mail } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { PageHero } from '../components/site/PageHero';
import '../styles/privacy.css';

const UPDATED = '28 August 2026';
const CONTACT = 'aldo@calgarywatch.ca';

const TOC = [
  ['account', 'If you create an account'],
  ['reports', 'When you file a report'],
  ['anonymous', 'What “anonymous” means'],
  ['others', 'Reporting about other people'],
  ['visitors', 'If you only look'],
  ['traffic-flow', 'Traffic flow and cameras'],
  ['third-parties', 'Who else is involved'],
  ['rights', 'Your rights'],
  ['security', 'How it is protected'],
  ['children', 'Children'],
  ['changes', 'Changes'],
  ['contact', 'Contact'],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="pv-section">
      <h2>{title}</h2>
      <div className="pv-body">{children}</div>
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
    <div className="pv-table">
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {['What we store', 'Why', 'How long'].map((h) => <th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.what}>
              <td data-label="What we store">{r.what}</td>
              <td data-label="Why">{r.why}</td>
              <td data-label="How long"><span>{r.kept}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <SiteLayout>
      <div className="bp pv">
        <PageHero
          id="pv-title"
          kicker="Privacy"
          title={<>What we collect, and <span>what we do with it.</span></>}
          lead="CalgaryWatch is a free Calgary discovery and community awareness platform. We do not sell personal information, and we do not track you across other websites. Sponsored placements, when offered, are labelled and are independent of editorial selections. This page describes exactly what the service stores."
          facts={<>
            <li><b>Never</b> sold</li>
            <li><b>No</b> cross-site tracking</li>
            <li>Updated <b>{UPDATED}</b></li>
          </>}
        />

        <div className="cw-wrap pv-layout">
          <nav className="pv-toc" aria-label="On this page">
            <p className="bp-eyebrow">On this page</p>
            <ol>
              {TOC.map(([id, label]) => <li key={id}><a href={`#${id}`}>{label}</a></li>)}
            </ol>
          </nav>
          <div className="pv-sections">
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
              It does <strong>not</strong> hide you from us. Your account
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
                { what: 'Which link you tapped on a feature, e.g. a festival’s site or tickets', why: 'Show an organizer how many readers we sent them, as counts only', kept: 'Indefinitely, in aggregate' },
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
            <ul className="pv-list">
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
              Alert, the public news feeds of CTV, CBC, Global News, CityNews, LiveWire Calgary, the Calgary Herald and the Calgary Sun, ENMAX and, when configured, 511 Alberta and an aggregate
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
            <ul className="pv-list">
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
              Calgary Watch is a community platform based in Calgary, Alberta. Questions,
              access requests and complaints all go to the same place:
            </p>
            <a
              href={`mailto:${CONTACT}`}
              className="bp-btn bp-btn-navy pv-mail"
            >
              <Mail size={15} /> {CONTACT}
            </a>
            <p className="pv-fine">
              If you are not satisfied with our response you can contact the Office of the
              Information and Privacy Commissioner of Alberta, or the Office of the Privacy
              Commissioner of Canada.
            </p>
          </Section>
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}
