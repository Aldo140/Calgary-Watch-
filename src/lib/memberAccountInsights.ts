export type MemberAuthRecord={uid:string;email?:string;displayName?:string;providers:string[];emailVerified:boolean;disabled:boolean;createdAt:number|null;lastSignInAt:number|null;lastRefreshAt:number|null};
const timestamp=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0?value:null;
export function providerLabel(provider:string):string{return ({'google.com':'Google','password':'Email sign-in','apple.com':'Apple','facebook.com':'Facebook','microsoft.com':'Microsoft','github.com':'GitHub','phone':'Phone'} as Record<string,string>)[provider]??provider;}
export function memberAccountInsights(row:Record<string,unknown>,record?:MemberAuthRecord,now=Date.now()){
 const providers=record?.providers??(Array.isArray(row.authProviders)?row.authProviders.filter((p):p is string=>typeof p==='string'):[]);
 const lastSignInAt=timestamp(record?record.lastSignInAt:row.lastSignInAt),createdAt=timestamp(record?record.createdAt:row.createdAt);
 return {providers,providerLabels:providers.map(providerLabel),signupMethod:typeof row.signupProvider==='string'?providerLabel(row.signupProvider):null,lastSignInAt,createdAt,lastRefreshAt:timestamp(record?.lastRefreshAt),emailVerified:record?.emailVerified??(typeof row.emailVerified==='boolean'?row.emailVerified:null),disabled:record?.disabled??null,source:record?'Firebase Auth snapshot':'Last saved sign-in session',recent:Boolean(lastSignInAt&&lastSignInAt>=now-7*86400000),firstSignInOnly:Boolean(lastSignInAt&&createdAt&&Math.abs(lastSignInAt-createdAt)<60000),profileSaved:row.profileSaved!==false};
}
