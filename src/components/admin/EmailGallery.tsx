import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ExternalLink, Monitor, Smartphone } from 'lucide-react';

/**
 * Every email a subscriber can receive, in one place.
 *
 * This replaces three separate previews (the Monday route switcher, the
 * welcome preview tucked under the delivery rules, and the Thursday case
 * strip). The list and every subject line come from email-previews/
 * manifest.json, which the preview build writes beside the HTML it renders, so
 * nothing here can describe an email the build did not produce.
 */

export type EmailFamily = 'monday' | 'welcome' | 'thursday' | 'combined' | 'alert' | 'opening';

export interface EmailCase {
  file: string;
  family: EmailFamily;
  label: string;
  who: string;
  subject: string;
  notes: string;
  angle?: string;
}

const FAMILY: Record<EmailFamily, { title: string; when: string }> = {
  welcome: { title: 'Welcome letters', when: 'A subscriber’s first Monday' },
  monday: { title: 'Monday brief', when: 'Mondays, 09:00 Calgary' },
  combined: { title: 'Your week (both lists)', when: 'Mondays, instead of two emails' },
  thursday: { title: 'Thursday picks', when: 'Thursdays, 08:00 Calgary' },
  alert: { title: 'Instant alerts', when: 'Between digests, outside quiet hours' },
  opening: { title: 'Opening note formats', when: 'Only when an admin adds one' },
};
const ORDER: EmailFamily[] = ['welcome', 'monday', 'combined', 'thursday', 'alert', 'opening'];

/** The cover colour each email actually opens with, for the swatch. */
export function caseTone(c: Pick<EmailCase, 'file' | 'family'>): string {
  if (c.file.includes('quiet')) return 'tone-cyan';
  if (c.file === 'city.html') return 'tone-city';
  return ({ welcome: 'tone-paper', monday: 'tone-blue', combined: 'tone-week', thursday: 'tone-yellow', alert: 'tone-coral', opening: 'tone-navy' } as const)[c.family];
}

const base = () => `${import.meta.env.BASE_URL}email-previews/`;

export function useEmailManifest() {
  const [cases, setCases] = useState<EmailCase[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${base()}manifest.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { emails?: EmailCase[] }) => { if (live) setCases(Array.isArray(data.emails) ? data.emails : []); })
      .catch(() => { if (live) setCases([]); });
    return () => { live = false; };
  }, []);
  return cases;
}

export function EmailGallery({ cases, selected, onSelect, aboveFrame }: {
  cases: EmailCase[] | null;
  selected: string;
  onSelect: (file: string) => void;
  /** Extra context set above the email, e.g. the push that rides with an alert. */
  aboveFrame?: (file: string) => ReactNode;
}) {
  const [width, setWidth] = useState<'desktop' | 'phone'>(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'phone' : 'desktop'));
  const [html, setHtml] = useState('');
  const [failed, setFailed] = useState(false);
  const active = useMemo(() => cases?.find((c) => c.file === selected) ?? cases?.[0], [cases, selected]);

  useEffect(() => {
    if (!active) return;
    let live = true;
    setHtml('');
    setFailed(false);
    fetch(`${base()}${active.file}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((text) => { if (live) setHtml(text); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [active]);

  if (cases === null) return <div className="ep-card ep-empty">Loading every email…</div>;
  if (!cases.length) {
    return <div className="ep-card ep-empty">Previews are built with the site. Run <code>npm run build</code> (or the deploy) to refresh them. No email or schedule was changed.</div>;
  }

  const frame = html
    ? <iframe srcDoc={html} title={`${active?.label} email preview`} sandbox="" />
    : <div className="ep-empty">{failed ? 'This preview could not be loaded. No email or schedule was changed.' : 'Loading…'}</div>;

  return (
    <div className="ep-gallery">
      <nav className="ep-list" aria-label="Every email">
        {ORDER.map((family) => {
          const items = cases.filter((c) => c.family === family);
          if (!items.length) return null;
          return (
            <section key={family} aria-label={FAMILY[family].title}>
              <h4>{FAMILY[family].title}</h4>
              <ul>
                {items.map((c) => (
                  <li key={c.file}>
                    <button type="button" className="ep-case" aria-pressed={c.file === active?.file} onClick={() => onSelect(c.file)}>
                      <i className={caseTone(c)} aria-hidden />
                      <span style={{ whiteSpace: 'normal' }}><b>{c.label}</b><span>{c.who}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </nav>

      {active && (
        <section className="ep-card ep-viewer" aria-label={`${active.label} preview`}>
          <div className="ep-inbox">
            <span className="ep-inbox-avatar" aria-hidden>C</span>
            <div style={{ minWidth: 0 }}>
              <p className="ep-inbox-from">Calgary Watch <span style={{ color: '#5b616b', fontWeight: 400 }}>· {FAMILY[active.family].when}</span></p>
              <p className="ep-inbox-subject">{active.subject}</p>
            </div>
            <a className="ep-btn" href={`${base()}${active.file}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Full size</a>
          </div>
          <dl className="ep-notes">
            <div><dt>Who gets it</dt><dd>{active.who}</dd></div>
            <div><dt>What’s different</dt><dd>{active.notes}</dd></div>
            {active.angle && <div><dt>Sample CW pick</dt><dd>“{active.angle}”. Each reader’s angle is chosen from their own week and rotates weekly.</dd></div>}
          </dl>
          <div className="ep-viewer-bar">
            <span style={{ font: '600 11px/1 var(--mono)', letterSpacing: '.08em', textTransform: 'uppercase', color: '#5b616b' }}>Production template · sample reader</span>
            <div className="ep-seg-toggle" role="group" aria-label="Preview width">
              <button type="button" aria-pressed={width === 'desktop'} onClick={() => setWidth('desktop')}><Monitor size={14} /> Desktop</button>
              <button type="button" aria-pressed={width === 'phone'} onClick={() => setWidth('phone')}><Smartphone size={14} /> Phone</button>
            </div>
          </div>
          <div className="ep-stage">
            {aboveFrame?.(active.file)}
            {width === 'phone' ? <div className="ep-phone">{frame}</div> : <div className="ep-frame">{frame}</div>}
          </div>
        </section>
      )}
    </div>
  );
}
