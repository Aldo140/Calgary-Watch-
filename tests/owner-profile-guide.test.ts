import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { PROFILE_STEPS, fieldProblem, friendlyValue, hoursLines, normalizeLink, ownerProfileFields, stepDone } from '../src/lib/ownerProfileGuide';
import { ownerEditableFields } from '../src/lib/ownerListingEdits';
import { OwnerFieldEditor } from '../src/components/entity/OwnerFieldEditor';
import type { DiscoveryEntity } from '../src/types/discovery';

const all = JSON.parse(readFileSync('src/generated/discovery-index.json', 'utf8')).entities as DiscoveryEntity[];
const shop = all.find((e) => e.kind === 'business')!;
const paulsHours = { Monday: '9am-7pm', Tuesday: '9am-7pm', Wednesday: '9am-7pm', Thursday: '9am-7pm', Friday: '9am-7pm', Saturday: '9am-7pm', Sunday: '11am-5pm' };

test('the review shows hours the way a person says them, never as JSON', () => {
  assert.deepEqual(hoursLines(paulsHours), ['Mon–Sat 9am-7pm', 'Sun 11am-5pm']);
  assert.deepEqual(hoursLines({ Monday: '9–5', Wednesday: '9–5', Sunday: 'Closed' }), ['Mon 9–5', 'Wed 9–5', 'Sun Closed']);
  const lines = friendlyValue('hours', paulsHours).join(' ');
  assert.doesNotMatch(lines, /[{}"]/);
});

test('social links read as names and short links in the review', () => {
  assert.deepEqual(friendlyValue('socials', { website: 'https://www.pawsitivelynatural.ca/', instagram: 'https://www.instagram.com/pawsitivelynatural/' }), ['Website: pawsitivelynatural.ca', 'Instagram: instagram.com/pawsitivelynatural']);
});

test('owners can type a handle or a bare domain and get the https link the site needs', () => {
  assert.equal(normalizeLink('@pawsitivelynatural', 'instagram'), 'https://www.instagram.com/pawsitivelynatural');
  assert.equal(normalizeLink('pawsitivelynatural.ca'), 'https://pawsitivelynatural.ca');
  assert.equal(normalizeLink('http://shop.ca/x'), 'https://shop.ca/x');
  assert.equal(normalizeLink('instagram.com/shop', 'instagram'), 'https://instagram.com/shop');
  assert.equal(normalizeLink('https://already.ca'), 'https://already.ca');
});

test('refused values get a kind, specific message', () => {
  assert.match(fieldProblem(shop, 'email', 'paul at shop')!, /doesn’t look quite right/);
  assert.match(fieldProblem(shop, 'socials', { instagram: 'not a link' })!, /full web address/);
  assert.equal(fieldProblem(shop, 'phone', '403-250-7297'), undefined);
  assert.equal(fieldProblem(shop, 'hours', paulsHours), undefined);
});

test('every owner-editable business field appears in exactly one guided step', () => {
  const stepped = PROFILE_STEPS.flatMap((s) => s.fields);
  assert.equal(new Set(stepped).size, stepped.length);
  for (const f of ownerProfileFields()) assert.ok(stepped.includes(f), `${f} is missing from the guided steps`);
  assert.deepEqual([...ownerProfileFields()].sort(), [...ownerEditableFields('business')].sort());
  assert.equal(stepDone(PROFILE_STEPS[2], { hours: {} }), false);
  assert.equal(stepDone(PROFILE_STEPS[2], { hours: paulsHours }), true);
});

test('hours have a Closed switch and a copy-to-weekdays shortcut', () => {
  const html = renderToStaticMarkup(createElement(OwnerFieldEditor, { field: 'hours', value: JSON.stringify({ Monday: '9am–7pm', Sunday: 'Closed' }), disabled: false, onChange: () => {} }));
  assert.match(html, /Closed/);
  assert.match(html, /Copy “9am–7pm” to Mon–Fri/);
  assert.match(html, /checked=""/);
});

test('the publish confirmation speaks plainly and lists changes without raw field keys', () => {
  const page = readFileSync('src/pages/OrganizationPage.tsx', 'utf8');
  assert.match(page, /Ready to go live\?/);
  assert.match(page, /no approval step/);
  assert.doesNotMatch(page, /Are you sure you want to submit/);
  assert.match(page, /friendlyValue\(field, value\)/);
});

import { profileProgress, fieldLabel as label } from '../src/lib/ownerProfileGuide';
import { eventWhen } from '../src/components/entity/OwnerEventPreview';
import { approvalEmail } from '../src/lib/claimApprovalEmail';

test('page progress counts filled sections and names the one next thing to do', () => {
  const p = profileProgress({ title: 'Shop', summary: 'Hi', description: 'About', phone: '1', email: 'a@b.ca', website: 'https://a.ca', address: 'x' });
  assert.equal(p.done, 2);
  assert.equal(p.next?.id, 'hours');
  assert.match(p.next!.ask, /opening hours/);
});

test('events get event wording, not business wording', () => {
  assert.equal(label('title', 'event'), 'Event name');
  assert.equal(label('title', 'business'), 'Business name');
  assert.equal(label('tickets', 'event'), 'Ticket or sign-up link');
});

test('event times read like a poster', () => {
  assert.equal(eventWhen('2026-11-22T19:00:00-06:00', '2026-11-22T22:00:00-06:00'), 'Sun, Nov 22 · 7 pm – 10 pm');
  assert.equal(eventWhen(''), undefined);
});

test('the approval email points owners at finishing their page, in plain words', () => {
  const m = approvalEmail({ entityId: 'biz-x', entityTitle: 'X', entityPath: '/local/x', name: 'Pat', accountEmail: 'p@x.ca', workEmail: 'p@x.ca' }, { mailingAddress: '' });
  assert.match(m.text, /Finish your page\./);
  assert.match(m.text, /preview first/);
  assert.doesNotMatch(m.text, /explicitly linked|per business|admin approval/);
});
