import type {ManagementOrganization} from './claimOrganization';
import {adminListingPatch} from './adminListingEdits';
import type { Business, DiscoveryEntity, Event, MarketOccurrence } from '../types/discovery';
import { ownerEditPatch, ownerEditableFields, OWNER_EDIT_INTERVAL } from './ownerListingEdits';
export const ORGANIZATION_CATALOG='organization_catalog';
export const ORGANIZATION_LIVE='organization_live_content';
export type OrganizationChange={entityId:string;action:'edit'|'add'|'delete';changes:Record<string,unknown>};
export type OrganizationProjection={entityId:string;organizationId:string;entity:DiscoveryEntity;deleted:boolean;changes?:Record<string,unknown>;submittedByAdmin?:boolean;createdInWorkspace?:boolean;workspaceAssociationConfirmed?:boolean;adminMedia?:Record<string,unknown>;occurrences?:MarketOccurrence[];updatedAt:number;batchId:string};
export function approvedOrganization(claim:{status:string;entityId:string;approvedOrganizationId?:string},entities:readonly DiscoveryEntity[]):Business|undefined {
  if(claim.status!=='approved')return;
  return entities.find((e):e is Business=>e.kind==='business'&&e.id===(claim.approvedOrganizationId||claim.entityId));
}
export function organizationEvent(org:ManagementOrganization,id:string,now:number):Event {
  return {id,slug:id,kind:'event',title:'New event',summary:'',description:'',address:org.address,categories:[],tags:[],sources:org.sources.filter(s=>s.kind==='official'),status:'published',verification:'organization-confirmed',verifiedAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),start:'',end:'',timezone:'America/Edmonton',pricing:'unknown',organizer:org.title,organizerEntityId:org.id,ownerVerifiedAt:new Date(now).toISOString()};
}
export function prepareOrganizationBatch(org:ManagementOrganization,entities:readonly DiscoveryEntity[],operations:OrganizationChange[],now:number,adminEdit=false) {
  if(!Array.isArray(operations)||!operations.length||operations.length>25)throw Error('Include between 1 and 25 changes in one submission.');
  if(new Set(operations.map(o=>o.entityId)).size!==operations.length)throw Error('Bundle each listing into one change.');
  return operations.map(op=>{
    if(!op||!['edit','add','delete'].includes(op.action)||typeof op.entityId!=='string'||op.entityId.length>200||!/^[a-z0-9-]+$/.test(op.entityId))throw Error('Invalid listing operation.');
    let entity=entities.find(e=>e.id===op.entityId);
    if(op.action==='add'){
      if(org.kind!=='business')throw Error('Only organization profiles can add events.');
      if(entity||!op.entityId.startsWith(`${org.id}-event-`)||!/[a-f0-9-]{36}$/.test(op.entityId))throw Error('Use a new event identifier for this organization.');
      entity=organizationEvent(org,op.entityId,now);
      if(adminEdit&&!org.ownerVerifiedAt)delete entity.ownerVerifiedAt;
    }
    if(!entity||entity.status!=='published'||!(entity.id===org.id||entity.id===org.sourceListingId||(entity.kind==='event'||entity.kind==='market')&&entity.organizerEntityId===org.id))throw Error('This listing is outside your approved organization.');
    if(op.action==='delete'&&entity.kind!=='event')throw Error('The organization profile cannot be deleted.');
    const patch=op.action==='delete'?{}:(adminEdit?adminListingPatch:ownerEditPatch)(entity,op.changes);
    const {occurrences:_dates,...fields}=patch;
    const after={...entity,...fields,updatedAt:new Date(now).toISOString(),verifiedAt:new Date(now).toISOString(),...(!adminEdit?{ownerVerifiedAt:entity.ownerVerifiedAt||new Date(now).toISOString()}:{} )};
    if(after.kind==='event'&&(!after.title.trim()||!after.address.trim()||!Number.isFinite(Date.parse(after.start))||!Number.isFinite(Date.parse(after.end))))throw Error('Each event needs a name, address, start and end.');
    if(op.action==='add')after.slug=`${after.title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90)||'event'}-${op.entityId.slice(-8)}`;
    if(after.kind==='event'||after.kind==='market'){if(org.kind==='business'&&(after.id!==org.sourceListingId||!after.organizerEntityId))after.organizerEntityId=org.id;after.verification=adminEdit?'source-checked':'organization-confirmed';}
    if(!after.sources.some(s=>s.kind==='official'))throw Error('An official organization source is required.');
    return {operation:op,before:op.action==='add'?null:entity,entity:after,deleted:op.action==='delete'};
  });
}
/** Server-only projections are complete safe entities. Tombstones always win over re-ingested feeds. */
export function mergeOrganizationContent(entities:readonly DiscoveryEntity[],rows:readonly OrganizationProjection[]):DiscoveryEntity[]{
  const map=new Map(entities.map(e=>[e.id,e]));
  for(const row of rows){
    const base=map.get(row.entityId);
    const managed=(row.createdInWorkspace===true||row.workspaceAssociationConfirmed===true)&&row.entity.id===row.entityId&&('organizerEntityId' in row.entity)&&row.entity.organizerEntityId===row.organizationId;
    if(!managed&&base&&(base.kind==='event'||base.kind==='market')&&base.organizerEntityId&&base.organizerEntityId!==row.organizationId)continue;
    if(row.deleted){map.delete(row.entityId);continue;}
    if(!base){map.set(row.entityId,row.entity);continue;}
    const changes=row.changes??Object.fromEntries(ownerEditableFields(base.kind).filter(f=>f!=='occurrences'&&f in row.entity).map(f=>[f,(row.entity as unknown as Record<string,unknown>)[f]]));
    const {occurrences:_dates,...fields}=changes;
    const patch=Object.keys(fields).length?(row.submittedByAdmin?adminListingPatch:ownerEditPatch)(base,fields):{};
    const media=row.adminMedia&&Object.keys(row.adminMedia).length?adminListingPatch(base,row.adminMedia):{};
    const canonicalAssociation=(base.kind==='event'||base.kind==='market')?base.organizerEntityId:undefined;
    const retainManagedAssociation=managed&&(!canonicalAssociation||canonicalAssociation===row.organizationId||row.createdInWorkspace===true);
    map.set(row.entityId,{...base,...patch,...media,...(retainManagedAssociation?{organizerEntityId:row.organizationId}:{}),verifiedAt:row.entity.verifiedAt,verification:row.entity.verification,ownerVerifiedAt:row.entity.ownerVerifiedAt,updatedAt:row.entity.updatedAt});
  }
  return [...map.values()];
}
export function organizationNextAt(last:number){return last?last+OWNER_EDIT_INTERVAL:0;}

export function mergeOrganizationOccurrences(original:readonly MarketOccurrence[],rows:readonly OrganizationProjection[]):MarketOccurrence[]{
  let result=[...original];
  for(const row of rows)if(row.entity.kind==='market'&&row.occurrences)result=[...result.filter(o=>o.marketId!==row.entityId),...row.occurrences];
  return result;
}
