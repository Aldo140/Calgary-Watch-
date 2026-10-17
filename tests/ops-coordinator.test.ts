/** The social media coordinator's inputs and checks, and listing photos (pure; no network). */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkPlan, creatorList, featuredListings, numbersBrief } from '../scripts/ops/jobs/coordinator';
import { listingPhoto } from '../scripts/ops/lib/photos';
import { brandKit, playbook } from '../scripts/ops/lib/brand';
import { reelSlides, selectCandidates, templateDraft, type DiscoveryIndex, type Entity } from '../scripts/ops/lib/posts';
import type { ContentPlan } from '../scripts/ops/lib/claude';
import type { ScoutEntry, Outperformer } from '../scripts/ops/lib/scout';
import type { AccountHistory } from '../src/types/ops';

const entry = (handle: string, kind: string, active = true): ScoutEntry => ({
  handle, kind, followers: 1000, posts30: 5, daysSinceLastPost: active ? 2 : 40, medianEngagement: 50, engagementRate: 5, reelShare: 1, active,
  top: { permalink: `https://instagram.com/reel/${handle}`, caption: 'Chinook arch over downtown', engagement: 400, reel: true, at: 0 },
});

describe('coordinator', () => {
  it('only offers active creators to ask, with the posts we could share', () => {
    const inspiration: Outperformer[] = [{ handle: 'snowyyc', permalink: 'https://instagram.com/reel/x2', caption: 'First snow', mediaUrl: null, reel: true, engagement: 900, lift: 4, at: 0 }];
    const list = creatorList([entry('snowyyc', 'creator'), entry('cityofcalgary', 'civic'), entry('quietone', 'creator', false), entry('newfind', 'candidate')], inspiration);
    assert.deepEqual(list.map(c => c.handle), ['snowyyc', 'newfind']);
    assert.deepEqual(list[0].posts, ['https://instagram.com/reel/snowyyc', 'https://instagram.com/reel/x2']);
  });

  it('drops creators, posts and listings the planner made up', () => {
    const plan: ContentPlan = {
      direction: 'Lead with photos.',
      plan: [
        { date: '2026-10-13', slot: '15:00', pillar: 'Things to do', format: 'Single image', idea: 'x', hook: 'y', asset: 'listing photo', listing: 'Held. Together.' },
        { date: '2026-10-13', slot: '17:00', pillar: 'Things to do', format: 'Single image', idea: 'x', hook: 'y', asset: 'listing photo', listing: 'An event nobody listed' },
      ],
      shootList: [],
      outreach: [
        { handle: '@SnowYYC', postUrl: 'https://instagram.com/reel/snowyyc', why: 'a', dm: 'Hi' },
        { handle: 'snowyyc', postUrl: 'https://instagram.com/reel/made-up', why: 'a', dm: 'Hi' },
        { handle: 'invented.creator', postUrl: '', why: 'a', dm: 'Hi' },
      ],
    };
    const checked = checkPlan(plan, [{ handle: 'snowyyc', posts: ['https://instagram.com/reel/snowyyc'] }], ['Held. Together.']);
    assert.equal(checked.plan[0].listing, 'Held. Together.');
    assert.equal(checked.plan[1].listing, '');
    assert.deepEqual(checked.outreach.map(o => [o.handle, o.postUrl]), [['snowyyc', 'https://instagram.com/reel/snowyyc'], ['snowyyc', '']]);
    assert.deepEqual([...featuredListings(checked)], ['held together']);
  });

  it('turns the numbers into short lines', () => {
    const g = (label: string, medianViews: number) => ({ key: label, label, posts: 10, medianViews, medianEngagement: 5, best: 100 });
    const history: AccountHistory = { updatedAt: 0, followers: 4307, totalPosts: 479, measuredPosts: 427, top: [], rows: [], byFormat: [g('Reels', 2451)], byTopic: [g('Events & things to do', 42)], byOrigin: [g('Credited reposts', 2520)], byWeekday: [], byHour: [] };
    const text = numbersBrief(history, null);
    assert.match(text, /4307 followers/);
    assert.match(text, /Credited reposts: 10 posts, median 2520 views/);
    assert.equal(numbersBrief(null, null), '(no numbers yet)');
  });

  it('has a playbook the writer reads', () => {
    assert.match(playbook('calgarydaily') ?? '', /first line is the hook/i);
  });
});

