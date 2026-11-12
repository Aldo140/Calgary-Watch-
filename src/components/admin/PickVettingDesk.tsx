/**
 * The vetting desk (docs/cw-picks.md): where a Pick is earned. One service at
 * a time, the company being vetted, a date and a private note for each of the
 * seven checks, the one-line why, then "Make it live". The site picks it up at
 * the next deploy, which a scheduled check starts within about 15 minutes.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, getDocs, limit, query, setDoc } from 'firebase/firestore';
import { BadgeCheck, CalendarCheck, Check, Copy, ExternalLink, PauseCircle, Rocket, Save } from 'lucide-react';
import { db } from '@/src/firebase';
import { LOCAL_SERVICES } from '@/src/data/localServices';
import { PICK_CHECKS, PICKS } from '@/src/content/cwPicks';
import { pickDeskPath, shelfFor, type Shelf } from '@/src/lib/cwPicks';
import { blockers, calgaryDay, CHECK_HOW, CHECK_ORDER, checksDone, PICK_PLEDGE, PICK_VETTING, readVetting, untilFor, WHY_MAX, type Vetting } from '@/src/lib/pickVetting';
import type { DiscoveryEntity } from '@/src/types/discovery';
import { adminFirestoreActionError } from '@/src/lib/firestoreErrors';
import { AdminButton, Chip, Field, Panel, SkeletonRows, T, inputClass, inputStyle, mono } from './ui';

const blank = (service: string): Vetting => ({ service, place: '', placeName: '', checks: {}, why: '', status: 'vetting', updatedAt: 0 });
const DATEFMT = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const nice = (d: string) => DATEFMT.format(new Date(`${d}T12:00:00Z`));

export function PickVettingDesk({ entities, busiest }: { entities: readonly DiscoveryEntity[]; busiest: Map<string, { contacts: number; top?: string }> }) {
  const [rows, setRows] = useState<Map<string, Vetting> | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string>('');
  const today = calgaryDay();

  useEffect(() => {
    if (!db) { setRows(new Map()); return; }
    getDocs(query(collection(db, PICK_VETTING), limit(100)))
      .then(s => setRows(new Map(s.docs.map(d => [d.id, readVetting(d.id, d.data())!]).filter(([, v]) => v) as Array<[string, Vetting]>)))
      .catch(e => setError(String(e).includes('permission') ? 'The vetting desk rules are not deployed yet. Run "Deploy Firebase Backend" with target rules.' : adminFirestoreActionError(e)));
  }, []);

  const order = useMemo(() => {
    const rank = (id: string) => { const v = rows?.get(id); return v?.status === 'live' ? 0 : v && (v.place || Object.keys(v.checks).length) ? 1 : 2; };
    return [...LOCAL_SERVICES].sort((a, b) => rank(a.id) - rank(b.id) || (busiest.get(b.id)?.contacts ?? 0) - (busiest.get(a.id)?.contacts ?? 0));
  }, [rows, busiest]);

  if (error) return <Panel title="Vetting desk"><p role="alert" className="text-sm" style={{ color: T.critical }}>{error}</p></Panel>;
  if (!rows) return <Panel title="Vetting desk"><SkeletonRows rows={3} /></Panel>;

  const live = [...rows.values()].filter(v => v.status === 'live').length;
  const going = [...rows.values()].filter(v => v.place && v.status !== 'live').length;
  const save = (v: Vetting) => setRows(m => new Map(m).set(v.service, v));

  return (
    <Panel title="Vetting desk" subtitle={`${live} live · ${going} being vetted · ${LOCAL_SERVICES.length} services. Date each check the day you do it. Notes stay private; only the dates, the company and the why are published.`} padded={false}>
      <ul>
        {order.map(s => {
          const v = rows.get(s.id);
          const done = v ? checksDone(v, today).length : 0;
          const hot = busiest.get(s.id);
          const isOpen = open === s.id;
          return (
            <li key={s.id} className="border-t" style={{ borderColor: T.line }}>
              <button type="button" onClick={() => setOpen(isOpen ? '' : s.id)} aria-expanded={isOpen}
                className="w-full px-4 py-3 flex flex-wrap items-center gap-2 text-left hover:bg-black/[0.02]">
                <strong>{s.label}</strong>
                <Meter done={done} live={v?.status === 'live'} />
                {v?.status === 'live' ? <Chip tone="ok"><BadgeCheck size={11} /> {v.placeName}</Chip>
                  : v?.status === 'paused' ? <Chip tone="critical">Paused: {v.placeName}</Chip>
                  : v?.placeName ? <Chip tone="signal">Vetting {v.placeName}</Chip>
                  : <Chip>Not started</Chip>}
                {v?.publish ? <Chip tone="attention">Publishing</Chip> : null}
                {hot?.contacts ? <span className="text-xs" style={{ color: T.muted }}>{hot.contacts} contacts{!v?.place && hot.top ? ` · most: ${hot.top}` : ''}</span> : null}
                <span className="ml-auto text-xs" style={{ color: T.signal }}>{isOpen ? 'Close' : v?.place ? 'Open' : 'Start'}</span>
              </button>
              {isOpen ? <Editor key={s.id} shelf={shelfFor(s.id, entities)!} initial={v ?? blank(s.id)} suggested={hot?.top} today={today} onSaved={save} /> : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Meter({ done, live }: { done: number; live?: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${done} of 7 checks`}>
      {CHECK_ORDER.map((k, i) => <i key={k} className="block h-2 w-3 rounded-sm" style={{ background: i < done ? (live ? T.ok : T.signal) : T.line }} />)}
      <span className="ml-1 text-[0.68rem]" style={{ fontFamily: mono, color: T.muted }}>{done}/7</span>
    </span>
  );
}

function Editor({ shelf, initial, suggested, today, onSaved }: { shelf: Shelf; initial: Vetting; suggested?: string; today: string; onSaved: (v: Vetting) => void }) {
  const [v, setV] = useState<Vetting>(() => initial.place || !suggested ? initial : { ...initial, ...pickCompany(shelf, suggested) });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const problems = blockers(v, today);
  const until = untilFor(v);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const inCode = PICKS[shelf.service.id] && !initial.publishedAt;

  const write = async (status: Vetting['status']) => {
    if (!db) return;
    setBusy(true); setMsg('');
    // Anything that changes what the public site shows waits for a deploy.
    const touchesSite = status === 'live' || initial.status === 'live';
    const next: Vetting = { ...v, why: v.why.trim(), status, updatedAt: Date.now(), ...(touchesSite ? { publish: true } : {}) };
    try {
      await setDoc(doc(db, PICK_VETTING, v.service), JSON.parse(JSON.stringify(next)));
      setV(next); onSaved(next);
      setMsg(status === 'live' && initial.status !== 'live' ? `${v.placeName} goes live on the site within about 30 minutes.`
        : status === 'paused' ? 'Paused. The seal comes off the site within about 30 minutes.'
        : touchesSite ? 'Saved. The site updates within about 30 minutes.' : 'Saved.');
    } catch (e) { setMsg(adminFirestoreActionError(e)); }
    setBusy(false);
  };

  const setCheck = (k: (typeof CHECK_ORDER)[number], patch: { date?: string; note?: string }) =>
    setV(x => {
      const cur = { date: '', ...x.checks[k], ...patch };
      const checks = { ...x.checks };
      if (cur.date || cur.note) checks[k] = cur; else delete checks[k];
      return { ...x, checks };
    });

  const pledge = `Hi ${v.placeName || 'there'},\n\nTo be the CalgaryWatch Pick for ${shelf.service.label.toLowerCase()} in Calgary, we ask every company to agree to five things. Reply "I agree" to this email and that's it:\n\n${PICK_PLEDGE.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\nThe Pick is free and can't be bought. Thanks,\nCalgaryWatch`;

  return (
    <div className="px-4 pb-5 grid gap-4" style={{ background: '#FBFAF7' }}>
      <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end pt-2">
        <Field label="Company being vetted">
          <select className={inputClass} style={inputStyle} value={v.place} disabled={v.status === 'live'}
            onChange={e => setV(x => ({ ...x, ...pickCompany(shelf, shelf.contenders.find(c => c.key === e.target.value)?.name ?? ''), checks: {}, why: '' }))}>
            <option value="">Choose…</option>
            {shelf.contenders.map(c => <option key={c.key} value={c.key}>{c.name}{c.name === suggested ? ' (most contacted)' : ''}</option>)}
          </select>
        </Field>
        <Link className="text-xs inline-flex items-center gap-1 h-10" style={{ color: T.signal }} to={pickDeskPath(shelf.service.id)} target="_blank">See the desk <ExternalLink size={12} /></Link>
      </div>
      {v.status === 'live' ? <p className="text-xs" style={{ color: T.muted }}>Pause the Pick to change the company.</p> : null}
      {inCode ? <p className="text-xs" style={{ color: T.attention }}>This service also has a Pick written in src/content/cwPicks.ts, which wins over this desk.</p> : null}

      {v.place ? (
        <>
          <ol className="grid gap-2">
            {CHECK_ORDER.map((k, i) => {
              const c = v.checks[k];
              const ok = !!c?.date && c.date <= today;
              return (
                <li key={k} className="rounded-xl border p-3 grid gap-2" style={{ borderColor: ok ? `${T.ok}55` : T.line, background: T.card }}>
                  <div className="flex items-start gap-2">
                    <span className="grid place-items-center h-6 w-6 rounded-full text-xs font-bold shrink-0" style={{ background: ok ? T.ok : T.line, color: ok ? '#fff' : T.muted }}>{ok ? <Check size={13} /> : i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{PICK_CHECKS[k]}</p>
                      <p className="text-xs" style={{ color: T.muted }}>{CHECK_HOW[k]}</p>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-[170px_auto_1fr] gap-2 items-center">
                    <input type="date" aria-label={`${PICK_CHECKS[k]}: date passed`} className={inputClass} style={inputStyle} max={today} value={c?.date ?? ''} onChange={e => setCheck(k, { date: e.target.value })} />
                    <AdminButton size="sm" variant="outline" onClick={() => setCheck(k, { date: today })}><CalendarCheck size={13} /> Today</AdminButton>
                    <input type="text" aria-label={`${PICK_CHECKS[k]}: private note`} className={inputClass} style={inputStyle} maxLength={200} placeholder="Private note: number, insurer, what you heard…" value={c?.note ?? ''} onChange={e => setCheck(k, { note: e.target.value })} />
                  </div>
                </li>
              );
            })}
          </ol>

          <details className="rounded-xl border p-3 text-sm" style={{ borderColor: T.line, background: T.card }}>
            <summary className="cursor-pointer font-semibold">The pledge they agree to (check 7)</summary>
            <ol className="list-decimal pl-5 mt-2 grid gap-1">{PICK_PLEDGE.map(p => <li key={p}>{p}</li>)}</ol>
            <AdminButton size="sm" variant="outline" className="mt-3" onClick={() => { void navigator.clipboard?.writeText(pledge); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>
              <Copy size={13} /> {copied ? 'Copied' : 'Copy the pledge email'}
            </AdminButton>
          </details>

          <Field label={`Why it's the Pick, in our words (${v.why.trim().length}/${WHY_MAX})`}>
            <textarea className={`${inputClass} h-auto py-2`} style={inputStyle} rows={2} maxLength={WHY_MAX + 40} value={v.why}
              placeholder="Family-run since 1970, answered at 9 pm on our test call, and quoted the call-out fee before we asked."
              onChange={e => setV(x => ({ ...x, why: e.target.value }))} />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            {problems.length ? <ul className="text-xs grid gap-0.5" style={{ color: T.attention }}>{problems.map(p => <li key={p}>• {p}</li>)}</ul>
              : <p className="text-xs" style={{ color: T.ok }}>Ready. Lapses {until ? nice(until) : ''} unless re-vetted.</p>}
            <div className="ml-auto flex flex-wrap gap-2">
              <AdminButton variant="outline" disabled={busy || !dirty} onClick={() => void write(v.status)}><Save size={14} /> Save</AdminButton>
              {v.status === 'live'
                ? <AdminButton tone="critical" variant="outline" disabled={busy} onClick={() => void write('paused')}><PauseCircle size={14} /> Pause the Pick</AdminButton>
                : <AdminButton tone="ok" disabled={busy || problems.length > 0} onClick={() => void write('live')}><Rocket size={14} /> Make it live</AdminButton>}
            </div>
          </div>
          {v.status === 'live' && !v.publish && v.publishedAt ? <p className="text-xs" style={{ color: T.ok }}>Live on the site since {new Date(v.publishedAt).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.</p> : null}
          {msg ? <p role="status" className="text-sm" style={{ color: T.ink }}>{msg}</p> : null}
        </>
      ) : <p className="text-sm" style={{ color: T.muted }}>Choose a company to start. The most contacted one is usually the first to vet: start with a mystery call.</p>}
    </div>
  );
}

function pickCompany(shelf: Shelf, name: string): Pick<Vetting, 'place' | 'placeName'> {
  const c = shelf.contenders.find(x => x.name === name);
  return c ? { place: c.key, placeName: c.name } : { place: '', placeName: '' };
}
