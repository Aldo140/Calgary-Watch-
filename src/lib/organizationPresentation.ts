import type { DiscoveryEntity } from '../types/discovery';
import type { OrganizationProjection } from './organizationWorkspace';
/** A slower initial read must never overwrite a newer live update or removal. */
export function mergeOrganizationRows(current:readonly OrganizationProjection[],incoming:readonly OrganizationProjection[]):OrganizationProjection[]{
  const rows=new Map(current.map(row=>[row.entityId,row]));
  for(const row of incoming)if(!rows.has(row.entityId)||rows.get(row.entityId)!.updatedAt<=row.updatedAt)rows.set(row.entityId,row);
  return [...rows.values()];
}
export function organizationListingState(entity:DiscoveryEntity,deleted:ReadonlySet<string>,now=Date.now()):string{
  if(deleted.has(entity.id))return 'removed';
  if(entity.kind==='market')return 'market';
  if(entity.kind==='event'){if(entity.cancelled)return 'cancelled';return Date.parse(entity.end)<=now?'past':'upcoming';}
  return 'profile';
}
