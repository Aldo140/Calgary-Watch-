import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { readPlansProfile } from '../src/lib/plansProfile';
import { plansView } from '../src/lib/plansView';

test('Their dashboard opens incomplete selected members without requiring onboarding', () => {
  const profile=readPlansProfile({displayName:'Dalhousie Community'});
  assert.equal(plansView(true,profile,true),'dashboard');
  assert.equal(plansView(true,profile,false),'setup');
});
test('admin preview waits for selected profile rather than showing setup',()=>{
  assert.equal(plansView(false,null,true),'loading');
  assert.equal(plansView(true,null,true),'loading');
});
test('normal member dashboard and signed-out setup are unchanged',()=>{
  assert.equal(plansView(true,readPlansProfile({piiConsentAt:123}),false),'dashboard');
  assert.equal(plansView(true,readPlansProfile({eventInterests:['arts']}),false),'dashboard');
  assert.equal(plansView(false,null,false),'setup');
});
test('preview still uses the selected UID and does not mount the admin RSVP editor',()=>{
  const page=readFileSync(new URL('../src/pages/PlansPage.tsx',import.meta.url),'utf8');
  const dashboard=readFileSync(new URL('../src/components/plans/Dashboard.tsx',import.meta.url),'utf8');
  assert.match(page,/asUid = auth0.isAdmin/);
  assert.match(page,/asUid \?\? auth0.user\?\.uid/);
  assert.match(page,/useMyClaims\(subjectUid\)/);
  assert.match(dashboard,/p.adminView != null \? <button[^>]+disabled/);
  assert.match(page,/if \(asUid\) \{ setError\('Admin view is read-only/);
});
