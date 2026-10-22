import {adminObject,adminText,adminTimestamp} from './adminRecord';
import {adminSubmissionInput} from './adminContentRecords';
import type {DiscoveryEntity} from '../types/discovery';
/** An approval is a decision, not proof that the public release contains its listings. */
export function submissionHistoryRecord(id:string,value:unknown,inventory:readonly DiscoveryEntity[]){
 const raw=adminObject(value),input=adminSubmissionInput(raw.input);
 const ids=[...new Set([adminText(raw.entityId),...(Array.isArray(raw.publishedEntityIds)?raw.publishedEntityIds.filter((id):id is string=>typeof id==='string'):[])].filter(Boolean))];
 const published=ids.map(id=>inventory.find(e=>e.id===id&&e.status==='published')).filter((e):e is DiscoveryEntity=>!!e);
 const missing=ids.filter(id=>!published.some(e=>e.id===id));
 const rejected=raw.status==='rejected';
 return {id,input,title:input?.title??'Unreadable submission',status:rejected?'rejected':'approved',createdAt:adminTimestamp(raw.createdAt),reviewedAt:adminTimestamp(raw.reviewedAt),reviewedBy:adminText(raw.reviewedBy),ids,published,missing,needsAttention:!rejected&&(!ids.length||missing.length>0),note:adminText(raw.note)||adminText(raw.message),reason:adminText(raw.rejectionReason)||adminText(raw.reason)};
}
