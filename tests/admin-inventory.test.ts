import assert from 'node:assert/strict';
import {test} from 'node:test';
import {adminInventory,matchesAdminInventory,type AdminInventoryRow} from '../src/lib/adminInventory';
const row=(id:string,kind='event',status='published')=>({id,kind,status,title:'Example festival',summary:'Official season',sources:[{name:'Downstage',url:'https://example.org'}]} as AdminInventoryRow);
test('published inventory is visible even when the backend collection is empty',()=>{const result=adminInventory([],[row('event'),row('market','market'),row('business','business'),row('guide','guide')]);assert.deepEqual(result.map(r=>r.id),['event','market','business']);assert.ok(result.every(r=>r.snapshotOnly));});
test('backend drafts and archives override older published release rows',()=>{for(const status of ['draft','archived']){const result=adminInventory([row('one','event',status)],[row('one')]);assert.equal(result.length,1);assert.equal(result[0].status,status);assert.equal(result[0].snapshotOnly,false);}});
test('inventory search combines source and title words',()=>{assert.ok(matchesAdminInventory(row('one'),'downstage festival'));assert.ok(!matchesAdminInventory(row('one'),'missing'));});
