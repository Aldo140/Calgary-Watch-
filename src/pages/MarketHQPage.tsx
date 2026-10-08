import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, CalendarDays, Check, ClipboardList, Copy, Handshake, Inbox, Megaphone, Plus, Send, Store, Users } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { useAuth } from '../components/FirebaseProvider';
import { discoveryRepository } from '../data/discovery';
import { entityPath } from '../lib/discovery';
import { upcomingOccurrences } from '../lib/discoveryCalendar';
import { useMyClaims } from '../lib/claimsApi';
import { VENDOR_CATEGORIES, lineupSummary, messageRecipients, vendorSlug, type MessageAudience, type Vendor } from '../lib/markets';
import {
  decideApplication, queueVendorMessage, requestService, saveLineup, saveVendor, setContactOptOut,
  useApplications, useLineups, useVendorContacts, useVendorMessages, useVendors,
} from '../lib/marketsApi';
import { calgaryDateTimeFormat } from '../lib/calgaryTz';
import { EASE_OUT } from '../components/plans/Motion';
import '../styles/plans.css';
import '../styles/claim.css';
import '../styles/hq.css';

type Tab = 'lineup' | 'vendors' | 'applications' | 'messages' | 'plan';
const dayFmt = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'short', month: 'short', day: 'numeric' });
const longFmt = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'long', month: 'long', day: 'numeric' });

const TEMPLATES: Array<{ label: string; subject: string; body: string }> = [
  { label: 'Load-in reminder', subject: 'Load-in reminder for this market day', body: 'Hi everyone,\n\nA quick reminder: load-in opens at 7:00 a.m. and stalls should be set by 8:45. Please park in the vendor lot once you have unloaded.\n\nSee you there,' },
  { label: 'Weather update', subject: 'Weather update for this market day', body: 'Hi everyone,\n\nWe are watching the forecast. The market is ON as planned; bring weights for your tents. If that changes we will email you by 6:00 a.m.\n\nThanks,' },
  { label: 'Cancellation', subject: 'This market day is cancelled', body: 'Hi everyone,\n\nWe have had to cancel this market day. We are sorry for the late notice. Stall fees will carry over to the next date.\n\nThank you for understanding,' },
  { label: 'Thank you', subject: 'Thank you for a great market', body: 'Hi everyone,\n\nThank you for a great market day. We had a busy crowd and lots of kind words about your stalls.\n\nSee you next time,' },
];

/**
 * Market HQ: where a market's organizer (or CalgaryWatch, on the managed
 * service) runs vendors. Everything published here shows up for shoppers:
 * the lineup on the listing and in event picks.
 */
