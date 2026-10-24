import {memberAccountInsights,type MemberAuthRecord} from '../../lib/memberAccountInsights';
import {calgaryDateTimeFormat} from '../../lib/calgaryTz';
import { collection, doc, getDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { discoveryRepository } from '../../data/discovery';
import {approvedManagementOrganization as approvedOrganization} from '../../lib/claimOrganization';
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
import { realName } from '@/src/lib/auth';
import { AdminButton, Chip, EmptyState, FilterChip, FilterRow, Panel, SearchField, SkeletonRows, T, TimeAgo, mono } from './ui';

type Row = { id: string; uid: string } & Record<string, unknown>;
type Filter = 'all' | 'both' | 'monday' | 'events' | 'none' | 'no-area' | 'no-name' | 'business' | 'organizer' | 'new' | 'google' | 'email-signin' | 'recent' | 'attention';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? v : 0);

function shape(r: Row, auth?: MemberAuthRecord) {
  const weekly = r.weeklyDigestOptIn === true;
  const events = r.eventsDigestOptIn === true;
  const area = (str(r.neighborhood) || str(r.inferredNeighborhood)).trim();
  return {
    uid: r.uid || r.id,
    // Accounts that never gave a name show their email, so admin can still tell them apart.
    name: realName(r.displayName) || str(r.email) || 'No name yet',
    named: Boolean(realName(r.displayName)),
    email: str(r.email),
    photo: str(r.photoURL),
    area,
    weekly,
    events,
    interests: normalizeInterests(r.eventInterests),
    createdAt: auth?.createdAt ?? num(r.createdAt),
    account: memberAccountInsights(r,auth),
    role: str(r.role),
    business: r.accountType === 'business',
    // Made on a claim page (FirebaseProvider → signupFields): an organizer, not a resident reader.
    organizer: r.signupAs === 'organizer',
    signupEntityId: str(r.signupEntityId),
    plan: emailPlan(weekly, events, Date.now()),
  };
}

const FILTERS: Array<{ id: Filter; label: string; match: (m: ReturnType<typeof shape>) => boolean }> = [
  { id: 'all', label: 'Everyone', match: () => true },
  { id:'google',label:'Google sign-in',match:m=>m.account.providers.includes('google.com')},
  { id:'email-signin',label:'Email sign-in',match:m=>m.account.providers.includes('password')},
  { id:'recent',label:'Signed in this week',match:m=>m.account.recent},
  { id:'attention',label:'Needs attention',match:m=>m.account.disabled===true||m.account.emailVerified===false||!m.account.profileSaved},
  { id: 'both', label: 'Your week (both)', match: (m) => m.weekly && m.events },
  { id: 'monday', label: 'Safety only', match: (m) => m.weekly && !m.events },
  { id: 'events', label: 'Event picks only', match: (m) => !m.weekly && m.events },
  { id: 'none', label: 'No email', match: (m) => !m.weekly && !m.events },
  { id: 'no-area', label: 'No home area', match: (m) => !m.area },
  { id: 'no-name', label: 'No name', match: (m) => !m.named },
  { id: 'business', label: 'Business accounts', match: (m) => m.business },
  { id: 'organizer', label: 'Organizer sign-ups', match: (m) => m.organizer },
  { id: 'new', label: 'New this week', match: (m) => m.createdAt > Date.now() - 7 * 86_400_000 },
];

