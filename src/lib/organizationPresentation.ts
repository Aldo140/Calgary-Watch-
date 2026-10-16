import { calgaryDateTimeFormat } from './calgaryTz';
import type { DiscoveryEntity } from '../types/discovery';
import type { OrganizationProjection } from './organizationWorkspace';
const programmeDateFormatter = calgaryDateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' });

/** A slower initial read must never overwrite a newer live update or removal. */
export function mergeOrganizationRows(current:readonly OrganizationProjection[],incoming:readonly OrganizationProjection[]):OrganizationProjection[]{
  const rows=new Map(current.map(row=>[row.entityId,row]));
  let changed=false;
  for(const row of incoming){const previous=rows.get(row.entityId);if(!previous||previous.updatedAt<row.updatedAt||previous.updatedAt===row.updatedAt&&previous.batchId!==row.batchId){rows.set(row.entityId,row);changed=true;}}
  return changed?[...rows.values()]:current as OrganizationProjection[];
}
export function organizationListingState(entity:DiscoveryEntity,deleted:ReadonlySet<string>,now=Date.now()):string{
  if(deleted.has(entity.id))return 'removed';
  if(entity.kind==='market')return 'market';
  if(entity.kind==='event'){if(entity.cancelled)return 'cancelled';return Date.parse(entity.end)<=now?'past':'upcoming';}
  return 'profile';
}

/** Sort only when the programme, filter or search changes; events precede recurring markets. */
export function filterOrganizationProgramme(entities:readonly DiscoveryEntity[],deleted:ReadonlySet<string>,filter:string,search:string,now=Date.now()):DiscoveryEntity[]{
  const needle=search.normalize('NFKC').trim().toLocaleLowerCase('en-CA');
  return entities.filter(entity=>(entity.kind==='event'||entity.kind==='market')&&(filter==='all'||organizationListingState(entity,deleted,now)===filter)&&`${entity.title} ${'address' in entity?entity.address:''}`.normalize('NFKC').toLocaleLowerCase('en-CA').includes(needle))
    .sort((a,b)=>a.kind==='event'&&b.kind==='event'?Date.parse(a.start)-Date.parse(b.start)||a.title.localeCompare(b.title):a.kind===b.kind?a.title.localeCompare(b.title):a.kind==='event'?-1:1);
}

/** Date-only productions never display placeholder midnight as a showtime. */
export function organizationSchedule(entity: DiscoveryEntity): string {
  if (entity.kind !== 'event') return 'Market · open its calendar for dates';
  if (entity.schedulePrecision === 'date') return `${entity.start.slice(0, 10)} · Check official showtimes`;
  return programmeDateFormatter.format(new Date(entity.start));
}
