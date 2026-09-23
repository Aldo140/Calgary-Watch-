import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { entityImageAlt } from '../src/lib/discoveryImages';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('discovery truth boundaries', () => {
  it('does not ship the fabricated trending-story module from the homepage', () => {
    const homepage = read('src/pages/DiscoveryHomePage.tsx');
    assert.doesNotMatch(homepage, /NeighborhoodTrendingStories|trendingStoriesData/);
    assert.doesNotMatch(homepage, /viewsCount|trendingRank|verifiedCount/);
  });

  it('does not publish invented audience, feed or delivery claims in explainer sections', () => {
    const copy = `${read('src/components/discovery/ModesSplit.tsx')}\n${read('src/components/discovery/WeeklyBrief.tsx')}`;
    assert.doesNotMatch(copy, /thousands of Calgarians|\d+ Verified Feeds|\d+ Sourced Places|Delivered Friday at/);
  });

  it('treats shared repository art as decorative on entity cards and details', () => {
    assert.equal(entityImageAlt({ src: '/images/illustration/example.webp', alt: 'Specific venue' }), '');
    assert.equal(entityImageAlt({ src: '/images/photo/calgary2.webp', alt: 'Specific business' }), '');
    assert.equal(entityImageAlt({ src: 'https://provider.example/event.jpg', alt: 'Performer on stage' }), 'Performer on stage');
  });
});
