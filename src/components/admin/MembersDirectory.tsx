import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { discoveryRepository } from '../../data/discovery';
import { approvedOrganization } from '../../lib/organizationWorkspace';
import type { ListingClaim } from '../../lib/claims';
import { entityPath } from '../../lib/discovery';
/**
 * Every member, as a list built for a phone: search, filter by what they
 * signed up for, tap a row for the detail, and open the member's own
 * dashboard read-only (/plans?as=uid) to see exactly what they see.
 * Uses the admin user store (one read per account per tab, shared with the
 * People directory), so opening this costs nothing extra once People loaded.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ExternalLink, LayoutDashboard, Mail, MapPin, Users } from 'lucide-react';
import { db } from '@/src/firebase';
import { adminUsers } from '@/src/lib/adminStore';
import { interestLabel, normalizeInterests } from '@/src/lib/eventPicks';
import { emailPlan } from '@/src/lib/memberHome';
import { Chip, EmptyState, FilterChip, FilterRow, Panel, SearchField, SkeletonRows, T, TimeAgo, mono } from './ui';

type Row = { id: string; uid: string } & Record<string, unknown>;
type Filter = 'all' | 'both' | 'monday' | 'events' | 'none' | 'no-area' | 'business' | 'new';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? v : 0);

function shape(r: Row) {
  const weekly = r.weeklyDigestOptIn === true;
  const events = r.eventsDigestOptIn === true;
  const area = (str(r.neighborhood) || str(r.inferredNeighborhood)).trim();
  return {
    uid: r.uid || r.id,
    name: str(r.displayName) || 'Calgary neighbour',
    email: str(r.email),
    photo: str(r.photoURL),
    area,
    weekly,
    events,
    interests: normalizeInterests(r.eventInterests),
    createdAt: num(r.createdAt),
    role: str(r.role),
    business: r.accountType === 'business',
    plan: emailPlan(weekly, events, Date.now()),
  };
}

const FILTERS: Array<{ id: Filter; label: string; match: (m: ReturnType<typeof shape>) => boolean }> = [
  { id: 'all', label: 'Everyone', match: () => true },
  { id: 'both', label: 'Your week (both)', match: (m) => m.weekly && m.events },
  { id: 'monday', label: 'Safety only', match: (m) => m.weekly && !m.events },
  { id: 'events', label: 'Event picks only', match: (m) => !m.weekly && m.events },
  { id: 'none', label: 'No email', match: (m) => !m.weekly && !m.events },
  { id: 'no-area', label: 'No home area', match: (m) => !m.area },
  { id: 'business', label: 'Business accounts', match: (m) => m.business },
  { id: 'new', label: 'New this week', match: (m) => m.createdAt > Date.now() - 7 * 86_400_000 },
];

export function MembersDirectory() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [claims,setClaims]=useState<ListingClaim[]>([]);
  const [accessError,setAccessError]=useState('');
  useEffect(()=>{let active=true;if(db)void getDocs(query(collection(db,'listing_claims'),where('status','==','approved'),limit(500))).then(s=>{if(active){setClaims(s.docs.map(d=>d.data() as ListingClaim));if(s.size===500)setAccessError('Showing the first 500 approvals. Some organization associations may be omitted.');}}).catch(()=>{if(active)setAccessError('Organization approvals could not be loaded. Account flags alone do not confirm organization access.');});return()=>{active=false;};},[]);
  const accessByUid=useMemo(()=>{const map=new Map<string,ListingClaim[]>();for(const c of claims)map.set(c.uid,[...(map.get(c.uid)??[]),c]);return map;},[claims]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(30);

  useEffect(() => {
    if (!db) { setRows([]); return; }
    return adminUsers.subscribe(db, ({ rows: r, loading }) => { if (!loading || r.length) setRows(r as Row[]); });
  }, []);

  const members = useMemo(() => (rows ?? []).map(r=>{const member=shape(r);return {...member,business:member.business||(accessByUid.get(member.uid)?.length??0)>0};}).sort((a, b) => b.createdAt - a.createdAt), [rows,accessByUid]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, members.filter(f.match).length])) as Record<Filter, number>, [members]);
  const needle = q.trim().toLowerCase();
  const list = members
    .filter(FILTERS.find((f) => f.id === filter)!.match)
    .filter((m) => !needle || `${m.name} ${m.email} ${m.area} ${(accessByUid.get(m.uid)??[]).map(c=>approvedOrganization(c,discoveryRepository.list())?.title??c.entityTitle).join(" ")}`.toLowerCase().includes(needle));

  return (
    <Panel title="All members" subtitle="Tap someone to see what they get, then open their dashboard exactly as they see it." padded={false}>
      <div className="px-4 pt-3 space-y-2">
        <SearchField value={q} onChange={(v) => { setQ(v); setShown(30); }} placeholder="Name, email, organization or neighbourhood" />
        <FilterRow>
          {FILTERS.map((f) => <FilterChip key={f.id} active={filter === f.id} onClick={() => { setFilter(f.id); setShown(30); }} count={counts[f.id]}>{f.label}</FilterChip>)}
        </FilterRow>
      </div>
      {accessError?<p role="status" className="p-4 text-sm">{accessError}</p>:null}
      {rows === null ? <div className="p-4"><SkeletonRows /></div>
        : !list.length ? <EmptyState icon={<Users size={20} />} title="Nobody matches" body={needle ? 'Try a shorter search.' : 'Members appear here as they sign in.'} />
        : (
          <ul className="mt-2">
            {list.slice(0, shown).map((m) => {
              const isOpen = open === m.uid;
              const organizationNames=[...new Set((accessByUid.get(m.uid)??[]).map(c=>approvedOrganization(c,discoveryRepository.list())?.title).filter(Boolean))];
              return (
                <li key={m.uid} className="border-t" style={{ borderColor: T.line }}>
                  <button type="button" className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(isOpen ? null : m.uid)} aria-expanded={isOpen}>
                    <span className="grid place-items-center w-10 h-10 shrink-0 rounded-full overflow-hidden text-sm font-extrabold" style={{ background: '#FFDF4F', color: T.ink, border: `1.5px solid ${T.ink}` }}>
                      {m.photo ? <img src={m.photo} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : m.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <strong className="text-sm truncate" style={{ color: T.ink }}>{m.name}</strong>
                        {m.role === 'admin' ? <Chip tone="signal">Admin</Chip> : null}
                        {m.business ? <Chip tone="ok">Business</Chip> : null}
                      </span>
                      {organizationNames.length?<span className="block text-xs font-semibold truncate" style={{color:T.ok}}>Manages {organizationNames.join(' · ')}</span>:m.business?<span className="block text-xs" style={{color:T.muted}}>Organization authority needs review</span>:null}
                      <span className="block text-xs truncate" style={{ color: T.muted }}>
                        {m.area ? <><MapPin size={11} className="inline -mt-0.5" /> {m.area} · </> : 'No area · '}{m.plan.kind === 'none' ? 'No email' : m.plan.name}
                      </span>
                    </span>
                    <span className="text-[0.65rem] shrink-0" style={{ fontFamily: mono, color: T.muted }}><TimeAgo ts={m.createdAt} /></span>
                    <ChevronDown size={16} className="shrink-0 transition-transform" style={{ color: T.muted, transform: isOpen ? 'rotate(180deg)' : undefined }} />
                  </button>
                  {isOpen ? (
                    <div className="px-4 pb-4 space-y-3">
                      <p className="text-xs break-all" style={{ fontFamily: mono, color: T.muted }}>{m.email || 'No email on file'}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <Chip tone={m.weekly ? 'ok' : 'neutral'}>{m.weekly ? 'Safety brief on' : 'Safety brief off'}</Chip>
                        <Chip tone={m.events ? 'ok' : 'neutral'}>{m.events ? 'Event picks on' : 'Event picks off'}</Chip>
                        {m.plan.kind === 'combined' ? <Chip tone="signal">Gets “Your week” on Mondays</Chip> : null}
                      </div>
                      {m.interests.length ? (
                        <div className="flex flex-wrap gap-1.5">{m.interests.map((i) => <span key={i} className="text-[0.7rem] font-semibold px-2 py-1 rounded-full" style={{ background: '#FFF5CC', color: '#5A4A00' }}>{interestLabel(i)}</span>)}</div>
                      ) : <p className="text-xs" style={{ color: T.muted }}>No interests picked yet.</p>}
                      {m.business?<div className="rounded-lg border p-3 space-y-2"><strong>Approved management access</strong>
                        {(accessByUid.get(m.uid)??[]).length?(accessByUid.get(m.uid)??[]).map(c=>{const org=approvedOrganization(c,discoveryRepository.list());return <div key={c.entityId}>
                          <p><strong>{org?.title??c.entityTitle}</strong> · {org?'Organization manager':'Specific listing only; organization access needs confirmation'}</p>
                          <p>{c.role}{c.reviewedAt?` · approved ${new Date(c.reviewedAt).toLocaleDateString('en-CA')}`:''}</p>
                          {org?<><p>{discoveryRepository.list().filter(e=>e.kind==='event'&&e.organizerEntityId===org.id&&!e.cancelled&&Date.parse(e.end)>Date.now()).length} upcoming linked events</p><Link to={`/organization/${org.id}?as=${encodeURIComponent(m.uid)}`}>Their organization workspace</Link> · <Link to={entityPath(org)}>Public organization profile</Link></>:<Link to={`/admin/partners`}>Confirm organization access in Claims</Link>}
                          <p className="text-xs">Source approval: {c.entityTitle}</p>
                        </div>;}):<p>No approved claim loaded for this account. Review Claims before granting management access.</p>}
                      </div>:null}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Link to={`/plans?as=${encodeURIComponent(m.uid)}`} className="inline-flex items-center justify-center gap-1.5 h-10 rounded-lg text-sm font-bold" style={{ background: T.ink, color: '#fff' }}>
                          <LayoutDashboard size={15} /> Their dashboard
                        </Link>
                        <Link to={`/admin/users?uid=${encodeURIComponent(m.uid)}`} className="inline-flex items-center justify-center gap-1.5 h-10 rounded-lg border text-sm font-semibold" style={{ borderColor: T.line, color: T.ink }}>
                          <ExternalLink size={14} /> Full profile
                        </Link>
                        {m.email ? (
                          <a href={`mailto:${m.email}`} className="inline-flex items-center justify-center gap-1.5 h-10 rounded-lg border text-sm font-semibold" style={{ borderColor: T.line, color: T.ink }}><Mail size={14} /> Email</a>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      {list.length > shown ? (
        <div className="p-4 border-t" style={{ borderColor: T.line }}>
          <button type="button" className="w-full h-10 rounded-lg border text-sm font-semibold" style={{ borderColor: T.line, color: T.ink }} onClick={() => setShown((n) => n + 30)}>
            Show more ({list.length - shown} left)
          </button>
        </div>
      ) : null}
    </Panel>
  );
}
