/**
 * Community report lifecycle — the aggregation reducer.
 *
 * Residents answer one of three things about a report: I saw this too, it's
 * still happening, or it seems resolved. aggregateFeedback turns those records
 * into an honest status a neighbour can read — "Backed by 3 neighbours", "Last
 * seen active 24 minutes ago", "Reported resolved by nearby residents" — without
 * ever claiming police verification. Pure, so the whole lifecycle is testable
 * without Firestore.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aggregateFeedback,
  feedbackSummary,
  feedbackDocId,
  incidentFeedbackAggregate,
  type IncidentFeedback,
} from '../src/lib/feedback.ts';

const NOW = 1_700_000_000_000;
const MIN = 60_000;

function fb(over: Partial<IncidentFeedback> & { uid: string; kind: IncidentFeedback['kind'] }): IncidentFeedback {
  return { incidentId: 'inc1', createdAt: NOW - MIN, updatedAt: NOW - MIN, ...over };
}

describe('feedbackDocId', () => {
  it('is deterministic per user and incident', () => {
    assert.equal(feedbackDocId('user1', 'inc1'), 'user1_inc1');
  });
});

describe('aggregateFeedback', () => {
  it('is empty for no feedback', () => {
    const a = aggregateFeedback([], NOW);
    assert.equal(a.total, 0);
    assert.equal(a.corroborations, 0);
    assert.equal(a.lastActiveAt, null);
    assert.equal(a.resolvedByResidents, false);
    assert.equal(a.disputed, false);
  });

  it('counts corroborations from saw_it and still_happening', () => {
    const a = aggregateFeedback(
      [fb({ uid: 'a', kind: 'saw_it' }), fb({ uid: 'b', kind: 'still_happening' }), fb({ uid: 'c', kind: 'saw_it' })],
      NOW,
    );
    assert.equal(a.total, 3);
    assert.equal(a.corroborations, 3);
    assert.equal(a.stillHappening, 1);
  });

  it('takes lastActiveAt from the most recent active signal', () => {
    const a = aggregateFeedback(
      [fb({ uid: 'a', kind: 'saw_it', updatedAt: NOW - 30 * MIN }), fb({ uid: 'b', kind: 'still_happening', updatedAt: NOW - 5 * MIN })],
      NOW,
    );
    assert.equal(a.lastActiveAt, NOW - 5 * MIN);
  });

  it('flags resolved when resolved reports outweigh active ones', () => {
    const a = aggregateFeedback(
      [fb({ uid: 'a', kind: 'resolved' }), fb({ uid: 'b', kind: 'resolved' }), fb({ uid: 'c', kind: 'saw_it' })],
      NOW,
    );
    assert.equal(a.resolvedByResidents, true);
  });

  it('flags disputed when both active and resolved signals exist', () => {
    const a = aggregateFeedback(
      [fb({ uid: 'a', kind: 'still_happening' }), fb({ uid: 'b', kind: 'resolved' })],
      NOW,
    );
    assert.equal(a.disputed, true);
  });

  it('keeps one record per user even if duplicates arrive', () => {
    const a = aggregateFeedback(
      [fb({ uid: 'a', kind: 'saw_it', updatedAt: NOW - 10 * MIN }), fb({ uid: 'a', kind: 'resolved', updatedAt: NOW - 2 * MIN })],
      NOW,
    );
    assert.equal(a.total, 1);
    // the later write wins
    assert.equal(a.resolved, 1);
    assert.equal(a.corroborations, 0);
  });
});

describe('incidentFeedbackAggregate — public fields on the incident', () => {
  it('reads counts from the incident document (function-maintained)', () => {
    const agg = incidentFeedbackAggregate({
      feedback_corroborations: 3,
      feedback_disputed: false,
      feedback_resolved: false,
      feedback_last_active: NOW - 24 * MIN,
    });
    assert.equal(agg.corroborations, 3);
    assert.equal(agg.lastActiveAt, NOW - 24 * MIN);
    assert.equal(feedbackSummary(agg, NOW), 'Last seen active 24 minutes ago');
  });

  it('is empty when the incident carries no aggregate yet', () => {
    const agg = incidentFeedbackAggregate({});
    assert.equal(agg.total, 0);
    assert.equal(feedbackSummary(agg, NOW), 'No recent confirmation');
  });

  it('surfaces a resident-resolved incident', () => {
    const agg = incidentFeedbackAggregate({ feedback_corroborations: 0, feedback_resolved: true });
    assert.equal(feedbackSummary(agg, NOW), 'Reported resolved by nearby residents');
  });
});

describe('feedbackSummary', () => {
  it('says nothing confirmed when there is no feedback', () => {
    assert.equal(feedbackSummary(aggregateFeedback([], NOW), NOW), 'No recent confirmation');
  });

  it('reports resident-resolved when that outweighs active', () => {
    const a = aggregateFeedback([fb({ uid: 'a', kind: 'resolved' }), fb({ uid: 'b', kind: 'resolved' })], NOW);
    assert.equal(feedbackSummary(a, NOW), 'Reported resolved by nearby residents');
  });

  it('reports last-seen-active when there is a recent still-happening', () => {
    const a = aggregateFeedback([fb({ uid: 'a', kind: 'still_happening', updatedAt: NOW - 24 * MIN })], NOW);
    assert.equal(feedbackSummary(a, NOW), 'Last seen active 24 minutes ago');
  });

  it('backs by neighbour count when corroborated but not recently active', () => {
    const a = aggregateFeedback(
      [fb({ uid: 'a', kind: 'saw_it', updatedAt: NOW - 8 * 60 * MIN }), fb({ uid: 'b', kind: 'saw_it', updatedAt: NOW - 9 * 60 * MIN }), fb({ uid: 'c', kind: 'saw_it', updatedAt: NOW - 10 * 60 * MIN })],
      NOW,
    );
    assert.equal(feedbackSummary(a, NOW), 'Backed by 3 neighbours');
  });

  it('uses the singular for a single backer', () => {
    const a = aggregateFeedback([fb({ uid: 'a', kind: 'saw_it', updatedAt: NOW - 8 * 60 * MIN })], NOW);
    assert.equal(feedbackSummary(a, NOW), 'Backed by 1 neighbour');
  });
});
