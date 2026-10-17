import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter,Routes,Route} from 'react-router-dom';

// Render the real claim page and routing; replace only auth, database and site chrome.
const require=createRequire(import.meta.url);
const moduleUrl=(source:string)=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
function compile(path:string,replacements:Record<string,string>={}){
 let source=readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import ['"].*\.css['"];?$/gm,'').replace(/^import type .*;$/gm,'');
 source=source.replace(/from (['"])([^'"]+)\1/g,(_,q,name)=>`from ${q}${replacements[name]??pathToFileURL(require.resolve(name)).href}${q}`);
 return moduleUrl(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/from "react\/jsx-runtime"/g,`from "${pathToFileURL(require.resolve('react/jsx-runtime')).href}"`));
}
const claimsModule=compile('../src/lib/claims.ts');
const organizationModule=compile('../src/lib/claimOrganization.ts');
const event={id:'festival',kind:'event',slug:'festival-2027',title:'Festival 2027',organizer:'Festival',summary:'A music festival',description:'',sources:[{name:'Festival',kind:'official',url:'https://festival.ca/'}],status:'published',updatedAt:'2026-10-16',address:'Calgary',categories:[],tags:[]};
const business={...event,id:'biz-festival',kind:'business',slug:'festival',name:'Festival',title:'Festival',socials:{},images:[],services:[]};
const inventory=[event,business,{...event,id:'linked-event',organizerEntityId:business.id}];
async function render({admin=false,user=true,emailVerified=true,claim=null,path='/claim/festival',verified=false,loading=false,failed=false}:{admin?:boolean;user?:boolean;emailVerified?:boolean;claim?:Record<string,unknown>|null;path?:string;verified?:boolean;loading?:boolean;failed?:boolean}={}){
 const userData=user?{uid:'me',email:'me@gmail.com',emailVerified,displayName:'My account'}:null;
 const component=await import(compile('../src/pages/ClaimListingPage.tsx',{
  '../lib/claimPresentation':compile('../src/lib/claimPresentation.ts'),
  '../lib/claimOrganization':organizationModule,
  '../components/admin/AdminAccessBar':compile('../src/components/admin/AdminAccessBar.tsx'),
  '../hooks/useAdminEditMode':compile('../src/hooks/useAdminEditMode.ts'),
  '../lib/organizationWorkspace':moduleUrl('export const approvedOrganization=()=>undefined;'),
  '../components/entity/ListingManagement':moduleUrl('export const ListingManagement=()=>null;'),
  '../lib/claimDraft':compile('../src/lib/claimDraft.ts'),
  '../lib/claimsApi':moduleUrl(`export const useVerifiedListing=()=>${verified};export const useClaimLoadError=()=>${failed};export const useMyClaims=()=>${loading?'null':JSON.stringify(claim?[claim]:[])};export const submitClaim=()=>{throw Error('Rendering must not submit a claim')};`),
  '../components/entity/VerifiedBadge':compile('../src/components/entity/VerifiedBadge.tsx'),
  '../components/site/SiteLayout':moduleUrl('export const SiteLayout=({children})=>children;'),
  '../components/FirebaseProvider':moduleUrl(`export const useAuth=()=>({user:${JSON.stringify(userData)},isAdmin:${admin},isFirebaseConfigured:true,signIn:()=>{throw Error('Rendering must not sign in')}});`),
  '../data/discovery':moduleUrl(`export const discoveryRepository={list:()=>${JSON.stringify(inventory)}};`),
  '../lib/discovery':moduleUrl("export const entityPath=e=>`/${e.kind==='business'?'local':e.kind==='market'?'markets':'events'}/${e.slug}`;"),
  '../lib/claims':claimsModule,
  '../firebase':moduleUrl(`export const auth={currentUser:${JSON.stringify(userData)}};`),
  '../components/plans/Motion':moduleUrl('export const EASE_OUT=[0.2,0.8,0.2,1];'),
 }));
 return renderToStaticMarkup(createElement(MemoryRouter,{initialEntries:[path]},createElement(Routes,null,createElement(Route,{path:'/claim/:id',element:createElement(component.default)}))));
}
test('new visitors get a claim form with email and Google account choices',async()=>{
 const html=await render({user:false});assert.match(html,/<form/);assert.match(html,/Sign in or create an account/);assert.match(html,/Create a free account with email or continue with Google/);assert.doesNotMatch(html,/Administrator listing access|Admin preview/);
});
test('an existing personal or business account can apply without signing out or onboarding',async()=>{
 for(const path of ['/claim/festival','/claim/biz-festival','/claim/biz-festival?listing=linked-event']){
  const html=await render({path});assert.match(html,/<form/);assert.match(html,/Claim organization profile/);assert.match(html,/no new account or paid plan is needed/);assert.doesNotMatch(html,/Administrator listing access/);
 }
});
test('an unverified email account sees recovery actions and cannot submit a claim',async()=>{
 const html=await render({emailVerified:false});assert.match(html,/Verify me@gmail.com/);assert.match(html,/Check verification/);assert.match(html,/Resend email/);assert.match(html,/Verify email to continue/);assert.match(html,/<button[^>]*type="submit"[^>]*disabled/);
});
test('an admin opening an emailed claim link sees the actual application by default',async()=>{
 const html=await render({admin:true});assert.match(html,/<form/);assert.match(html,/Claim organization profile/);assert.match(html,/Open admin management/);assert.doesNotMatch(html,/Admin preview — read-only|Administrator listing access/);
});
test('admin management is explicit, read-only by default and provides a way back to claiming',async()=>{
 const html=await render({admin:true,path:'/claim/biz-festival?view=admin&listing=linked-event'});
 assert.doesNotMatch(html,/<form/);assert.match(html,/Admin preview — read-only/);assert.match(html,/Enable admin editing/);assert.match(html,/aria-checked="false"/);assert.match(html,/href="\/claim\/biz-festival\?listing=linked-event"/);
});
test('non-admin query parameters cannot grant admin or member-preview access',async()=>{
 const html=await render({path:'/claim/festival?view=admin&as=someone-else'});assert.match(html,/<form/);assert.doesNotMatch(html,/Administrator listing access|Enable admin editing|Admin preview/);
});
test('approved owners get management, pending claimants get status, and other representatives can apply',async()=>{
 const base={entityId:'festival',entityTitle:'Festival',createdAt:Date.now(),role:'Owner',workEmail:'me@gmail.com',accountEmail:'me@gmail.com'};
 assert.doesNotMatch(await render({claim:{...base,status:'approved'}}),/<form/);
 const pending=await render({claim:{...base,status:'pending'}});assert.match(pending,/confirming your claim/);assert.doesNotMatch(pending,/<form/);
 const additional=await render({verified:true});assert.match(additional,/<form/);assert.match(additional,/Request organization access/);assert.match(additional,/existing managers keep their access/);
});
test('member dashboard preview remains explicit and cannot submit a personal claim',async()=>{
 const html=await render({admin:true,path:'/claim/festival?as=member'});assert.doesNotMatch(html,/<form/);assert.match(html,/Admin preview — read-only/);assert.match(html,/Open the normal claim page with my account/);
});
test('claim lookup loading is explained before enabling submission',async()=>{
 const html=await render({loading:true});assert.match(html,/Checking your claims…/);assert.match(html,/<button[^>]*type="submit"[^>]*disabled/);
});

test('a failed claim lookup explains the problem and provides recovery without enabling an overwrite',async()=>{
 const html=await render({loading:true,failed:true});assert.match(html,/We couldn’t check existing claims/);assert.match(html,/Reload and try again/);assert.match(html,/Claim check unavailable/);assert.match(html,/<button[^>]*type="submit"[^>]*disabled/);
});

const firestoreMock=moduleUrl(`
 export const writes=[];
 export const doc=(_db,...path)=>path.join('/');
 export const setDoc=async(path,data)=>{writes.push({path,data});};
 export const addDoc=()=>{};export const collection=()=>{};export const getDocs=()=>{};
 export const limit=()=>{};export const onSnapshot=()=>{};export const query=()=>{};export const where=()=>{};
`);
const claimApi=await import(compile('../src/lib/claimsApi.ts',{
 './readEfficiency':compile('../src/lib/readEfficiency.ts'),
 './listingUpdates':moduleUrl('export const listingUpdateRequest=()=>{};'),
 './claimApproval':moduleUrl('export const approvedPublicMark=()=>false;'),
 '../data/discovery':moduleUrl(`export const discoveryRepository={list:()=>${JSON.stringify(inventory)}};`),
 './discovery':moduleUrl("export const entityPath=e=>`/${e.kind==='business'?'local':'events'}/${e.slug}`;"),
 'firebase/firestore':firestoreMock,
 '../firebase':moduleUrl('export const db={};'),
 './claims':claimsModule,
}));
const {writes}=await import(firestoreMock);
test('the real submission API accepts a verified personal Google email without an existing business account',async()=>{
 await claimApi.submitClaim({uid:'new-person',email:'person@gmail.com',emailVerified:true},{id:business.id,title:business.title,path:'/local/festival'},{name:'New Organizer',role:'Volunteer organizer',workEmail:'person@gmail.com',phone:'',note:'I organize this festival',agree:true});
 assert.equal(writes.length,1);const write=writes[0];assert.equal(write.path,'listing_claims/new-person_biz-festival');assert.equal(write.data.uid,'new-person');assert.equal(write.data.status,'pending');assert.equal(write.data.accountEmail,'person@gmail.com');assert.equal(write.data.workEmail,'person@gmail.com');assert.equal(write.data.entityId,business.id);
});
test('the submission API requires verified sign-in and a known listing before any write',async()=>{
 const before=writes.length;
 await assert.rejects(claimApi.submitClaim({uid:'bad',email:'bad@gmail.com',emailVerified:false},{id:event.id,title:event.title,path:'/events/festival-2027'},{}),/[Vv]erif.*email/);
 await assert.rejects(claimApi.submitClaim({uid:'good',email:'good@gmail.com',emailVerified:true},{id:'missing',title:'Missing',path:'/local/missing'},{}),/not published/);
 assert.equal(writes.length,before);
});