export default function MarketHQPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { user, signIn, isAdmin, isFirebaseConfigured } = useAuth();
  const reduce = useReducedMotion();
  const market = useMemo(() => discoveryRepository.list().find((e) => e.id === id && e.kind === 'market'), [id]);
  const claims = useMyClaims(user?.uid);
  const claim = claims?.find((c) => c.entityId === id);
  // Development only: ?demo=1 renders sample data without Firebase.
  const demo = import.meta.env.DEV && params.has('demo');
  const organizer = demo || claim?.status === 'approved';
  const allowed = organizer || isAdmin;
  const tab = (params.get('tab') as Tab) || 'lineup';
  const setTab = (t: Tab) => setParams((p) => { p.set('tab', t); return p; }, { replace: true });

  const live = allowed && !demo ? id : undefined;
  const dates = useMemo(() => upcomingOccurrences(discoveryRepository.occurrences(), id).filter((o) => !o.cancelled).slice(0, 10), [id]);
  const sample = useMemo(() => (demo ? demoData(id, dates[0]?.id ?? '', dates[0]?.start ?? '') : null), [demo, id, dates]);
  const vendors = useVendors(live) ?? sample?.vendors ?? null;
  const contacts = useVendorContacts(live) ?? sample?.contacts ?? null;
  const lineups = useLineups(live) ?? sample?.lineups ?? null;
  const apps = useApplications(live) ?? sample?.apps ?? null;
  const messages = useVendorMessages(live) ?? sample?.messages ?? null;

  useEffect(() => { document.title = market ? `Market HQ · ${market.title} | CalgaryWatch` : 'Market HQ | CalgaryWatch'; }, [market]);

  if (!market) {
    return <SiteLayout><div className="cw-wrap cl-page"><h1 className="cl-title">That market isn’t listed yet.</h1><p className="cl-lead"><Link to="/for-markets">How Market HQ works</Link></p></div></SiteLayout>;
  }

  if ((!user && !demo) || !allowed) {
    return (
      <SiteLayout>
        <div className="cw-plans cl-page">
          <header className="cw-wrap cl-head">
            <p className="pl-eyebrow">Market HQ</p>
            <h1 className="cl-title">Run {market.title} <em>from one place.</em></h1>
            <p className="cl-lead">Vendors, weekly lineups, applications and vendor emails, with every lineup shown to shoppers on CalgaryWatch.</p>
            <div className="hq-gate">
              {!user ? (
                <button type="button" className="pl-btn" disabled={!isFirebaseConfigured} onClick={() => void signIn()}>Sign in to open Market HQ <ArrowUpRight size={18} aria-hidden="true" /></button>
              ) : claim?.status === 'pending' ? (
                <p className="cl-status" data-state="pending"><span><strong>Your claim is being confirmed.</strong> Market HQ opens as soon as it’s approved.</span></p>
              ) : (
                <Link className="pl-btn" to={`/claim/${encodeURIComponent(market.id)}`}>Claim this market first <ArrowUpRight size={18} aria-hidden="true" /></Link>
              )}
              <Link className="pl-textbtn" to="/for-markets">How Market HQ works</Link>
            </div>
          </header>
        </div>
      </SiteLayout>
    );
  }

  const active = (vendors ?? []).filter((v) => v.active);
  const pendingApps = (apps ?? []).filter((a) => a.status === 'pending');
  const next = dates[0];
  const nextLineup = next ? lineups?.find((l) => l.occurrenceId === next.id) : undefined;
  const sent = (messages ?? []).filter((m) => m.status === 'sent').length;
  const tabs: Array<{ id: Tab; label: string; icon: typeof Store; count?: number }> = [
    { id: 'lineup', label: 'Lineup', icon: CalendarDays },
    { id: 'vendors', label: 'Vendors', icon: Users, count: active.length },
    { id: 'applications', label: 'Applications', icon: Inbox, count: pendingApps.length },
    { id: 'messages', label: 'Messages', icon: Megaphone },
    { id: 'plan', label: 'Plan & sharing', icon: Handshake },
  ];

  return (
    <SiteLayout>
      <div className="cw-plans hq">
        <header className="cw-wrap hq-head">
          <motion.p className="pl-eyebrow" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            Market HQ · {organizer ? 'run by you' : 'run by CalgaryWatch'}
          </motion.p>
          <motion.h1 className="cl-title" initial={reduce ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.05 }}>{market.title}</motion.h1>
          <div className="hq-tiles">
            {[
              { n: active.length, l: 'Active vendors', s: `${(vendors ?? []).length} on the roster` },
              { n: next ? dayFmt.format(new Date(next.start)) : '—', l: 'Next market', s: next ? (nextLineup?.published ? `Lineup live · ${nextLineup.vendorSlugs.length} vendors` : nextLineup ? 'Lineup drafted' : 'No lineup yet') : 'No dates listed' },
              { n: pendingApps.length, l: 'Applications', s: pendingApps.length ? 'Waiting for you' : 'All caught up' },
              { n: sent, l: 'Messages sent', s: 'To your vendors' },
            ].map((t, i) => (
              <motion.div key={t.l} className="hq-tile" initial={reduce ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 170, damping: 20, delay: 0.15 + i * 0.06 }}>
                <span className="hq-tile-n">{t.n}</span><span className="hq-tile-l">{t.l}</span><span className="hq-tile-s">{t.s}</span>
              </motion.div>
            ))}
          </div>
          <nav className="hq-tabs" aria-label="Market HQ">
            {tabs.map((t) => (
              <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
                <t.icon size={16} aria-hidden="true" /> {t.label}{t.count ? <b>{t.count}</b> : null}
              </button>
            ))}
          </nav>
        </header>

        <div className="cw-wrap hq-body">
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              {tab === 'lineup' ? <LineupTab marketId={id} dates={dates} vendors={vendors ?? []} lineups={lineups ?? []} />
                : tab === 'vendors' ? <VendorsTab marketId={id} vendors={vendors ?? []} contacts={contacts ?? []} />
                : tab === 'applications' ? <ApplicationsTab apps={apps ?? []} marketId={id} />
                : tab === 'messages' ? <MessagesTab market={{ id, title: market.title }} dates={dates} vendors={vendors ?? []} contacts={contacts ?? []} lineups={lineups ?? []} messages={messages ?? []} replyTo={claim?.workEmail || user?.email || ''} />
                : <PlanTab market={{ id, title: market.title, path: entityPath(market) }} organizer={organizer} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </SiteLayout>
  );
}

