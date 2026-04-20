/**
 * Reddit r/Calgary — Incident scraper
 *
 * Fetches the 100 newest posts from r/Calgary, filters for safety-relevant
 * content, and normalises them into NormalizedIncident records.
 *
 * No API key required — uses Reddit's public JSON endpoint.
 * Rate limit: ~1 req/min per IP (we run every 15 min via GitHub Actions).
 *
 * Dedup key: reddit:<post_id>
 * TTL: 6 hours from ingest time (Reddit posts are time-sensitive)
 */

import type { IncidentCategory } from '../../../src/types/index.js';
import type { NormalizedIncident } from '../types.js';
import { NEIGHBOURHOOD_COORDS } from '../../../src/data/neighbourhoodCoords.js';

// ---------------------------------------------------------------------------
// Keyword → category mapping (ordered: first match wins)
// ---------------------------------------------------------------------------

const RULES: { patterns: RegExp[]; category: IncidentCategory }[] = [
  {
    category: 'crime',
    patterns: [
      /\b(shoot(ing|er)?|shot|gunshot|gun)\b/i,
      /\b(stab(bing)?|knife|assault|attack(ed)?|mugg(ing|ed)?)\b/i,
      /\b(robbery|robber|break.?in|break and enter|b&e|theft|stolen|steal|shopli(ft|ft))\b/i,
      /\b(homicide|murder|killed|found dead|body found)\b/i,
      /\b(car.?jack(ing)?|vehicle theft|catalytic)\b/i,
      /\b(suspect|police|ems|cps|arrest(ed)?|custody|investigation)\b/i,
      /\b(drug deal(ing|er)?|overdose|fentanyl|needle)\b/i,
    ],
  },
  {
    category: 'emergency',
    patterns: [
      /\b(fire|structure fire|house fire|apartment fire|blaze|smoke)\b/i,
      /\b(explosion|blast|gas leak|evacuate|evacuation|hazmat)\b/i,
      /\b(missing (person|child|woman|man)|amber alert|silver alert)\b/i,
      /\b(flood(ing)?|wildfire|emergency|disaster)\b/i,
    ],
  },
  {
    category: 'traffic',
    patterns: [
      /\b(crash|collision|accident|mvc|vehicle|car accident|hit and run|fender.?bender)\b/i,
      /\b(road closed|traffic|highway|deerfoot|crowchild|glenmore|stoney trail)\b/i,
      /\b(pedestrian (hit|struck|killed)|cyclist (hit|struck))\b/i,
    ],
  },
  {
    category: 'weather',
    patterns: [
      /\b(tornado|funnel cloud|severe thunderstorm|hail(storm)?|blizzard)\b/i,
      /\b(freezing rain|black ice|whiteout|snow.?storm|power out(age)?)\b/i,
    ],
  },
  {
    category: 'infrastructure',
    patterns: [
      /\b(power out(age)?|blackout|outage|water main|sewer|pothole)\b/i,
      /\b(ctrain|lrt|transit|bus (delayed|cancelled|stuck))\b/i,
    ],
  },
];

// Minimum score to accept a post (prevents noise)
const MIN_SCORE = 1;

function extractLocationFromText(text: string): { neighborhood: string; lat: number; lng: number } | null {
  const lower = text.toLowerCase();
  for (const [name, coords] of Object.entries(NEIGHBOURHOOD_COORDS)) {
    if (lower.includes(name)) {
      return {
        neighborhood: name.replace(/\b\w/g, (c) => c.toUpperCase()),
        lat: coords[0],
        lng: coords[1],
      };
    }
  }

  if (/\bnw\s+calgary|\bcalgary\s+nw\b/i.test(text)) {
    return { neighborhood: 'Northwest Calgary', lat: 51.128, lng: -114.190 };
  }
  if (/\bne\s+calgary|\bcalgary\s+ne\b/i.test(text)) {
    return { neighborhood: 'Northeast Calgary', lat: 51.128, lng: -113.980 };
  }
  if (/\bsw\s+calgary|\bcalgary\s+sw\b/i.test(text)) {
    return { neighborhood: 'Southwest Calgary', lat: 50.975, lng: -114.180 };
  }
  if (/\bse\s+calgary|\bcalgary\s+se\b/i.test(text)) {
    return { neighborhood: 'Southeast Calgary', lat: 50.975, lng: -113.980 };
  }

  return null;
}

function classifyPost(title: string, selftext: string): IncidentCategory | null {
  const combined = `${title} ${selftext}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.patterns.some((re) => re.test(combined))) {
      return rule.category;
    }
  }
  return null;
}

function cleanText(text: string, maxLen: number): string {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// Reddit API types
// ---------------------------------------------------------------------------

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  url: string;
  permalink: string;
  score: number;
  created_utc: number;
  num_comments: number;
  link_flair_text: string | null;
  is_self: boolean;
}

interface RedditResponse {
  data: {
    children: { data: RedditPost }[];
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function fetchRedditCalgary(): Promise<NormalizedIncident[]> {
  const url = 'https://www.reddit.com/r/Calgary/new.json?limit=100&t=day';

  const res = await fetch(url, {
    headers: {
      // Required by Reddit — identify the bot
      'User-Agent': 'CalgaryWatch-Ingest/1.0 (community safety aggregator)',
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Reddit API responded ${res.status}: ${res.statusText}`);
  }

  const json = (await res.json()) as RedditResponse;
  const posts = json.data?.children?.map((c) => c.data) ?? [];

  const now = Date.now();
  const results: NormalizedIncident[] = [];

  for (const post of posts) {
    // Skip low-quality / off-topic posts
    if (post.score < MIN_SCORE) continue;
    if (!post.is_self && !post.title) continue;

    const category = classifyPost(post.title, post.selftext);
    if (!category) continue;

    const location = extractLocationFromText(`${post.title} ${post.selftext}`);
    if (!location) continue;

    // Build a concise description
    const bodyText = post.is_self && post.selftext.length > 20
      ? cleanText(post.selftext, 400)
      : '';
    const description = bodyText.length > 0
      ? bodyText
      : `Reported on r/Calgary. Click source link for details.`;

    results.push({
      title: cleanText(post.title, 100),
      description,
      category,
      neighborhood: location.neighborhood,
      lat: location.lat,
      lng: location.lng,
      source_name: 'Reddit r/Calgary',
      source_url: `https://reddit.com${post.permalink}`,
      source_type: 'reddit_calgary',
      data_source: 'official',
      dedup_key: `reddit:${post.id}`,
      expires_at: now + 6 * 60 * 60 * 1000, // 6 hours
      verified_status: 'community_confirmed',
      report_count: 1,
      email: 'ingest@calgarywatch.app',
      name: 'Reddit r/Calgary',
      anonymous: false,
    });
  }

  return results;
}
