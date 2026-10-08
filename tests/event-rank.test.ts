import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { interestScore, isCampusOnly } from '../src/lib/eventRank';

const e = (title: string, extra: Record<string, unknown> = {}) => ({ kind: 'event' as const, title, categories: [], tags: [], verification: 'source-feed' as const, ...extra });

describe('event interest', () => {
  it('ranks arena nights and big draws above campus talks and varsity games', () => {
    const ranked = [
      e('Nickle@Noon – Ash Slemming: Creating Beyond Category', { venue: 'Nickle Galleries', sourceId: 'ucalgary-arts' }),
      e("Women's Hockey — MacEwan Griffins vs. Mount Royal Cougars", { venue: 'Flames Community Arenas', sourceId: 'mru-public' }),
      e('ScreamFest at Stampede Park', { venue: 'GMC Stadium, Stampede Park', verification: 'source-checked' }),
      e('Calgary Flames vs. Colorado Avalanche', { venue: 'Scotiabank Saddledome' }),
      e('Fall Ghost Tours', { venue: 'Heritage Park' }),
    ].sort((a, b) => interestScore(b, '2026-10-08T19:00:00-06:00') - interestScore(a, '2026-10-08T19:00:00-06:00')).map(x => x.title);
    assert.deepEqual(ranked.slice(0, 3), ['Calgary Flames vs. Colorado Avalanche', 'ScreamFest at Stampede Park', 'Fall Ghost Tours']);
    assert.equal(ranked.at(-1), 'Nickle@Noon – Ash Slemming: Creating Beyond Category');
  });

  it('counts an evening start as a small plus', () => {
    const show = e('Comedy night', { venue: 'Somewhere' });
    assert.ok(interestScore(show, '2026-10-09T20:00:00-06:00') > interestScore(show, '2026-10-09T10:00:00-06:00'));
  });

  it('treats room-coded and student-services university listings as campus-only', () => {
    assert.equal(isCampusOnly(e('Unwind - Mini Canvas Painting', { venue: 'Life Design Hub (MSC 171)', sourceId: 'ucalgary-arts' })), true);
    assert.equal(isCampusOnly(e('African Studies Speaker Series with Dr. Wisdom Tettey', { venue: 'Craigie Hall Room Block C 119', sourceId: 'ucalgary-arts' })), true);
    assert.equal(isCampusOnly(e('Taylor Centre Presents Darcy Oake', { venue: 'Bella Concert Hall', sourceId: 'mru-public' })), false);
    // Only university calendars are judged this way.
    assert.equal(isCampusOnly(e('Unwind yoga', { venue: 'Studio 101', sourceId: 'visit-calgary' })), false);
  });
});
