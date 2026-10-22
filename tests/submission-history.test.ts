import {test} from 'node:test';
import assert from 'node:assert/strict';
import {submissionHistoryRecord} from '../src/lib/submissionHistory';
import type {DiscoveryEntity} from '../src/types/discovery';
const inventory=[{id:'one',status:'published',title:'One'},{id:'two',status:'published',title:'Two'},{id:'draft',status:'draft',title:'Draft'}] as DiscoveryEntity[];
test('a split submission needs every linked listing published, with deduplicated IDs',()=>{const row=submissionHistoryRecord('s',{status:'approved',entityId:'one',publishedEntityIds:['one','two']},inventory);assert.equal(row.needsAttention,false);assert.equal(row.published.length,2);});
test('approval and an unpublished or missing entity are not presented as live',()=>{for(const ids of [[],['draft'],['missing'],['one','missing']]){const row=submissionHistoryRecord('s',{status:'approved',publishedEntityIds:ids},inventory);assert.equal(row.needsAttention,true);}});
test('rejections stay in history without becoming missing-publication alerts',()=>{const row=submissionHistoryRecord('s',{status:'rejected',createdAt:'2026-10-21T12:00:00Z',message:'Original note'},inventory);assert.equal(row.needsAttention,false);assert.equal(row.reviewedAt,undefined);assert.equal(row.note,'Original note');assert.equal(row.createdAt,Date.parse('2026-10-21T12:00:00Z'));});
