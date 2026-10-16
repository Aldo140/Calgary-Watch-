import type {Business,DiscoveryEntity,Event,Market} from '../types/discovery';
export const MANAGEMENT_PROFILES='organization_management_profiles';
export type ManagementOrganization=Business&{managementOnly?:true;sourceListingId?:string;allowanceId?:string};
/** A management home is not necessarily a public directory entry. No fuzzy ownership inference. */
export function listingOrganization(listing:DiscoveryEntity,all:readonly DiscoveryEntity[]):Business|undefined{
 if(listing.kind==='business')return listing;
 if(listing.kind!=='event'&&listing.kind!=='market')return;
 return all.find((entity):entity is Business=>entity.kind==='business'&&entity.status==='published'&&!entity.developmentOnly&&entity.id===listing.organizerEntityId);
}
export function standaloneOrganization(listing:Event|Market):ManagementOrganization{
 const title=listing.organizer.trim()||listing.title;
 return {id:`org-${listing.id}`,kind:'business',slug:`org-${listing.id}`,title,name:title,summary:`Management workspace for ${title}.`,description:'',address:'',categories:[],tags:[],sources:listing.sources,status:'published',verification:listing.verification,updatedAt:listing.updatedAt,images:[],socials:{},services:[],claimed:Boolean(listing.ownerVerifiedAt),partner:false,editorialSelection:false,managementOnly:true,sourceListingId:listing.id,allowanceId:listing.organizerEntityId??listing.id,...(listing.ownerVerifiedAt?{ownerVerifiedAt:listing.ownerVerifiedAt}:{}),...(listing.sources.find(s=>s.kind==='official')?{website:listing.sources.find(s=>s.kind==='official')!.url}:{})};
}
export function claimOrganization(listing:DiscoveryEntity,all:readonly DiscoveryEntity[]){
 if((listing.kind==='event'||listing.kind==='market')&&listing.organizerEntityId?.startsWith('org-')){
  const source=all.find(e=>`org-${e.id}`===listing.organizerEntityId);
  if(source&&(source.kind==='event'||source.kind==='market'))return {profile:standaloneOrganization(source),claimEntity:source,publicProfile:false};
 }
 const existing=listingOrganization(listing,all);
 if(existing)return {profile:existing as ManagementOrganization,claimEntity:existing,publicProfile:true};
 if(listing.kind!=='event'&&listing.kind!=='market')return;
 return {profile:standaloneOrganization(listing),claimEntity:listing,publicProfile:false};
}
/** An old event approval remains scoped to that listing until an admin explicitly expands it. */
export function approvedManagementOrganization(claim:{status:string;entityId:string;approvedOrganizationId?:string},all:readonly DiscoveryEntity[]):ManagementOrganization|undefined{
 if(claim.status!=='approved')return;
 const root=all.find(e=>e.id===(claim.approvedOrganizationId||claim.entityId));
 if(root?.kind==='business')return root;
 if(!claim.approvedOrganizationId&&(root?.kind==='event'||root?.kind==='market'))return standaloneOrganization(root);
}
export function managementOrganizationById(id:string,all:readonly DiscoveryEntity[]):ManagementOrganization|undefined{
 const existing=all.find((e):e is Business=>e.kind==='business'&&e.id===id);
 if(existing)return existing;
 const source=all.find(e=>`org-${e.id}`===id);
 if(source?.kind==='event'||source?.kind==='market')return standaloneOrganization(source);
}
export function organizationClaimPath(listing:DiscoveryEntity,all:readonly DiscoveryEntity[]){
 const target=claimOrganization(listing,all)?.claimEntity??listing;
 return `/claim/${encodeURIComponent(target.id)}${target.id!==listing.id?`?listing=${encodeURIComponent(listing.id)}`:''}`;
}
