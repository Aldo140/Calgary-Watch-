import type {DiscoveryEntity} from '../types/discovery';
type Decision={status:string;createdAt:number;action:{action?:string;id?:string};payload:Record<string,unknown>;result?:{stage?:string;id?:string;entityId?:string}};
/** Processing and public publication are separate; use this release's actual inventory as proof. */
export function moderationPublicationNote(decision:Decision, inventory:readonly DiscoveryEntity[]):string {
 if(decision.status!=='applied')return '';
 if(decision.result?.stage==='verified'||decision.action.action==='publish'){
  const id=decision.result?.id||decision.result?.entityId||decision.action.id;
  const entity=inventory.find(entity=>entity.id===id&&entity.status==='published');
  return entity&&Date.parse(entity.updatedAt)>=decision.createdAt?'Published on CalgaryWatch.':'Verified; awaiting a successful website release.';
 }
 if(decision.action.action==='review-submission'&&decision.payload.reject!==true&&decision.result?.stage!=='rejected')return 'Imported for review; open the listing to verify & publish.';
 return '';
}
