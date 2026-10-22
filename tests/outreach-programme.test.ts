import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {associateOrganizers} from '../src/lib/organizations';
import type {DiscoveryEntity} from '../src/types/discovery';
const inventory=JSON.parse(readFileSync('src/generated/discovery-index.json','utf8')).entities as DiscoveryEntity[];
test('the new official FunnyFest programme remains linked after export recomputes ownership',()=>{const linked=associateOrganizers(inventory);const entries=linked.filter(e=>e.sourceId==='funnyfest-major-programme');assert.equal(entries.length,8);for(const e of entries){assert.ok('organizerEntityId' in e);assert.equal(e.organizerEntityId,'biz-funnyfest');}});
test('CUFF marathon is a twelve-hour overnight event, separately linked to CUFF',()=>{const marathon=associateOrganizers(inventory).find(e=>e.sourceRecordId==='halloween-horror-marathon-2026');assert.ok(marathon?.kind==='event');assert.equal(Date.parse(marathon.end)-Date.parse(marathon.start),12*3600000);assert.equal(marathon.organizerEntityId,'biz-calgary-underground-film-festival');assert.equal(marathon.tickets,'https://www.showpass.com/12-hour-halloween-horror-movie-marathon-2026/');});
