/**
 * The instant-alert email and push payload.
 *
 * Both are rendered from the same incident list and shown to a moderator in the
 * admin preview before anything is sent, so their shape is worth locking:
 * a sane subject, a working unsubscribe path, HTML-escaped report titles, and a
 * push body that never dumps raw internals.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Incident } from '../src/types/index.ts';
import { renderAlertEmail } from '../scripts/alerts/render.ts';
import { alertPushContent } from '../src/lib/alerts.ts';

const NOW = 1_700_000_000_000;
const ORIGIN = 'https://calgarywatch.ca';

function inc(over: Partial<Incident> & { id: string }): Incident {
  return {
    title: 'Break-in on 5 St',
    description: '',
    category: 'crime',
    neighborhood: 'Beltline',
    lat: 51.04,
    lng: -114.07,
    timestamp: NOW - 5 * 60_000,
    name: 'Ana',
    verified_status: 'unverified',
    report_count: 1,
    ...over,
  } as Incident;
}

describe('renderAlertEmail', () => {
  it('leads the subject with the single report title', () => {
    const out = renderAlertEmail([inc({ id: 'a' })], NOW, ORIGIN);
    assert.equal(out.subject, 'Nearby: Break-in on 5 St');
  });

  it('summarises a multi-report subject with a count and +N', () => {
    const out = renderAlertEmail(
      [inc({ id: 'a' }), inc({ id: 'b', title: 'Grass fire' }), inc({ id: 'c', title: 'Flooding' })],
      NOW,
      ORIGIN,
    );
    assert.match(out.subject, /^3 alerts near you — Break-in on 5 St \+2$/);
  });

  it('strips newlines from a subject so a report title cannot split headers', () => {
    const out = renderAlertEmail([inc({ id: 'a', title: 'Line one\r\nBcc: evil@example.com' })], NOW, ORIGIN);
    assert.ok(!out.subject.includes('\n') && !out.subject.includes('\r'));
    assert.match(out.subject, /Line one Bcc: evil@example.com/);
  });

  it('caps a very long subject', () => {
    const out = renderAlertEmail([inc({ id: 'a', title: 'x'.repeat(400) })], NOW, ORIGIN);
    assert.ok(out.subject.length <= 150);
  });

  it('HTML-escapes the report title in the body but not the plain-text part', () => {
    const out = renderAlertEmail([inc({ id: 'a', title: 'A & B <script>' })], NOW, ORIGIN);
    assert.ok(out.html.includes('A &amp; B &lt;script&gt;'));
    assert.ok(!out.html.includes('<script>'));
    assert.ok(out.text.includes('A & B <script>'));
  });

  it('carries a settings deep link for List-Unsubscribe and the footer', () => {
    const out = renderAlertEmail([inc({ id: 'a' })], NOW, ORIGIN);
    assert.equal(out.unsubscribeUrl, 'https://calgarywatch.ca/map?settings=alerts');
    assert.ok(out.html.includes(out.unsubscribeUrl));
    assert.ok(out.text.includes(out.unsubscribeUrl));
  });
});

describe('alertPushContent', () => {
  it('names one report in the title and puts its title in the body', () => {
    const { title, body } = alertPushContent([inc({ id: 'a' })]);
    assert.equal(title, 'Report near you');
    assert.equal(body, 'Break-in on 5 St');
  });

  it('counts multiple reports and rolls the rest into +N more', () => {
    const { title, body } = alertPushContent([
      inc({ id: 'a' }),
      inc({ id: 'b', title: 'Grass fire' }),
      inc({ id: 'c', title: 'Flooding' }),
    ]);
    assert.equal(title, '3 reports near you');
    assert.equal(body, 'Break-in on 5 St +2 more');
  });
});
