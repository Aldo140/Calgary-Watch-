import { ArrowUpRight } from 'lucide-react';
import feed from '../../generated/calgarydaily-feed.json';
import { CALGARYDAILY } from '../../config/social';
import { publicAsset } from '../../lib/utils';

type FeedPost = { permalink: string; image: string; headline: string; eyebrow: string; alt: string; publishedAt: string; format: 'post' | 'carousel' | 'reel' };
const FORMAT_LABEL: Record<FeedPost['format'], string | null> = { post: null, carousel: 'Swipe', reel: 'Reel' };

/**
 * The sister account, stated plainly: CalgaryDaily is where these listings go
 * out on Instagram. Recent posts come from the ops queue at build time
 * (scripts/ops/export-feed.ts); before the first export it is just the invite.
 */
export function CalgaryDailyStrip() {
  const posts = (feed.posts as FeedPost[]).slice(0, 4);
  return (
    <section className="h-daily" aria-labelledby="h-daily-title">
      <div className="h-daily-head">
        <img className="h-daily-logo" src={publicAsset('/images/brand/calgarydaily-logo.jpg')} alt="" width="206" height="206" loading="lazy" />
        <div>
          <p className="h-eyebrow">On Instagram · our sister account</p>
          <h2 id="h-daily-title">Calgary Daily, by CalgaryWatch.</h2>
          <p className="h-daily-copy">
            The same checked listings, on your feed every day: what's on this morning, one pick at noon and tonight's plans. Every post links back here for the details.
          </p>
          <a className="h-btn h-daily-btn" href={CALGARYDAILY.url} target="_blank" rel="noopener">
            Follow @{CALGARYDAILY.handle} <ArrowUpRight size={18} aria-hidden="true" />
          </a>
        </div>
      </div>
      {posts.length ? (
        <ul className="h-daily-grid" aria-label="Recent CalgaryDaily posts">
          {posts.map(p => (
            <li key={p.permalink}>
              <a href={p.permalink} target="_blank" rel="noopener" aria-label={`${p.headline} on Instagram`}>
                <img src={p.image} alt={p.alt} width="1080" height="1350" loading="lazy" decoding="async" />
                {FORMAT_LABEL[p.format] ? <span className="h-daily-tag">{FORMAT_LABEL[p.format]}</span> : null}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
