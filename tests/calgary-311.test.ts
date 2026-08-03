/**
 * Rules for the Calgary 311 source.
 *
 * The rule table was derived from a 30-day sample: 47,643 requests across 385
 * distinct service types. These tests lock in the decisions that analysis
 * produced, so a future edit cannot quietly reintroduce the problems it fixed.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const SRC = readFileSync('scripts/ingest/sources/calgary-311.ts', 'utf8');

/** The rule table only, excluding the explanatory header. */
const RULES = SRC.slice(SRC.indexOf('const SERVICE_RULES'), SRC.indexOf('const RULES_BY_SERVICE'));

function rulesFor(category: string): string[] {
  return [...RULES.matchAll(/service: '([^']+)'[^}]*category: '(\w+)'/g)]
    .filter((m) => m[2] === category)
    .map((m) => m[1]);
}

describe('311 service matching', () => {
  it('matches exact service names, not loose keywords', () => {
    // 385 service types share words. LIKE '%GRAFFITI%' style matching is what
    // made the mix unpredictable and graffiti-dominated.
    assert.match(SRC, /service_name in \(/);
    assert.doesNotMatch(SRC, /like '%/i);
  });

  it('every rule carries a cap', () => {
    const services = [...RULES.matchAll(/service: '/g)].length;
    const caps = [...RULES.matchAll(/cap: \d+/g)].length;
    assert.equal(services, caps, 'each rule needs a cap or one type will dominate');
  });
});

describe('311 category coverage', () => {
  it('covers crime, infrastructure and traffic', () => {
    for (const category of ['crime', 'infrastructure', 'traffic']) {
      assert.ok(rulesFor(category).length >= 3, `expected several ${category} rules`);
    }
  });

  it('crime is more than graffiti and vandalism', () => {
    const crime = rulesFor('crime');
    assert.ok(crime.length >= 5, `crime had only ${crime.length} rules`);
    assert.ok(
      crime.some((s) => /Disturbance/.test(s)),
      'disturbance reports are the closest real analogue to suspicious-activity calls',
    );
  });
});

describe('311 deliberate exclusions', () => {
  it('never maps encampments as incidents', () => {
    // 645 reports a month, and the second-largest category available here.
    // Living rough is not a crime; mapping it as one would be wrong and harmful.
    assert.doesNotMatch(RULES, /Encampment/i);
  });

  it('excludes high-volume non-safety maintenance', () => {
    for (const noise of [/Long Grass/i, /Tree Concern/i, /Dead Animal/i, /Cart Management/i, /Property Tax/i]) {
      assert.doesNotMatch(RULES, noise, `${noise} is maintenance, not an incident`);
    }
  });

  it('excludes noise concerns, which would swamp the map', () => {
    assert.doesNotMatch(RULES, /Noise Concerns/i);
  });
});

describe('311 honesty', () => {
  it('states these are resident reports, not police-confirmed offences', () => {
    assert.match(SRC, /not a police-confirmed offence/);
  });

  it('carries the real report time rather than ingest time', () => {
    assert.match(SRC, /timestamp: reportedAt/);
  });
});
