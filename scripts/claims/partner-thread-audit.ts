/** Private read-only audit. stdout is piped directly to encryption, never to a public log. */
import {inventoryDatabase} from '../discovery/firebase';
import {outlookConfigured,readPartnerConversations} from '../ops/lib/outlook';
const targets=[{id:'funnyfest',search:'participants:tickets@funnyfest.com'},{id:'jupiter',search:'participants:a.g.cooper22@gmail.com'},{id:'emmedia',search:'emmedia'},{id:'hex',search:'participants:cam@hex.ca'},{id:'cuff',search:'participants:calgaryundergroundfilm.org'}];
const db=inventoryDatabase(),leads=await db.collection('partner_leads').limit(2000).get();
const retained=leads.docs.map(d=>({id:d.id,...d.data()})).filter(row=>/funnyfest|jupiter|emmedia|hex\.ca|hex after dark|calgaryundergroundfilm/i.test(JSON.stringify(row)));
const threads=[];
for(const target of targets){try{threads.push({id:target.id,...(outlookConfigured()?await readPartnerConversations(target.search):{error:'Microsoft Graph credentials are not configured in this workflow.'})});}catch(e){threads.push({id:target.id,error:e instanceof Error?e.message:'Outlook read failed'});}}
process.stdout.write(JSON.stringify({at:new Date().toISOString(),retained,threads}));
