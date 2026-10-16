import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { BusinessListings } from '../src/components/plans/BusinessListings';
import { readPlansProfile } from '../src/lib/plansProfile';
import { plansView } from '../src/lib/plansView';
import { listingManagementPath } from '../src/lib/listingPreview';
const claims = [{entityId:'biz-downstage',entityTitle:'Downstage',entityPath:'/local/downstage',status:'approved'}, {entityId:'other',entityTitle:'Another listing',status:'pending'}];
const render=(previewUid?:string)=>renderToStaticMarkup(createElement(MemoryRouter,null,createElement(BusinessListings,{claims,business:{since:100,listings:['biz-downstage']},previewUid})));

test('approved business owner sees dashboard without personal onboarding',()=>{
  const profile=readPlansProfile({accountType:'business',businessListings:['biz-downstage'],businessSince:100});
  assert.equal(plansView(true,profile,false),'dashboard');
  assert.equal(plansView(true,readPlansProfile({}),false,true),'dashboard');
  assert.equal(plansView(true,readPlansProfile({}),false,false),'setup');
});
test('admin and owner render the same Business account and claim states',()=>{
  for(const html of [render(),render('clare-uid')]) {
    assert.match(html,/Business account/); assert.match(html,/Downstage/); assert.match(html,/Verified/);
    assert.match(html,/Another listing/);assert.match(html,/Being confirmed/);
    assert.equal((html.match(/class="pd-biz-ok"/g)||[]).length,1);
  }
  assert.match(render('clare-uid'),/href="\/claim\/biz-downstage\?as=clare-uid"/);
  assert.match(render(),/href="\/claim\/biz-downstage"/);
  assert.doesNotMatch(render(),/\?as=/);
  assert.equal(render('clare-uid').replaceAll('?as=clare-uid',''),render());
});
test('management links encode IDs and preserve subject only in admin preview',()=>{
  assert.equal(listingManagementPath('biz downstage','uid&other'),'/claim/biz%20downstage?as=uid%26other');
});
test('pending and rejected claims do not display business verification',()=>{
  for(const status of ['pending','rejected']) {
    const html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(BusinessListings,{claims:[{...claims[0],status}]})));
    assert.doesNotMatch(html,/Business account|pd-biz-ok/);
  }
});
test('management preview selects member history and blocks submission',()=>{
  const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
  const page=read('src/pages/ClaimListingPage.tsx'), manager=read('src/components/entity/ListingManagement.tsx');
  assert.match(page,/previewUid = isAdmin \?/);assert.match(page,/useMyClaims\(subjectUid\)/);
  assert.match(page,/if \(!entity \|\| previewUid\) return/);
  assert.match(manager,/loadOwnerEditor\(claim.entityId,subjectUid\)/);
  assert.match(manager,/if\(!user\|\|readOnly\|\|busy/);
  assert.match(manager,/disabled=\{readOnly\|\|locked\|\|busy/);
  const hq=read('src/pages/MarketHQPage.tsx');assert.match(hq,/fieldset disabled=\{isAdmin\?!adminMode.enabled:Boolean\(previewUid\)\}/);
});
