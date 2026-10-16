import assert from 'node:assert/strict';
import {test} from 'node:test';
import {plansAreaPatch, plansSetupProblem} from '../src/lib/plansSetup';
import {hasCompletedPlans, readPlansProfile} from '../src/lib/plansProfile';
import {plansView} from '../src/lib/plansView';
import {currentCommunity} from '../src/lib/currentCommunity';
import type {PlansDraft} from '../src/lib/plans';
import type {CommunityBoundary} from '../src/lib/communityLookup';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
const blank:PlansDraft={neighborhood:'',address:'',inferredNeighborhood:'',consent:false,interests:[],weeklyDigestOptIn:false,eventsDigestOptIn:false};
test('signup can complete without a neighbourhood, address, storage consent, interests or emails',()=>{
 assert.equal(plansSetupProblem(blank,null),'');
 const patch=plansAreaPatch(blank,null,123);
 assert.equal(patch.piiConsentAt,null);assert.equal(patch.locationPreferenceType,'none');
 const profile=readPlansProfile({...patch,onboardingCompletedAt:123});
 assert.equal(hasCompletedPlans(profile),true);assert.equal(plansView(true,profile,false),'dashboard');
 assert.equal(profile.neighborhood,'');assert.equal(profile.address,'');
});
test('location-free signup still supports opted-in citywide emails and matching event interests',()=>{
 assert.equal(plansSetupProblem({...blank,weeklyDigestOptIn:true,eventsDigestOptIn:true,interests:['music']},null),'');
});
test('supplying an area still needs storage consent; clearing it removes stale inferred area and consent',()=>{
 const located={...blank,neighborhood:'Beltline'};
 assert.match(plansSetupProblem(located,null),/Tick the box/);
 assert.throws(()=>plansAreaPatch(located,null,123),/Permission/);
 assert.equal(plansAreaPatch({...located,consent:true},null,123).piiConsentAt,123);
 const existing=readPlansProfile({piiConsentAt:10,neighborhood:'Beltline',inferredNeighborhood:'Beltline'});
 const cleared=plansAreaPatch({...blank,inferredNeighborhood:'Beltline'},existing,123);
 assert.equal(cleared.piiConsentAt,null);assert.equal(cleared.inferredNeighborhood,'');
});
const boundary:CommunityBoundary={name:'beltline',bbox:[-114.1,51,-114,51.1],polygons:[[ [[-114.1,51],[-114,51],[-114,51.1],[-114.1,51.1],[-114.1,51]] ]]};
const geo=(lat:number,lng:number):Pick<Geolocation,'getCurrentPosition'>=>({getCurrentPosition(success,_error,options){assert.equal(options?.enableHighAccuracy,false);assert.equal(options?.timeout,10_000);success({coords:{latitude:lat,longitude:lng}} as GeolocationPosition);}});
test('requested geolocation returns only the exact Calgary community, never an address or coordinates',async()=>{
 const result=await currentCommunity(geo(51.05,-114.05),async()=>[boundary]);assert.equal(result,'Beltline');
});
test('permission denial, unsupported browsers, outside-city positions and dataset failure remain recoverable',async()=>{
 await assert.rejects(currentCommunity(undefined),/continue without/);
 await assert.rejects(currentCommunity({getCurrentPosition(_success,error){error!({code:1} as GeolocationPositionError);}},async()=>[boundary]),/permission was declined/);
 await assert.rejects(currentCommunity(geo(50,-113),async()=>[boundary]),/couldn’t match/);
 await assert.rejects(currentCommunity(geo(51.05,-114.05),async()=>{throw Error('Boundaries unavailable');}),/Boundaries unavailable/);
});
const require=createRequire(import.meta.url);
const moduleUrl=(source:string)=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const fileUrl=(path:string)=>new URL(path,import.meta.url).href;
function compile(path:string,replacements:Record<string,string>){
 let source=readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import ['"].*\.css['"];?$/gm,'').replace(/^import type .*;$/gm,'');
 source=source.replace(/from (['"])([^'"]+)\1/g,(_,q,name)=>`from ${q}${replacements[name]??pathToFileURL(require.resolve(name)).href}${q}`);
 return moduleUrl(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/from "react\/jsx-runtime"/g,`from "${pathToFileURL(require.resolve('react/jsx-runtime')).href}"`));
}
const {SignupForm}=await import(compile('../src/components/plans/SignupFlow.tsx',{
 './LocationShortcut':moduleUrl('export const LocationShortcut=()=>null;'),
 '../home/CalgarySky':moduleUrl('export const CalgarySky=()=>null;'),
 '../home/HomeHero':moduleUrl("export const TEAR='';"),
 '../home/HomeYours':moduleUrl('export const RadarArt=()=>null;export const Scribble=()=>null;export const TicketArt=()=>null;'),
 '../../hooks/useCalgaryWeather':moduleUrl('export const useCalgaryWeather=()=>({});'),
 '../../lib/weatherCodes':moduleUrl('export const describeSky=()=>null;'),
 '../../lib/sky':moduleUrl('export const moonPhase=()=>0;export const skyPalette=()=>({});export const sunPosition=()=>({});'),
 '../../lib/calgaryTz':fileUrl('../src/lib/calgaryTz.ts'),
 '../../lib/eventPicks':fileUrl('../src/lib/eventPicks.ts'),
}));
const form=(draft=blank,step=0)=>renderToStaticMarkup(createElement(MemoryRouter,null,createElement(SignupForm,{
 formRef:{current:null},step,setStep:()=>{},draft,setDraft:()=>{},area:'',progress:[],suggestions:[],communityCount:280,needsConsent:Boolean(draft.neighborhood||draft.address),pending:{monday:null,thursday:null},error:'',setError:()=>{},saving:false,disabled:false,signedIn:false,hasPlans:false,editing:false,onCancel:()=>{},onSubmit:()=>{},onToggleInterest:()=>{},
})));
test('actual signup markup clearly allows continuing without location and offers skipping a typed location',()=>{
 const html=form();assert.match(html,/optional/);assert.match(html,/Continue without location/);assert.doesNotMatch(html,/Add your neighbourhood or a street address to keep going/);assert.doesNotMatch(html,/class="su-consent"/);
 assert.match(form({...blank,neighborhood:'Beltline'}),/Skip location/);
 assert.match(form(blank,1),/Calgary safety brief/);
});
const firestoreMock=moduleUrl(`export const writes=[];export const doc=(_db,...parts)=>parts.join('/');export const setDoc=async(path,data)=>writes.push({path,data});export const collection=()=>{};export const getDoc=()=>{};export const getDocs=()=>{};export const increment=()=>{};export const limit=()=>{};export const onSnapshot=()=>{};export const query=()=>{};export const where=()=>{};export const writeBatch=()=>{};`);
const api=await import(compile('../src/lib/plans.ts',{
 './plansSetup':fileUrl('../src/lib/plansSetup.ts'),
 './readEfficiency':fileUrl('../src/lib/readEfficiency.ts'),
 'firebase/firestore':firestoreMock,
 '../firebase':moduleUrl('export const db={};'),
 './eventPicks':fileUrl('../src/lib/eventPicks.ts'),
 './plansProfile':fileUrl('../src/lib/plansProfile.ts'),
}));
const {writes}=await import(firestoreMock);
test('the real save API persists completion without inventing location consent or coordinates',async()=>{
 await api.savePlans({uid:'new-member',email:'member@gmail.com',displayName:'Member'},null,blank);
 assert.equal(writes.length,1);const {path,data}=writes[0];assert.equal(path,'users/new-member');assert.ok(data.onboardingCompletedAt>0);assert.equal(data.piiConsentAt,null);assert.equal(data.neighborhood,'');assert.equal(data.address,'');assert.equal(data.inferredNeighborhood,'');assert.equal(data.weeklyDigestOptIn,false);assert.equal(data.eventsDigestOptIn,false);assert.equal(data.lat,undefined);assert.equal(data.lng,undefined);assert.equal(plansView(true,readPlansProfile(data),false),'dashboard');
});
