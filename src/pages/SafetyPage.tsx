import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, ExternalLink, Globe, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { PageHero } from '../components/site/PageHero';
import { SAFETY_CONTACTS, SAFETY_FAQS, SAFETY_PATH, SAFETY_TOPICS, type SafetyTopic } from '../content/safetyTopics';
import { NEWS_FEEDS } from '../content/newsFeeds';
import { safetyPath, safetyTopic } from '../lib/safety';
import { communitiesFor, headlinesFor, type CrimeNewsFile, type SafetyHeadline } from '../lib/safetyNews';
import { calgaryDateTimeFormat } from '../lib/calgaryTz';
import news from '../generated/crime-news.json';
import NotFoundPage from './NotFoundPage';
import '../styles/safety.css';

const NEWS = news as CrimeNewsFile;
const day = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', month: 'short', day: 'numeric', year: 'numeric' });
const checked = NEWS.updatedAt ? day.format(new Date(NEWS.updatedAt)) : undefined;
const topicLabel = (slug: string) => SAFETY_TOPICS.find(t => t.slug === slug)?.label;

function Tels() {
  const { emergency, nonEmergency } = SAFETY_CONTACTS;
  return (
    <>
      <a className="bp-btn bp-btn-primary sf-tel" href={`tel:${emergency.tel}`}><Phone size={18} aria-hidden="true" /> {emergency.label}<small>{emergency.note}</small></a>
      <a className="bp-btn sf-tel" href={`tel:${nonEmergency.tel}`}><Phone size={18} aria-hidden="true" /> {nonEmergency.label}<small>{nonEmergency.note}</small></a>
    </>
  );
}