export function MembersDirectory() {
  const [directoryError,setDirectoryError]=useState('');
  const [authRows,setAuthRows]=useState<MemberAuthRecord[]>([]),[authAt,setAuthAt]=useState<number|null>(null),[authError,setAuthError]=useState(''),[authAttempt,setAuthAttempt]=useState(0);
  const [sort,setSort]=useState('joined');
  const date=(value:number|null)=>value?calgaryDateTimeFormat('en-CA',{dateStyle:'medium',timeStyle:'short'}).format(value):'Not recorded';
  useEffect(()=>{let active=true;if(!db)return;setAuthError('');void (async()=>{
    const index=await getDoc(doc(db!,'ops_health','member_auth'));
    if(!index.exists()){if(active)setAuthError('Historical Auth details are awaiting the first snapshot. Saved sign-in details are shown where available.');return;}
    const data=index.data(),ids=Array.isArray(data.chunkIds)?data.chunkIds.filter((id:unknown):id is string=>typeof id==='string'&&/^member_auth_[0-9]+_[0-9]+$/.test(id)).slice(0,100):[];
    const chunks=await Promise.all(ids.map(id=>getDoc(doc(db!,'ops_health',id))));
    if(chunks.some(chunk=>!chunk.exists()||chunk.data()?.generation!==data.generation))throw Error('Snapshot is incomplete. Please refresh it.');
    const records=chunks.flatMap(chunk=>Array.isArray(chunk.data()?.accounts)?chunk.data()!.accounts:[]).filter((row:any)=>typeof row?.uid==='string'&&Array.isArray(row.providers)&&row.providers.every((p:unknown)=>typeof p==='string')) as MemberAuthRecord[];
    if(active){setAuthRows(records);setAuthAt(typeof data.at==='number'?data.at:null);}
  })().catch(()=>{if(active)setAuthError('Historical Auth details could not load. Saved profile details are still available.');});return()=>{active=false;};},[authAttempt]);
  const authByUid=useMemo(()=>new Map(authRows.map(row=>[row.uid,row])),[authRows]);
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
    return adminUsers.subscribe(db, ({ rows: r, loading, error }) => { setDirectoryError(error??'');if (!loading || r.length) setRows(r as Row[]); });
  }, []);

  const members = useMemo(() => {const merged=new Map<string,Row>((rows??[]).map(row=>[row.uid||row.id,row]));for(const account of authRows)if(!merged.has(account.uid))merged.set(account.uid,{id:account.uid,uid:account.uid,email:account.email??'',displayName:account.displayName??'',createdAt:account.createdAt??0,profileSaved:false});return [...merged.values()].map(row=>{const member=shape(row,authByUid.get(row.uid||row.id));return {...member,business:member.business||(accessByUid.get(member.uid)?.length??0)>0};}).sort((a,b)=>sort==='signin'?(b.account.lastSignInAt??0)-(a.account.lastSignInAt??0):sort==='name'?a.name.localeCompare(b.name):b.createdAt-a.createdAt);}, [rows,authRows,authByUid,accessByUid,sort]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, members.filter(f.match).length])) as Record<Filter, number>, [members]);
  const needle = q.trim().toLowerCase();
  const list = members
    .filter(FILTERS.find((f) => f.id === filter)!.match)
    .filter((m) => !needle || `${m.name} ${m.email} ${m.area} ${m.account.providerLabels.join(" ")} ${m.uid} ${(accessByUid.get(m.uid)??[]).map(c=>approvedOrganization(c,discoveryRepository.list())?.title??c.entityTitle).join(" ")}`.toLowerCase().includes(needle));

  return (
    <Panel title="All members" subtitle="Tap someone to see what they get, then open their dashboard exactly as they see it." padded={false}>
      <div className="px-4 pt-3 space-y-3">
        <div className="flex flex-wrap gap-2"><Chip>{members.length} accounts</Chip><Chip>{members.filter(m=>m.account.recent).length} signed in this week</Chip><Chip>{members.filter(m=>m.account.emailVerified===false).length} email unverified</Chip><Chip>{members.filter(m=>m.account.disabled).length} disabled</Chip></div>
        <div className="flex flex-wrap items-end justify-between gap-3"><p className="text-xs" style={{color:T.muted}}>Auth snapshot: {date(authAt)} · Refreshed every four hours. Sign-ins and session renewals are different from page visits.</p><label className="text-xs font-semibold">Sort accounts<select className="ml-2 rounded border p-2" value={sort} onChange={e=>setSort(e.target.value)}><option value="joined">Newest accounts</option><option value="signin">Latest sign-in</option><option value="name">Name</option></select></label><AdminButton variant="outline" onClick={()=>{setAuthAttempt(n=>n+1);if(db)void adminUsers.refresh(db);}}>Refresh saved data</AdminButton></div>
        {authError?<p role="status" className="text-xs" style={{color:T.muted}}>{authError}</p>:null}
        <SearchField value={q} onChange={(v) => { setQ(v); setShown(30); }} placeholder="Name, email, organization or sign-in method" />
        <FilterRow>
          {FILTERS.map((f) => <FilterChip key={f.id} active={filter === f.id} onClick={() => { setFilter(f.id); setShown(30); }} count={counts[f.id]}>{f.label}</FilterChip>)}
        </FilterRow>
      </div>
      {accessError?<p role="status" className="p-4 text-sm">{accessError}</p>:null}
      {directoryError?<div className="p-4"><p role="alert">Members could not be loaded: {directoryError}</p><AdminButton variant="outline" onClick={()=>{if(db)void adminUsers.refresh(db);}}>Retry members</AdminButton></div>:rows === null ? <div className="p-4"><SkeletonRows /></div>
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
                        {m.account.disabled?<Chip tone="critical">Disabled</Chip>:null}
                        {m.role === 'admin' ? <Chip tone="signal">Admin</Chip> : null}
                        {m.business ? <Chip tone="ok">Business</Chip> : m.organizer ? <Chip tone="signal">Organizer</Chip> : null}
                      </span>
                      {organizationNames.length?<span className="block text-xs font-semibold truncate" style={{color:T.ok}}>Manages {organizationNames.join(' · ')}</span>:m.organizer&&!m.business?<span className="block text-xs truncate" style={{color:T.muted}}>Signed up to claim {discoveryRepository.list().find(e=>e.id===m.signupEntityId)?.title??m.signupEntityId}</span>:m.business?<span className="block text-xs" style={{color:T.muted}}>Organization authority needs review</span>:null}
                      <span className="block text-xs truncate" style={{ color: T.muted }}>
                        {m.area ? <><MapPin size={11} className="inline -mt-0.5" /> {m.area} · </> : 'No area · '}{m.plan.kind === 'none' ? 'No email' : m.plan.name}
                      </span>
                      <span className="block text-xs mt-1" style={{color:T.muted}}>{m.account.providerLabels.join(' + ')||'Sign-in method not recorded'} · Last sign-in {m.account.lastSignInAt?<TimeAgo ts={m.account.lastSignInAt}/>: 'not recorded'}</span>
                    </span>
                    <span className="text-[0.65rem] shrink-0" style={{ fontFamily: mono, color: T.muted }}>{m.createdAt?<TimeAgo ts={m.createdAt} />:'Joined date unknown'}</span>
                    <ChevronDown size={16} className="shrink-0 transition-transform" style={{ color: T.muted, transform: isOpen ? 'rotate(180deg)' : undefined }} />
                  </button>
                  {isOpen ? (
                    <div className="px-4 pb-4 space-y-3">
                      <p className="font-semibold">{m.name}</p>
                      <p className="text-xs break-all" style={{ fontFamily: mono, color: T.muted }}>{m.email || 'No email on file'}</p>
                      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 rounded-xl border p-3 text-sm" style={{borderColor:T.line}}>
                        {[
                          ['Sign-in methods',m.account.providerLabels.join(' + ')||'Not recorded'],
                          ['Original signup method',m.account.signupMethod||'Not recorded for this account'],
                          ['Account created',date(m.account.createdAt)],
                          ['Last sign-in',date(m.account.lastSignInAt)],
                          ['Last session renewal',date(m.account.lastRefreshAt)],
                          ['Email verification',m.account.emailVerified===true?'Verified':m.account.emailVerified===false?'Not verified':'Not recorded'],
                          ['Auth account status',m.account.disabled===null?'Not recorded':m.account.disabled?'Disabled':'Enabled'],
                          ['Profile',m.account.profileSaved?'Saved':'Account exists; profile not saved yet'],
                          ['Data source',m.account.source],
                        ].map(([label,value])=><div key={label} className="min-w-0"><dt className="text-xs" style={{color:T.muted}}>{label}</dt><dd className="mt-1 font-medium break-words">{value}</dd></div>)}
                      </dl>
                      <p className="text-xs" style={{color:T.muted}}>Linked methods show how this account can sign in today. They do not prove its original signup method. A session renewal does not mean a new sign-in.</p>
                      {m.account.emailVerified===false?<p className="text-sm" style={{color:T.muted}}>Follow-up: email verification is incomplete. Claims and event submissions require verification.</p>:null}
                      <details className="text-xs"><summary className="cursor-pointer">Account reference</summary><code className="block mt-2 break-all">{m.uid}</code></details>
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
                          <p><strong>{org?.title??c.entityTitle}</strong> · {org?.managementOnly?'Organizer workspace · scoped to this listing and events they add':org?'Organization manager':'Listing unavailable; review access'}</p>
                          <p>{c.role}{c.reviewedAt?` · approved ${new Date(c.reviewedAt).toLocaleDateString('en-CA')}`:''}</p>
                          {org?<><p>{discoveryRepository.list().filter(e=>e.kind==='event'&&(e.organizerEntityId===org.id||e.id===org.sourceListingId)&&!e.cancelled&&Date.parse(e.end)>Date.now()).length} upcoming linked events</p><Link to={`/organization/${org.id}?as=${encodeURIComponent(m.uid)}`}>Their organization workspace</Link> · <Link to={org.sourceListingId?c.entityPath:entityPath(org)}>{org.managementOnly?'Public listing':'Public organization profile'}</Link></>:<Link to={`/admin?section=partners`}>Confirm organization access in Claims</Link>}
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
