import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ADMIN_SECTIONS,adminSection,adminSectionUrl,matchesAdminNavigation} from '../src/lib/adminNavigation';
test('all existing workspace bookmarks remain valid',()=>{assert.deepEqual(ADMIN_SECTIONS.map(s=>s.id).sort(),['desk','planner','reports','people','feeds','visitors','city','content','demand','partners','ops','members'].sort());for(const s of ADMIN_SECTIONS)assert.equal(adminSection(s.id),s.id);assert.equal(adminSection('bad'),'desk');assert.equal(adminSection(null),'desk');});
test('task search finds familiar names after renaming navigation',()=>{for(const[word,id]of[['newsletter','planner'],['roles','people'],['instagram','ops'],['events source','content'],['claims','partners']]){const s=ADMIN_SECTIONS.find(s=>s.id===id)!;assert.ok(matchesAdminNavigation({label:s.title,description:s.description,keywords:s.keywords},word),word);}});
test('workspace links preserve subview names',()=>{assert.equal(adminSectionUrl('partners','updates'),'/admin?section=partners&view=updates');});
