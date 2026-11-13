import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DocumentReference } from 'firebase-admin/firestore';
import { claimOutreachDelivery, outreachDeliveryId } from '../scripts/ops/lib/outreachDelivery';
import { feedProblems, type FeedHealth } from '../scripts/ingest/freshness';
import { calgaryDateTimeFormat } from '../src/lib/calgaryTz';

test('an accepted email is never resent when the lead update fails', async () => {
  const claimed = new Set<string>();
  const lead = {
    collection: () => ({ doc: (id: string) => id }),
    firestore: {
      runTransaction: async (run: (transaction: unknown) => Promise<boolean>) => run({
        get: async (target: unknown) => typeof target === "string" ? { exists: claimed.has(target) } : { data: () => ({}) },
        create: (id: string) => claimed.add(id),
      }),
      batch: () => ({
        update: () => {},
        commit: async () => { throw new Error('temporary write failure'); },
      }),
    },
  } as unknown as DocumentReference;
  const id = outreachDeliveryId('outreach', 0);
  const delivery = await claimOutreachDelivery(lead, id, 1);
  assert.ok(delivery);
  await assert.rejects(delivery.complete({ status: 'contacted' }), /write failure/);
  assert.equal(await claimOutreachDelivery(lead, id, 2), null);
  assert.ok(await claimOutreachDelivery(lead, outreachDeliveryId('reply', 3), 4));
});

test('the feed check catches missing, stale, and erroring jobs without flagging disabled providers', () => {
  const now = Date.UTC(2026, 10, 12);
  const feeds = new Map<string, FeedHealth>([
    ['calgary_311', { status: 'ok', lastSuccessAt: now - 91 * 60_000 }],
    ['enmax_outages', { status: 'ok', lastSuccessAt: now - 10 * 60_000 }],
    ['aggregate_traffic_flow', { status: 'disabled' }],
    ['discovery_ingest', { status: 'error', lastSuccessAt: now }],
  ]);
  const problems = feedProblems(feeds, now);
  assert.ok(problems.some(problem => problem.startsWith('calgary_311')));
  assert.ok(problems.some(problem => problem.startsWith('discovery_publication')));
  assert.ok(problems.some(problem => problem.startsWith('discovery_ingest')));
  assert.ok(!problems.some(problem => /aggregate_traffic_flow|enmax_outages/.test(problem)));
});

test('Calgary winter formatting preserves historical offsets and crosses midnight correctly', () => {
  const format = calgaryDateTimeFormat('en-CA', { day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const parts = (iso: string) => format.formatToParts(new Date(iso)).filter(part => part.type === "day" || part.type === "hour").map(part => part.value);
  assert.deepEqual(parts('2025-12-01T06:30:00Z'), ['30', '23']);
  assert.deepEqual(parts('2026-12-01T06:30:00Z'), ['01', '00']);
});