function LineupTab({ marketId, dates, vendors, lineups }: {
  marketId: string; dates: Array<{ id: string; start: string }>; vendors: Array<Vendor & { id: string }>; lineups: Array<{ occurrenceId: string; vendorSlugs: string[]; note: string; published: boolean }>;
}) {
  const [occ, setOcc] = useState(dates[0]?.id ?? '');
  const current = lineups.find((l) => l.occurrenceId === occ);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  useEffect(() => { setPicked(current?.vendorSlugs ?? []); setNote(current?.note ?? ''); setDone(''); }, [occ, current?.vendorSlugs?.join(','), current?.note]);
  const active = vendors.filter((v) => v.active).sort((a, b) => a.name.localeCompare(b.name));
  const date = dates.find((d) => d.id === occ);
  const previous = [...lineups].filter((l) => l.occurrenceId !== occ && l.vendorSlugs.length).pop();
  const names = active.filter((v) => picked.includes(v.slug)).map((v) => v.name);

  if (!dates.length) return <div className="hq-empty"><CalendarDays size={22} /><p><strong>No upcoming dates listed.</strong> Send your season dates from your claim page and they’ll appear here.</p></div>;

  const save = async (published: boolean) => {
    if (!date) return;
    setBusy(true);
    try { await saveLineup(marketId, occ, date.start, picked, note, published); setDone(published ? 'Published. Shoppers see it on your listing and in event picks.' : 'Draft saved.'); }
    catch { setDone('That didn’t save. Try again.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="hq-grid">
      <section className="pl-form hq-panel">
        <div className="hq-dates" role="tablist" aria-label="Market dates">
          {dates.map((d) => {
            const l = lineups.find((x) => x.occurrenceId === d.id);
            return (
              <button key={d.id} type="button" role="tab" aria-selected={occ === d.id} onClick={() => setOcc(d.id)} data-state={l?.published ? 'live' : l ? 'draft' : 'none'}>
                <strong>{dayFmt.format(new Date(d.start))}</strong><small>{l?.published ? 'Live' : l ? 'Draft' : 'Empty'}</small>
              </button>
            );
          })}
        </div>
        <div className="hq-pad">
          <div className="hq-row-head">
            <h2>Who’s coming {date ? longFmt.format(new Date(date.start)) : ''}</h2>
            <span>
              <button type="button" className="pl-textbtn" onClick={() => setPicked(active.map((v) => v.slug))}>Everyone</button>
              {previous ? <button type="button" className="pl-textbtn" onClick={() => setPicked(previous.vendorSlugs.filter((s) => active.some((v) => v.slug === s)))}>Same as last time</button> : null}
              <button type="button" className="pl-textbtn" onClick={() => setPicked([])}>Clear</button>
            </span>
          </div>
          {active.length ? (
            <div className="pl-chips hq-vendor-chips">
              {active.map((v) => {
                const on = picked.includes(v.slug);
                return (
                  <button key={v.slug} type="button" className="pl-chip" aria-pressed={on} onClick={() => setPicked((p) => (on ? p.filter((s) => s !== v.slug) : [...p, v.slug]))}>
                    <span className="pl-chip-tick" aria-hidden="true">{on ? <Check size={14} strokeWidth={3} /> : null}</span>
                    <span><strong>{v.name}</strong><small>{v.category}</small></span>
                  </button>
                );
              })}
            </div>
          ) : <p className="pl-hint">Add vendors in the Vendors tab first, or approve applications.</p>}
          <label className="pl-field"><span>This week at the market <small>(optional, shown to shoppers)</small></span>
            <textarea className="cl-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="First squash of the season, live fiddle from 10, kids’ craft table by the entrance…" />
          </label>
        </div>
        <div className="pl-actions">
          <button type="button" className="pl-btn" data-ready={picked.length > 0} disabled={busy} onClick={() => void save(true)}>{current?.published ? 'Update the live lineup' : 'Publish lineup'} <ArrowUpRight size={18} aria-hidden="true" /></button>
          <button type="button" className="pl-textbtn" disabled={busy} onClick={() => void save(false)}>Save as draft</button>
          {done ? <p className="pl-goal" data-done="true" role="status"><Check size={14} strokeWidth={3} aria-hidden="true" /> {done}</p> : null}
        </div>
      </section>
      <aside className="hq-preview">
        <p className="pl-kicker">What shoppers see</p>
        <div className="hq-preview-card">
          <strong>{date ? longFmt.format(new Date(date.start)) : 'Next market'}</strong>
          <p>{names.length ? lineupSummary(names) : 'No vendors picked yet.'}</p>
          {note.trim() ? <p className="hq-preview-note">“{note.trim()}”</p> : null}
        </div>
        <p className="pl-fine">Published lineups appear on your CalgaryWatch listing and in event picks emails for people who like markets.</p>
      </aside>
    </div>
  );
}

function VendorsTab({ marketId, vendors, contacts }: { marketId: string; vendors: Array<Vendor & { id: string }>; contacts: Array<{ vendorSlug: string; contactName: string; email: string; phone: string; optedOut: boolean }> }) {
  const blank = { slug: '', name: '', category: '', description: '', website: '', instagram: '', active: true, contactName: '', email: '', phone: '', createdAt: undefined as number | undefined };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const editing = Boolean(form.slug);
  const sorted = [...vendors].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const contactOf = (slug: string) => contacts.find((c) => c.vendorSlug === slug);
  const edit = (v: Vendor) => { const c = contactOf(v.slug); setForm({ ...v, contactName: c?.contactName ?? '', email: c?.email ?? '', phone: c?.phone ?? '' }); setMsg(''); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const save = async () => {
    if (form.name.trim().length < 2 || !form.category) { setMsg('Add a name and a category.'); return; }
    setBusy(true); setMsg('');
    try {
      await saveVendor(marketId, { ...form, slug: form.slug || vendorSlug(form.name) }, { contactName: form.contactName, email: form.email, phone: form.phone, optedOut: contactOf(form.slug)?.optedOut });
      setMsg(editing ? 'Saved.' : `${form.name} added.`); setForm(blank);
    } catch { setMsg('That didn’t save. A vendor with that name may already exist.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="hq-grid">
      <section className="pl-form hq-panel">
        <div className="hq-pad">
          <h2>{editing ? `Edit ${form.name}` : 'Add a vendor'}</h2>
          <div className="hq-form-grid">
            <label className="pl-field"><span>Business name</span><input value={form.name} disabled={editing} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="pl-field"><span>What they sell</span>
              <select className="hq-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="">Choose…</option>{VENDOR_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <label className="pl-field hq-span"><span>Short description <small>(public)</small></span><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Organic vegetables from Okotoks" /></label>
            <label className="pl-field"><span>Website <small>(public)</small></span><input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" /></label>
            <label className="pl-field"><span>Instagram <small>(public)</small></span><input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="@handle" /></label>
            <label className="pl-field"><span>Contact name <small>(private)</small></span><input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></label>
            <label className="pl-field"><span>Contact email <small>(private, for messages)</small></span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          </div>
          <label className="pl-check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /><span><strong>Active this season.</strong> Inactive vendors stay on file but aren’t offered in lineups or messages.</span></label>
        </div>
        <div className="pl-actions">
          <button type="button" className="pl-btn" disabled={busy} onClick={() => void save()}>{editing ? 'Save vendor' : 'Add vendor'} <Plus size={18} aria-hidden="true" /></button>
          {editing ? <button type="button" className="pl-textbtn" onClick={() => setForm(blank)}>Cancel</button> : null}
          {msg ? <p className="pl-fine" role="status">{msg}</p> : null}
        </div>
      </section>
      <section className="hq-list" aria-label="Roster">
        <p className="pl-kicker">Roster · {vendors.length}</p>
        {!sorted.length ? <div className="hq-empty"><Users size={22} /><p>No vendors yet. Add them here, or share your application link from Plan &amp; sharing.</p></div> : null}
        <ul>
          {sorted.map((v) => {
            const c = contactOf(v.slug);
            return (
              <li key={v.slug} data-active={v.active}>
                <button type="button" onClick={() => edit(v)}><strong>{v.name}</strong><small>{v.category}{c?.email ? ` · ${c.email}` : ' · no email'}{v.active ? '' : ' · inactive'}</small></button>
                {c ? <button type="button" className="hq-optout" aria-pressed={c.optedOut} onClick={() => void setContactOptOut(marketId, v.slug, !c.optedOut)} title="Asked not to get messages">{c.optedOut ? 'Opted out' : 'Gets messages'}</button> : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function ApplicationsTab({ apps, marketId }: { apps: Array<{ id: string; status: string; businessName: string; category: string; description: string; website: string; instagram: string; contactName: string; email: string; phone: string; availability: string; createdAt: number; uid: string; marketId: string; marketTitle: string }>; marketId: string }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState('');
  const pending = apps.filter((a) => a.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  const decided = apps.filter((a) => a.status !== 'pending').sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
  const link = `${window.location.origin}/apply/${encodeURIComponent(marketId)}`;
  return (
    <div className="hq-stack">
      <div className="hq-linkbar"><ClipboardList size={18} aria-hidden="true" /><span>Your vendor application link: <code>{link}</code></span><button type="button" onClick={() => void navigator.clipboard?.writeText(link)}><Copy size={14} /> Copy</button></div>
      {!pending.length ? <div className="hq-empty"><Inbox size={22} /><p><strong>No applications waiting.</strong> Share your link on your website or social posts; applications land here.</p></div> : null}
      {pending.map((a) => (
        <article key={a.id} className="hq-app">
          <header><strong>{a.businessName}</strong><span>{a.category}</span></header>
          <p>{a.description}</p>
          <dl>
            <div><dt>Contact</dt><dd>{a.contactName} · <a href={`mailto:${a.email}`}>{a.email}</a>{a.phone ? ` · ${a.phone}` : ''}</dd></div>
            {a.availability ? <div><dt>Dates</dt><dd>{a.availability}</dd></div> : null}
            {a.website || a.instagram ? <div><dt>Online</dt><dd>{a.website ? <a href={a.website} target="_blank" rel="noreferrer">{a.website}</a> : null}{a.instagram ? ` @${a.instagram}` : ''}</dd></div> : null}
          </dl>
          <div className="hq-app-actions">
            <button type="button" className="pl-btn" disabled={busy === a.id || !user} onClick={async () => { if (!user) return; setBusy(a.id); try { await decideApplication(user, a as never, true); } finally { setBusy(''); } }}>Approve and add to roster <Check size={16} /></button>
            <button type="button" className="pl-textbtn" disabled={busy === a.id || !user} onClick={async () => { if (!user) return; setBusy(a.id); try { await decideApplication(user, a as never, false); } finally { setBusy(''); } }}>Decline</button>
          </div>
        </article>
      ))}
      {decided.length ? <details className="hq-history"><summary>Decided ({decided.length})</summary><ul>{decided.map((a) => <li key={a.id}><strong>{a.businessName}</strong> <span data-status={a.status}>{a.status}</span></li>)}</ul></details> : null}
    </div>
  );
}

function MessagesTab({ market, dates, vendors, contacts, lineups, messages, replyTo }: {
  market: { id: string; title: string }; dates: Array<{ id: string; start: string }>; vendors: Array<Vendor & { id: string }>;
  contacts: Array<{ vendorSlug: string; email: string; optedOut: boolean }>; lineups: Array<{ occurrenceId: string; vendorSlugs: string[] }>;
  messages: Array<{ id: string; subject: string; status: string; createdAt: number; sentCount?: number; audience: string; error?: string }>; replyTo: string;
}) {
  const { user } = useAuth();
  const [audience, setAudience] = useState<MessageAudience>('all');
  const [occ, setOcc] = useState(dates[0]?.id ?? '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState(replyTo);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const recipients = messageRecipients({ audience, occurrenceId: occ }, vendors, contacts, lineups);
  const history = [...messages].sort((a, b) => b.createdAt - a.createdAt);
  const send = async () => {
    if (!user) return;
    setBusy(true); setDone('');
    try { await queueVendorMessage(user, { marketId: market.id, marketTitle: market.title, audience, occurrenceId: audience === 'date' ? occ : '', subject, body, replyTo: reply }); setSubject(''); setBody(''); setDone(`Queued for ${recipients.length} vendor${recipients.length === 1 ? '' : 's'}. It goes out within the hour.`); }
    catch { setDone('That didn’t queue. Try again.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="hq-grid">
      <section className="pl-form hq-panel">
        <div className="hq-pad">
          <h2>Message your vendors</h2>
          <div className="hq-templates">{TEMPLATES.map((t) => <button key={t.label} type="button" onClick={() => { setSubject(t.subject); setBody(t.body); }}>{t.label}</button>)}</div>
          <div className="cl-roles" role="radiogroup" aria-label="Who gets it">
            <button type="button" className="pl-chip cl-role" aria-pressed={audience === 'all'} onClick={() => setAudience('all')}><span className="pl-chip-tick">{audience === 'all' ? <Check size={14} strokeWidth={3} /> : null}</span><strong>All active vendors</strong></button>
            <button type="button" className="pl-chip cl-role" aria-pressed={audience === 'date'} onClick={() => setAudience('date')} disabled={!dates.length}><span className="pl-chip-tick">{audience === 'date' ? <Check size={14} strokeWidth={3} /> : null}</span><strong>Vendors on one date</strong></button>
          </div>
          {audience === 'date' ? (
            <label className="pl-field"><span>Date</span><select className="hq-select" value={occ} onChange={(e) => setOcc(e.target.value)}>{dates.map((d) => <option key={d.id} value={d.id}>{longFmt.format(new Date(d.start))}</option>)}</select></label>
          ) : null}
          <label className="pl-field"><span>Subject</span><input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <label className="pl-field"><span>Message</span><textarea className="cl-textarea" rows={7} value={body} onChange={(e) => setBody(e.target.value)} /></label>
          <label className="pl-field"><span>Replies go to</span><input type="email" value={reply} onChange={(e) => setReply(e.target.value)} /></label>
          <p className="pl-hint">Sent from CalgaryWatch on behalf of {market.title}, with your reply address and a way to stop. Vendors marked “Opted out” are skipped.</p>
        </div>
        <div className="pl-actions">
          <button type="button" className="pl-btn" disabled={busy || subject.trim().length < 2 || body.trim().length < 2 || !recipients.length || !/@/.test(reply)} onClick={() => void send()}>
            Send to {recipients.length} vendor{recipients.length === 1 ? '' : 's'} <Send size={17} aria-hidden="true" />
          </button>
          {done ? <p className="pl-goal" data-done="true" role="status"><Check size={14} strokeWidth={3} aria-hidden="true" /> {done}</p> : null}
        </div>
      </section>
      <section className="hq-list" aria-label="Sent messages">
        <p className="pl-kicker">Sent and queued</p>
        {!history.length ? <div className="hq-empty"><Megaphone size={22} /><p>Nothing sent yet.</p></div> : null}
        <ul>{history.map((m) => <li key={m.id} data-active="true"><span className="hq-msg"><strong>{m.subject}</strong><small>{m.status === 'sent' ? `Sent to ${m.sentCount ?? 0}` : m.status === 'failed' ? `Failed: ${m.error ?? 'unknown'}` : 'Queued'} · {dayFmt.format(new Date(m.createdAt))}</small></span></li>)}</ul>
      </section>
    </div>
  );
}

function PlanTab({ market, organizer }: { market: { id: string; title: string; path: string }; organizer: boolean }) {
  const { user } = useAuth();
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const apply = `${window.location.origin}/apply/${encodeURIComponent(market.id)}`;
  return (
    <div className="hq-plans">
      <article className="hq-plan" data-current={organizer}>
        <p className="pl-kicker">Run it yourself · free</p>
        <h2>You run Market HQ</h2>
        <ul><li>Vendor roster and private contacts</li><li>Weekly lineups shown to shoppers</li><li>Vendor applications with one-tap approval</li><li>Messages to all vendors or one date’s vendors</li></ul>
        {organizer ? <p className="hq-plan-on"><Check size={15} /> This is your plan today</p> : null}
      </article>
      <article className="hq-plan hq-plan-managed">
        <p className="pl-kicker">We run it for you</p>
        <h2>CalgaryWatch runs it</h2>
        <ul><li>We chase and review applications</li><li>We publish each week’s lineup and note</li><li>We send load-in, weather and cancellation emails</li><li>You get a short weekly summary</li></ul>
        {state === 'done' ? <p className="hq-plan-on"><Check size={15} /> Requested. Aldo will be in touch within a day.</p> : (
          <>
            <label className="pl-field"><span>Anything we should know?</span><textarea className="cl-textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="How many vendors, how you handle applications today…" /></label>
            <button type="button" className="pl-btn" disabled={state === 'busy' || !user} onClick={async () => { if (!user) return; setState('busy'); try { await requestService(user, market, 'managed', note, user.email ?? ''); setState('done'); } catch { setState('error'); } }}>Have CalgaryWatch run it <ArrowUpRight size={18} /></button>
            {state === 'error' ? <p className="pl-error">That didn’t send. Email aldo@calgarywatch.ca instead.</p> : null}
          </>
        )}
      </article>
      <article className="hq-plan hq-share">
        <p className="pl-kicker">Share</p>
        <h2>Links for your website and socials</h2>
        <p><strong>Vendor applications</strong></p><div className="hq-linkbar"><code>{apply}</code><button type="button" onClick={() => void navigator.clipboard?.writeText(apply)}><Copy size={14} /> Copy</button></div>
        <p><strong>Your listing</strong></p><div className="hq-linkbar"><code>{window.location.origin}{market.path}</code><Link to={market.path}>Open <ArrowUpRight size={14} /></Link></div>
      </article>
    </div>
  );
}

/** Sample data for ?demo=1 in development. */
function demoData(marketId: string, occurrenceId: string, start: string) {
  const v = (slug: string, name: string, category: string, description: string, active = true) => ({ id: `${marketId}__${slug}`, marketId, slug, name, category, description, website: '', instagram: '', active, createdAt: 1, updatedAt: 1 });
  const vendors = [
    v('sunny-farm', 'Sunny Farm', 'Produce', 'Organic squash and greens from Okotoks'),
    v('rise-bakery', 'Rise Bakery', 'Baked goods', 'Sourdough and cardamom buns'),
    v('bow-honey', 'Bow Valley Honey', 'Other', 'Raw honey and beeswax candles'),
    v('prairie-pickle', 'Prairie Pickle Co.', 'Prepared food', 'Pickles, hot sauce, kraut'),
    v('wild-rose-flowers', 'Wild Rose Flowers', 'Flowers and plants', 'Seasonal bouquets'),
    v('old-tractor', 'Old Tractor Coffee', 'Drinks', 'Pour-over at the north entrance', false),
  ];
  const contacts = vendors.map((x) => ({ id: x.id, marketId, vendorSlug: x.slug, contactName: 'Sam', email: `${x.slug}@example.ca`, phone: '', optedOut: x.slug === 'bow-honey', updatedAt: 1 }));
  return {
    vendors, contacts,
    lineups: occurrenceId ? [{ id: occurrenceId, marketId, occurrenceId, start, vendorSlugs: ['sunny-farm', 'rise-bakery', 'prairie-pickle'], note: 'First squash of the season and live fiddle from 10.', published: true, updatedAt: 1 }] : [],
    apps: [{ id: 'a1', uid: 'u', marketId, marketTitle: 'Market', businessName: 'Little Dumpling House', category: 'Prepared food', description: 'Hand-folded dumplings, frozen and hot to go', website: 'https://example.ca', instagram: 'littledumpling', contactName: 'Mei', email: 'mei@example.ca', phone: '403-555-0101', availability: 'Every second Saturday; needs power', status: 'pending', createdAt: Date.now() - 86_400_000 }],
    messages: [{ id: 'm1', marketId, marketTitle: 'Market', audience: 'all', occurrenceId: '', subject: 'Load-in reminder for this market day', body: '', replyTo: '', status: 'sent', createdBy: 'u', createdAt: Date.now() - 3 * 86_400_000, sentCount: 5 }],
  };
}
