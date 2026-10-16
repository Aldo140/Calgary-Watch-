import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OwnerFieldEditor } from '../src/components/entity/OwnerFieldEditor';
const render=(field:string,value:string,disabled=false)=>renderToStaticMarkup(createElement(OwnerFieldEditor,{field,value,disabled,onChange:()=>{}}));
test('event fields use a Calgary calendar control, not an ISO-string text field',()=>{
  const html=render('start','2026-10-24T01:00:00Z');
  assert.match(html,/datetime-local/);assert.match(html,/Calgary time/);assert.match(html,/2026-10-23T19:00/);
});
test('business hours and social links render ordinary labelled inputs',()=>{
  const hours=render('hours',JSON.stringify({Monday:'9 a.m.–5 p.m.'}));
  assert.match(hours,/Monday/);assert.match(hours,/9 a.m.–5 p.m./);assert.doesNotMatch(hours,/JSON/);
  const socials=render('socials',JSON.stringify({instagram:'https://instagram.com/organization'}));assert.match(socials,/type="url"/);assert.match(socials,/instagram.com\/organization/);
});
test('admin market-date preview shows existing dates while disabling changes',()=>{
  const html=render('occurrences',JSON.stringify([{id:'date',start:'2026-10-24T01:00:00Z',end:'2026-10-24T03:00:00Z',cancelled:false}]),true);
  assert.match(html,/Market dates/);assert.match(html,/2026-10-23T19:00/);assert.match(html,/readOnly/);assert.match(html,/disabled=""/);assert.doesNotMatch(html,/type="file"/);
});