describe('listing photos', () => {
  const event = (over: Partial<Entity> = {}): Entity => ({
    id: 'e1', kind: 'event', title: 'Olympic Oval Birthday Skate', slug: 'oval', status: 'published', start: '2026-10-12T19:00:00Z', end: '2026-10-12T21:00:00Z',
    venue: 'Olympic Oval', organizer: 'University of Calgary', pricing: 'free', sources: [{ name: 'University of Calgary', url: 'https://ucalgary.ca/e1' }],
    image: { src: 'https://events.ucalgary.ca/oval.jpg', alt: '', credit: 'Image via University of Calgary' }, ...over,
  });

  it('uses the listing image with its credit, and only https images', () => {
    assert.deepEqual(listingPhoto(event(), 'UCalgary'), { url: 'https://events.ucalgary.ca/oval.jpg', credit: 'Image via University of Calgary' });
    assert.deepEqual(listingPhoto(event({ image: undefined, images: [{ src: 'https://x.ca/a.png', alt: '' }] }), 'Heritage Park'), { url: 'https://x.ca/a.png', credit: 'Photo: University of Calgary' });
    assert.equal(listingPhoto(event({ image: { src: 'http://insecure/a.jpg', alt: '' } }), 'x'), null);
    assert.equal(listingPhoto(event({ image: undefined }), 'x'), null);
  });

  it('puts the photo on spotlights and Reel slides, and prefers listings that have one', () => {
    const kit = brandKit('calgarydaily');
    const now = Date.parse('2026-10-12T15:00:00Z');
    const index: DiscoveryIndex = { entities: [event({ id: 'a', title: 'No photo talk', slug: 'a', image: undefined, pricing: 'paid' }), event({ id: 'b', slug: 'b', pricing: 'paid' })], occurrences: [] };
    const spot = selectCandidates(index, kit, now, new Set(['calgarydaily|today|2026-10-12'])).find(c => c.template === 'event')!;
    assert.equal(spot.items[0].entity.id, 'b');
    assert.equal(templateDraft(spot, kit).imageText.photo?.url, 'https://events.ucalgary.ca/oval.jpg');
    const slides = reelSlides({ items: spot.items, fingerprint: 'calgarydaily|tonight|2026-10-12' });
    assert.equal(slides[1].photo?.credit, 'Image via University of Calgary');
  });
});

describe('notes from Telegram (/ig)', async () => {
  const { newBriefs, noteLink, notesChanged, notesForPrompt } = await import('../scripts/ops/lib/igNotes');
  const n = (id: string, text: string, at = 0) => ({ id, text, at });
  it('finds the link in a note', () => {
    assert.equal(noteLink('post this https://www.cbc.ca/news/calgary/x.html.'), 'https://www.cbc.ca/news/calgary/x.html');
    assert.equal(noteLink('more Flames'), null);
  });
  it('turns each new link into one brief', () => {
    const notes = [n('a', 'post this https://cbc.ca/1'), n('b', 'more Flames')];
    assert.deepEqual(newBriefs(notes, []).map(b => [b.id, b.url]), [['a', 'https://cbc.ca/1']]);
    assert.deepEqual(newBriefs(notes, ['a']), []);
  });
  it('notices added, removed and edited notes, not reordering', () => {
    assert.equal(notesChanged([n('a', 'x'), n('b', 'y')], [n('b', 'y'), n('a', 'x')]), false);
    assert.equal(notesChanged([n('a', 'x')], [n('a', 'x2')]), true);
    assert.equal(notesChanged([n('a', 'x')], []), true);
  });
  it('lists notes newest first', () => {
    assert.equal(notesForPrompt([n('a', 'old', 1), n('b', 'new', 2)]), '- new\n- old');
    assert.equal(notesForPrompt([]), null);
  });
});

describe('publish backup (posts still go out when Firestore is out of quota)', async () => {
  const { backupPosts, dueFromBackup } = await import('../scripts/ops/jobs/publishBackup');
  const now = Date.parse('2026-10-13T19:00:00Z');
  const post = (id: string, over: Record<string, unknown> = {}) => ({ id, brand: 'calgarydaily', status: 'approved', scheduledFor: now - 60_000, relevantUntil: null, caption: 'c', altText: 'a', imageUrl: 'https://x/i.jpg', imageUrls: [], videoUrl: null, ...over }) as never;

  it('copies approved posts due within a day that have media', () => {
    const out = backupPosts([post('a'), post('b', { status: 'drafted' }), post('c', { imageUrl: null }), post('d', { scheduledFor: now + 2 * 86_400_000 }), post('e', { relevantUntil: now - 1 })], now);
    assert.deepEqual(out.map(p => p.id), ['a']);
  });

  it('publishes what is due once, skips late and future posts', () => {
    const posts = backupPosts([post('due'), post('later', { scheduledFor: now + 3_600_000 }), post('late', { scheduledFor: now - 5 * 3_600_000 }), post('done')], now);
    const b = { at: now, tokens: {}, posts, published: { done: { at: now - 1000, mediaId: '1', permalink: null, brand: 'calgarydaily' as const } } };
    assert.deepEqual(dueFromBackup(b, now).map(p => p.id), ['due']);
  });
});

describe('Claude request text', async () => {
  const { wellFormed } = await import('../scripts/ops/lib/claude');
  it('drops half an emoji left by cutting a caption', () => {
    const cut = '📸 @albertahub'.slice(1);
    assert.equal(JSON.stringify(wellFormed(cut)), JSON.stringify(' @albertahub'));
    assert.equal(wellFormed('📸 ok'), '📸 ok');
  });
});
