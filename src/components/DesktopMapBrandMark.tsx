import { Link } from 'react-router-dom';
import { cn } from '@/src/lib/utils';

interface DesktopMapBrandMarkProps {
  compact?: boolean;
  tone?: 'dark' | 'light';
}

const SPARK = '/images/brand/calgarywatch-city-spark-v2.webp';

/**
 * The CalgaryWatch mark for the map chrome, matching the site's Wordmark
 * (city spark, CALGARYWATCH, cyan dot).
 *
 * `compact` is the command-bar version: the full wordmark, white on the navy
 * live sky, linking home. The default is a spark tile for mastheads that set
 * their own title beside it. Styles live in src/styles/map-chrome.css (`lv-`).
 */
export default function DesktopMapBrandMark({ compact = false, tone = 'light' }: DesktopMapBrandMarkProps) {
  if (compact) {
    return (
      <Link className="lv-wordmark" to="/" aria-label="CalgaryWatch home">
        <img className="lv-wordmark-logo" src={SPARK} width={34} height={34} alt="" aria-hidden="true" />
        <span className="lv-wordmark-word">
          CALGARY<span>WATCH</span><span className="lv-wordmark-dot" aria-hidden="true">•</span>
        </span>
      </Link>
    );
  }

  return (
    <span aria-hidden="true" className={cn('lv-mark-tile', tone === 'dark' && 'lv-mark-tile-dark')}>
      <img src={SPARK} width={48} height={48} alt="" />
    </span>
  );
}
