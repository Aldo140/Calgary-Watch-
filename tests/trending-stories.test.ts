/**
 * Guardrails and integrity tests for Neighbourhood Trending Stories.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CURATED_STORIES, type TrendingStory } from '../src/data/trendingStoriesData.js';

describe('trending stories dataset', () => {
  it('contains curated stories spanning official telemetry and community reports', () => {
    assert.ok(CURATED_STORIES.length >= 6, 'Must provide a rich baseline of at least 6 curated stories');
    
    const officialStories = CURATED_STORIES.filter(s => s.sourceType === 'official');
    const communityStories = CURATED_STORIES.filter(s => s.sourceType === 'community');

    assert.ok(officialStories.length >= 3, 'Must have at least 3 official telemetry stories');
    assert.ok(communityStories.length >= 3, 'Must have at least 3 community watch stories');
  });

  it('covers all major Calgary quadrants (NW, NE, SW, SE)', () => {
    const quadrants = new Set(CURATED_STORIES.map(s => s.quadrant));
    assert.ok(quadrants.has('NW'), 'Missing NW quadrant coverage');
    assert.ok(quadrants.has('NE'), 'Missing NE quadrant coverage');
    assert.ok(quadrants.has('SW'), 'Missing SW quadrant coverage');
    assert.ok(quadrants.has('SE'), 'Missing SE quadrant coverage');
  });

  it('validates every story data contract and required fields', () => {
    const validCategories = new Set(['safety', 'infrastructure', 'wildlife', 'transit', 'community', 'environment', 'traffic']);
    const validStatuses = new Set(['active', 'monitoring', 'resolved']);

    CURATED_STORIES.forEach((story: TrendingStory) => {
      assert.ok(story.id && typeof story.id === 'string', `Story missing valid id: ${JSON.stringify(story)}`);
      assert.ok(story.title && story.title.length > 10, `Story title too short: ${story.id}`);
      assert.ok(story.summary && story.summary.length > 20, `Story summary too short: ${story.id}`);
      assert.ok(story.fullReport && story.fullReport.length > 50, `Story fullReport too short: ${story.id}`);
      assert.ok(story.neighborhood && story.neighborhood.length > 2, `Story missing neighborhood: ${story.id}`);
      assert.ok(validCategories.has(story.category), `Invalid category: ${story.category} on ${story.id}`);
      assert.ok(validStatuses.has(story.status), `Invalid status: ${story.status} on ${story.id}`);
      assert.ok(story.verifiedCount >= 0, `verifiedCount must be non-negative: ${story.id}`);
      assert.ok(story.trendingRank > 0, `trendingRank must be > 0: ${story.id}`);
      assert.ok(story.coordinates.lat >= 50.8 && story.coordinates.lat <= 51.3, `Latitude out of Calgary bounds: ${story.id}`);
      assert.ok(story.coordinates.lng <= -113.8 && story.coordinates.lng >= -114.4, `Longitude out of Calgary bounds: ${story.id}`);
      assert.ok(Array.isArray(story.timeline) && story.timeline.length > 0, `Timeline must contain updates: ${story.id}`);
      assert.ok(Array.isArray(story.tags) && story.tags.length > 0, `Tags must be populated: ${story.id}`);
      
      story.timeline.forEach(step => {
        assert.ok(step.time, `Timeline step missing time on ${story.id}`);
        assert.ok(step.note, `Timeline step missing note on ${story.id}`);
        assert.ok(step.actor, `Timeline step missing actor on ${story.id}`);
      });
    });
  });

  it('verifies official sources reference recognized civic bodies', () => {
    const official = CURATED_STORIES.filter(s => s.sourceType === 'official');
    const civicEntities = ['City of Calgary', 'Alberta Parks', '511 Alberta', 'ENMAX', 'Calgary Transit'];
    
    official.forEach(story => {
      const matchesRecognized = civicEntities.some(entity => 
        story.sourceName.includes(entity) || (story.sourceUrl && story.sourceUrl.includes(entity.toLowerCase().replace(/ /g, '')))
      );
      assert.ok(matchesRecognized, `Official story sourceName '${story.sourceName}' does not reflect recognized civic authority`);
    });
  });

  it('ensures each community report has neighborhood verification', () => {
    const community = CURATED_STORIES.filter(s => s.sourceType === 'community');
    community.forEach(story => {
      assert.ok(story.verifiedCount >= 5, `Community story ${story.id} lacks sufficient community verifications`);
    });
  });
});
