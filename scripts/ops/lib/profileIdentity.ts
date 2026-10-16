import {organizationIdentityForName} from '../../../src/lib/organizations';
const normalize=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
type Profile={id:string;kind:string;title:string;slug:string;name?:string;status?:string;developmentOnly?:boolean};
/** No URL is safe merely because it is a real CalgaryWatch profile. It must belong to this recipient. */
export function profileIdentityProblems(input:{recipientOrganization:string;entity?:Profile;profileUrl:string;claimUrl?:string}):string[]{
 const {entity,recipientOrganization}=input;const errors:string[]=[];
 if(!recipientOrganization?.trim()||!entity||entity.status!=='published'||entity.developmentOnly||!['business','market'].includes(entity.kind))return ['Organization URL lacks a published profile and recipient identity.'];
 const known=organizationIdentityForName(recipientOrganization);
 const names=[entity.title,entity.name??'',...(organizationIdentityForName(entity.title)?.names??[])].map(normalize);
 if(!names.includes(normalize(recipientOrganization)))errors.push('Recipient organization does not match the profile organization.');
 if(known&&(known.id!==entity.id||known.slug!==entity.slug))errors.push('Recipient organization, canonical entity ID and public slug do not match.');
 const path=`/${entity.kind==='business'?'local':'markets'}/${entity.slug}`;
 try{const url=new URL(input.profileUrl,'https://calgarywatch.ca');if(!['calgarywatch.ca','www.calgarywatch.ca'].includes(url.hostname)||url.protocol!=='https:'||url.pathname!==path||url.search||url.hash||url.username||url.password||url.port)errors.push('Organization public URL does not match its canonical slug.');}catch{errors.push('Invalid organization public URL.');}
 if(input.claimUrl){try{const url=new URL(input.claimUrl,'https://calgarywatch.ca');if(!['calgarywatch.ca','www.calgarywatch.ca'].includes(url.hostname)||url.protocol!=='https:'||url.pathname!==`/claim/${encodeURIComponent(entity.id)}`||url.search||url.hash||url.username||url.password||url.port)errors.push('Claim entity ID does not match the organization profile.');}catch{errors.push('Invalid organization claim URL.');}}
 return errors;
}
