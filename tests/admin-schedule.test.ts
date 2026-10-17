import assert from 'node:assert/strict';
import {test} from 'node:test';
import {formatAdminSchedule,parseAdminSchedule} from '../src/lib/adminSchedule';
test('Calgary scheduling roundtrips independently of browser timezone',()=>{const ms=parseAdminSchedule('2026-11-20T19:00');assert.equal(new Date(ms).toISOString(),'2026-11-21T01:00:00.000Z');assert.equal(formatAdminSchedule(ms),'2026-11-20T19:00');});
test('invalid and incomplete schedules cannot be saved as dates',()=>{for(const s of ['','bad','2026-02-30T19:00','2026-13-20T19:00','2026-00-00T19:00','2026-11-20T24:00','2026-11-20T19:60'])assert.ok(Number.isNaN(parseAdminSchedule(s)),s);assert.equal(formatAdminSchedule(NaN),'');});
