import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SCHEDULER_SLACK_MINUTES, readFeed, summarizeFeeds, type FeedHealthInput } from '../src/lib/feedHealth';
import { bucketByDay, catalogueStats, dayStarts, weekOverWeek } from '../src/lib/adminPulse';
import { calgaryTrafficUrls, fetchCalgaryTraffic, newestTrafficFirst } from '../src/lib/calgaryTraffic';
import { AdminOverview } from '../src/components/admin/AdminOverview';
import { AttentionQueue } from '../src/components/admin/AttentionQueue';
import type { DiscoveryEntity, MarketOccurrence } from '../src/types/discovery';

const NOW = Date.parse('2026-10-21T09:00:00Z');
const min = (m: number) => NOW - m * 60_000;
const scheduled = (lastChecked: number | null, status: FeedHealthInput['status'] = 'ok', extra: Partial<FeedHealthInput> = {}): FeedHealthInput =>
  ({ status, healthMode: 'scheduled', staleAfterMinutes: 90, lastChecked, ...extra });

describe('feed health reading', () => {
  it('treats a job GitHub is running late as expected, not urgent', () => {
    const r = readFeed(scheduled(min(190)), NOW);
    assert.equal(r.verdict, 'late');
    assert.equal(r.actionable, false);
    assert.equal(r.urgent, false);
    assert.match(r.note, /3\.2h ago/);
  });

  it('is live inside its window and stale only past the scheduler slack', () => {
    assert.equal(readFeed(scheduled(min(20)), NOW).verdict, 'live');
    const stale = readFeed(scheduled(min(SCHEDULER_SLACK_MINUTES + 5)), NOW);
    assert.equal(stale.verdict, 'stale');
    assert.equal(stale.urgent, true);
  });

  it('keeps a failed scheduled run urgent even when it is recent', () => {
    const r = readFeed(scheduled(min(10), 'error', { error: 'HTTP 503' }), NOW);
    assert.deepEqual([r.verdict, r.urgent, r.note], ['down', true, 'HTTP 503']);
  });

  it('flags a City map layer without paging the owner', () => {
    const r = readFeed({ status: 'error', healthMode: 'direct', lastChecked: NOW, error: 'HTTP 400' }, NOW);
    assert.deepEqual([r.verdict, r.actionable, r.urgent], ['down', true, false]);
  });

  it('leaves optional sources awaiting credentials out of the queue', () => {
    const r = readFeed(scheduled(null, 'disabled', { optional: true }), NOW);
    assert.deepEqual([r.verdict, r.actionable], ['setup', false]);
  });

  it('summarises the October 21 desk as zero urgent feeds', () => {
    // Seven scheduled jobs 3–4h late, two optional, three live probes: the
    // state that used to show "9 urgent".
    const feeds = [
      ...[190, 190, 190, 190, 190, 235, 245].map((m) => scheduled(min(m))),
      scheduled(null, 'disabled', { optional: true }), scheduled(null, 'disabled', { optional: true }),
      ...[1, 1, 1].map(() => ({ status: 'ok' as const, healthMode: 'direct' as const, lastChecked: NOW })),
    ];
    assert.deepEqual(summarizeFeeds(feeds, NOW), { total: 12, live: 3, late: 7, setup: 2, problems: 0, urgent: 0 });
  });
});