function Headlines({ items, empty, showTopic = false }: { items: SafetyHeadline[]; empty: string; showTopic?: boolean }) {
  if (!items.length) return <p className="sf-empty">{empty}</p>;
  return (
    <ol className="sf-news">
      {items.map(h => (
        <li key={h.url} className="sf-item">
          <a href={h.url} target="_blank" rel="noopener noreferrer" className="sf-item-link">
            <strong>{h.title}</strong>
            <ExternalLink size={16} aria-hidden="true" />
          </a>
          <p className="sf-meta">
            <span className={h.police ? 'sf-src sf-src-police' : 'sf-src'}>{h.source}</span>
            <time dateTime={h.publishedAt}>{day.format(new Date(h.publishedAt))}</time>
            {h.community ? <Link to={`/search?q=${encodeURIComponent(h.community)}`}><MapPin size={13} aria-hidden="true" /> {h.community}</Link> : null}
            {showTopic ? h.topics.slice(0, 2).map(s => <Link key={s} to={`${SAFETY_PATH}/${s}`} className="sf-topic-tag">{topicLabel(s)}</Link>) : null}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Faqs({ faqs }: { faqs: SafetyTopic['faqs'] }) {
  return (
    <section className="bp-section" aria-labelledby="sf-faq">
      <div className="bp-head"><h2 id="sf-faq">Questions <span>people ask.</span></h2></div>
      <div className="sf-faqs">
        {faqs.map(f => (
          <details key={f.question}>
            <summary>{f.question}</summary>
            <p>{f.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Sources() {
  return (
    <section className="bp-section" aria-labelledby="sf-sources">
      <div className="bp-head">
        <h2 id="sf-sources">Where headlines <span>come from.</span></h2>
        <p>Each newsroom’s public feed, checked at least twice a day{checked ? `, last on ${checked}` : ''}. We show the headline and link to the full story on their site.</p>
      </div>
      <ul className="sf-sources">
        {NEWS_FEEDS.map(f => <li key={f.id}><a href={f.site} target="_blank" rel="noopener noreferrer"><Globe size={15} aria-hidden="true" /> {f.name}</a></li>)}
      </ul>
      <p className="sf-note"><ShieldCheck size={16} aria-hidden="true" /> CalgaryWatch is an independent community-awareness site, not a police service. Headlines describe what was reported at the time; charges are allegations until proven in court.</p>
    </section>
  );
}

function OtherTopics({ current }: { current?: string }) {
  return (
    <nav className="sf-topics" aria-label="Safety topics">
      {SAFETY_TOPICS.filter(t => t.slug !== current).map(t => <Link key={t.slug} to={safetyPath(t)}>{t.label}</Link>)}
    </nav>
  );
}

function TopicPage({ topic }: { topic: SafetyTopic }) {
  const items = headlinesFor(NEWS.items, topic.slug);
  const places = communitiesFor(headlinesFor(NEWS.items, topic.slug, 200));
  return (
    <div className="bp sf">
      <PageHero
        id="sf-title"
        kicker={`Calgary safety · ${topic.label}`}
        title={<>{topic.label} <span>in Calgary.</span></>}
        lead={topic.lead}
        ctas={<Tels />}
      />
      <div className="cw-wrap">
        <OtherTopics current={topic.slug} />

        <section className="bp-section" aria-labelledby="sf-recent">
          <div className="bp-head">
            <h2 id="sf-recent">Recent <span>headlines.</span></h2>
            <p>From Calgary newsrooms and Calgary Police, newest first. Each opens the original story.</p>
          </div>
          <Headlines items={items} empty={`No recent ${topic.noun} in the Calgary news we follow. New headlines appear here as newsrooms publish them.`} />
        </section>

        <section className="bp-section" aria-labelledby="sf-steps">
          <div className="bp-head"><h2 id="sf-steps">What <span>to do.</span></h2></div>
          <div className="sf-do">
            <ol className="sf-steps">{topic.steps.map(s => <li key={s}>{s}</li>)}</ol>
            <aside className="bp-card bp-card-dark sf-call">
              <h3>Who to call</h3>
              <ul>
                <li><a href="tel:911">911</a>: danger now, or a crime happening now</li>
                <li><a href={`tel:${SAFETY_CONTACTS.nonEmergency.tel}`}>403-266-1234</a>: Calgary Police, when it’s over</li>
                <li><a href={`tel:${SAFETY_CONTACTS.crimeStoppers.tel}`}>1-800-222-8477</a>: Crime Stoppers, no name needed</li>
                {topic.slug === 'fraud-scams' ? <li><a href={`tel:${SAFETY_CONTACTS.antiFraud.tel}`}>1-888-495-8501</a>: Canadian Anti-Fraud Centre</li> : null}
              </ul>
              {topic.online ? <p>Online with Calgary Police, when there’s no suspect: {topic.online.toLowerCase()}. <a href={SAFETY_CONTACTS.reportOnline.url} target="_blank" rel="noopener noreferrer">Report online</a></p> : null}
            </aside>
          </div>
        </section>

        <section className="bp-section" aria-labelledby="sf-where">
          <div className="bp-head">
            <h2 id="sf-where">Near <span>you.</span></h2>
            <p>{places.length ? 'Communities named in these headlines. A mention isn’t a measure: it means a newsroom reported something there.' : 'See what neighbours have reported near you, with the time and source on every pin.'}</p>
          </div>
          {places.length ? (
            <ul className="sf-places">
              {places.map(p => <li key={p.community}><Link to={`/search?q=${encodeURIComponent(p.community)}`}><MapPin size={14} aria-hidden="true" /> {p.community}</Link></li>)}
            </ul>
          ) : null}
          <div className="bp-cards sf-near" style={{ ['--cols' as string]: 2 }}>
            <Link to="/map" className="bp-card bp-tone-blue">
              <h3>Recent reports on the map <ArrowUpRight size={18} aria-hidden="true" /></h3>
              <p>Neighbours’ reports and Calgary Police releases that name a community, pinned where they happened.</p>
            </Link>
            <Link to="/check-your-community" className="bp-card bp-tone-yellow">
              <h3>Know your community <ArrowUpRight size={18} aria-hidden="true" /></h3>
              <p>{topic.cityReports ?? 'What neighbours reported to the City through 311 in your community this year.'}</p>
            </Link>
          </div>
        </section>

        <Faqs faqs={topic.faqs} />
        <Sources />
        <p className="sf-back"><Link className="bp-link" to={SAFETY_PATH}>All Calgary safety news <ArrowRight size={15} aria-hidden="true" /></Link></p>
      </div>
    </div>
  );
}

function IndexPage() {
  const latest = headlinesFor(NEWS.items, undefined, 30);
  const month = Date.now() - 30 * 86_400_000;
  return (
    <div className="bp sf">
      <PageHero
        id="sf-title"
        kicker={`Calgary safety news${checked ? ` · Checked ${checked}` : ''}`}
        title={<>Calgary crime and safety <span>news.</span></>}
        lead="Recent headlines from Calgary newsrooms and Calgary Police, sorted by what happened, with who to call and what neighbours can do. Know what’s going on, and look out for each other."
        ctas={<Tels />}
      />
      <div className="cw-wrap">
        <section className="bp-section" aria-labelledby="sf-topics-h">
          <div className="bp-head"><h2 id="sf-topics-h">By <span>topic.</span></h2><p>Each page has recent headlines, what to do and who to call.</p></div>
          <ul className="sf-grid">
            {SAFETY_TOPICS.map(t => {
              const recent = NEWS.items.filter(h => h.topics.includes(t.slug) && Date.parse(h.publishedAt) >= month).length;
              return (
                <li key={t.slug}>
                  <Link to={safetyPath(t)}>
                    <strong>{t.label}</strong>
                    <small>{recent ? `${recent} ${recent === 1 ? 'headline' : 'headlines'} in the last 30 days` : 'What to do and who to call'}</small>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="bp-section" aria-labelledby="sf-recent">
          <div className="bp-head"><h2 id="sf-recent">Latest <span>headlines.</span></h2><p>Newest first. Each opens the original story.</p></div>
          <Headlines items={latest} showTopic empty="Headlines from Calgary newsrooms and Calgary Police appear here as they’re published." />
        </section>

        <Faqs faqs={SAFETY_FAQS} />
        <Sources />
      </div>
    </div>
  );
}

export default function SafetyPage() {
  const { slug } = useParams();
  const topic = safetyTopic(slug);
  if (slug && !topic) return <NotFoundPage />;
  return <SiteLayout>{topic ? <TopicPage topic={topic} /> : <IndexPage />}</SiteLayout>;
}
