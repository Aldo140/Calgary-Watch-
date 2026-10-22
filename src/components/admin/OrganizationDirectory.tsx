import {useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {discoveryRepository} from '../../data/discovery';
import {organizationDirectory} from '../../lib/organizationDirectory';
import {entityPath} from '../../lib/discovery';
import {organizationSchedule} from '../../lib/organizationPresentation';
import {Panel, Chip, T, inputClass, inputStyle} from './ui';

export function OrganizationDirectory() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const rows = organizationDirectory(discoveryRepository.list());
  const shown = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('en-CA');
    return rows.filter(({profile, events, markets}) => (status === 'all' || (status === 'claimed' ? profile.claimed : status === 'unclaimed' ? !profile.claimed : events.length + markets.length === 0))
      && [profile.title, ...profile.categories, ...events.map(e => e.title), ...markets.map(e => e.title)].join(' ').toLocaleLowerCase('en-CA').includes(needle));
  }, [rows, search, status]);
  return <Panel title="Local partners & organizations" subtitle="Published organization profiles and their linked programme. A listed profile does not imply a commercial partnership.">
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" aria-label="Directory totals">
        <Chip>{rows.length} organizations</Chip><Chip>{rows.filter(r => r.profile.claimed).length} claimed profiles</Chip>
        <Chip>{rows.reduce((n, r) => n + r.events.length, 0)} upcoming events</Chip><Chip>{rows.reduce((n, r) => n + r.markets.length, 0)} markets</Chip>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="text-sm font-semibold">Find an organization or event<input className={`${inputClass} mt-1 w-full`} style={inputStyle} type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Organization, category or event name" /></label>
        <label className="text-sm font-semibold">Show<select className={`${inputClass} mt-1 w-full`} style={inputStyle} value={status} onChange={e => setStatus(e.target.value)}><option value="all">All organizations</option><option value="claimed">Claimed profiles</option><option value="unclaimed">Unclaimed profiles</option><option value="empty">No upcoming programme</option></select></label>
      </div>
      <p className="text-sm" role="status" style={{color:T.muted}}>{shown.length} of {rows.length} organizations · Event counts include ongoing runs and exclude past or cancelled events.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {shown.map(({profile, events, markets}) => <article key={profile.id} className="min-w-0 rounded-xl border p-4 space-y-3" style={{borderColor:T.line}}>
          <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-bold break-words"><Link to={entityPath(profile)} style={{color:T.signal}}>{profile.title}</Link></h3><Chip tone={profile.claimed ? 'ok' : 'neutral'}>{profile.claimed ? 'Claimed' : 'Unclaimed'}</Chip></div>
          <p className="text-sm" style={{color:T.muted}}>{profile.summary}</p>
          <div className="flex flex-wrap gap-2"><Chip>{events.length} upcoming events</Chip><Chip>{markets.length} markets</Chip>{profile.partner && <Chip tone="signal">Commercial partner</Chip>}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold" style={{color:T.signal}}><Link to={entityPath(profile)}>Public profile</Link><Link to={`/organization/${profile.id}`}>Organizer workspace</Link>{profile.website && <a href={profile.website} target="_blank" rel="noreferrer">Official website ↗</a>}</div>
          {events.length + markets.length > 0 ? <details><summary className="cursor-pointer text-sm font-semibold py-1">View linked events & markets ({events.length + markets.length})</summary><ul className="mt-2 divide-y" style={{borderColor:T.line}}>{[...events, ...markets].map(event => <li key={event.id} className="py-2"><Link className="text-sm font-semibold break-words" style={{color:T.signal}} to={entityPath(event)}>{event.title}</Link><p className="text-xs mt-1" style={{color:T.muted}}>{organizationSchedule(event)}{event.kind === 'event' && event.schedulePrecision === 'date' ? ` · through ${new Date(Date.parse(event.end) - 86400000).toISOString().slice(0,10)}` : ''}</p></li>)}</ul></details> : <p className="text-sm" style={{color:T.muted}}>No upcoming linked events or markets. Past listings are excluded from these counts.</p>}
        </article>)}
      </div>
      {!shown.length && <p className="py-6 text-sm">No organizations match these filters. Try another name or show all organizations.</p>}
    </div>
  </Panel>;
}