describe('overview numbers', () => {
  const ev = (id: string, start: string, end: string, pricing = 'paid', extra = {}) =>
    ({ id, kind: 'event', status: 'published', start, end, pricing, ...extra }) as unknown as DiscoveryEntity;
  it('counts the published catalogue and never development fixtures', () => {
    const entities = [
      ev('past', '2026-10-01T10:00:00-06:00', '2026-10-01T12:00:00-06:00'),
      ev('soon', '2026-10-23T10:00:00-06:00', '2026-10-23T12:00:00-06:00', 'free'),
      ev('later', '2026-11-20T10:00:00-06:00', '2026-11-20T12:00:00-06:00'),
      ev('fixture', '2026-10-23T10:00:00-06:00', '2026-10-23T12:00:00-06:00', 'free', { developmentOnly: true }),
      { id: 'm1', kind: 'market', status: 'published' },
      { id: 'b1', kind: 'business', status: 'published', ownerVerifiedAt: '2026-10-10T00:00:00Z' },
      { id: 'b2', kind: 'business', status: 'published' },
      { id: 'n1', kind: 'neighbourhood', status: 'published' },
    ] as unknown as DiscoveryEntity[];
    const occ = [
      { id: 'o1', marketId: 'm1', start: '2026-10-25T10:00:00-06:00', cancelled: false },
      { id: 'o2', marketId: 'm1', start: '2026-10-26T10:00:00-06:00', cancelled: true },
      { id: 'o3', marketId: 'm1', start: '2026-10-01T10:00:00-06:00', cancelled: false },
    ] as unknown as MarketOccurrence[];
    assert.deepEqual(catalogueStats(entities, occ, NOW), {
      eventsAhead: 2, eventsThisWeek: 1, freeAhead: 1, markets: 1, marketDatesAhead: 1, places: 2, verified: 1, neighbourhoods: 1, guides: 0,
    });
  });

  it('buckets timestamps into the last N local days', () => {
    const starts = dayStarts(3, NOW);
    assert.equal(starts.length, 3);
    assert.deepEqual(bucketByDay([starts[0] + 1, starts[2] + 5, starts[2] + 6, starts[0] - 1], starts), [1, 0, 2]);
  });

  it('reports week-over-week change only with a base week', () => {
    assert.equal(weekOverWeek([...Array(7).fill(10), ...Array(7).fill(15)]), 50);
    assert.equal(weekOverWeek([...Array(7).fill(0), ...Array(7).fill(15)]), null);
    assert.equal(weekOverWeek([1, 2]), null);
  });

  it('renders dashes, not invented numbers, while counts are unknown', () => {
    const html = renderToStaticMarkup(React.createElement(AdminOverview, {
      pulse: {}, apiHealths: [], now: NOW, onOpen() {},
      catalogue: { eventsAhead: 226, eventsThisWeek: 60, freeAhead: 37, markets: 25, marketDatesAhead: 250, places: 42, verified: 3, neighbourhoods: 7, guides: 4 },
    }));
    assert.match(html, /class="ao-hero-number">—</);
    assert.match(html, />226</);
    assert.match(html, /Data is flowing/);
  });

  it('keeps late feeds out of the attention queue', () => {
    const api = { id: 'calgary_311', name: 'Calgary 311 property reports', shortName: '311', ...scheduled(min(190)) };
    const html = renderToStaticMarkup(React.createElement(AttentionQueue, {
      flagged: [], pendingReview: [], apiHealths: [api as never], onRestore() {}, onDelete() {}, onApprove() {}, onHide() {}, restoringId: null, deletingId: null,
    }));
    assert.match(html, /Desk is clear/);
  });
});

describe('Calgary traffic fallback', () => {
  it('asks newest-first, then plain', () => {
    const [ordered, plain] = calgaryTrafficUrls(60);
    assert.match(ordered, /\$order=start_dt%20DESC/);
    assert.doesNotMatch(plain, /\$order/);
  });

  it('retries without ordering when the City rejects the query, and sorts locally', async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      calls.push(url);
      return url.includes('$order')
        ? new Response('bad query', { status: 400 })
        : Response.json([{ id: 'a', start_dt: '2026-10-20T10:00:00' }, { id: 'b', start_dt: '2026-10-21T08:00:00' }]);
    }) as typeof fetch;
    try {
      const result = await fetchCalgaryTraffic(1);
      assert.equal(calls.length, 2);
      assert.equal(result.fallback, true);
      assert.deepEqual(result.rows.map((r) => r.id), ['b']);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('does not mask a real outage', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response('down', { status: 503 })) as typeof fetch;
    try {
      await assert.rejects(fetchCalgaryTraffic(5), /HTTP 503/);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('orders rows newest first by whichever date field exists', () => {
    assert.deepEqual(newestTrafficFirst([{ id: 1, modified_dt: '2026-10-01' }, { id: 2, start_dt: '2026-10-05' }, { id: 3 }], 3).map((r) => r.id), [2, 1, 3]);
  });
});
