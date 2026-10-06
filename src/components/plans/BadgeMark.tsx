import { CalendarHeart, Compass, Eye, Home, Layers, Mail, Newspaper, Repeat, Sparkles, Ticket, type LucideIcon } from 'lucide-react';
import type { BadgeId, BadgeState } from '../../lib/badges';

const ICONS: Record<BadgeId, LucideIcon> = {
  founding: Sparkles,
  neighbour: Home,
  'tuned-in': CalendarHeart,
  'on-the-list': Mail,
  'monday-reader': Newspaper,
  'first-plans': Ticket,
  regular: Repeat,
  'all-rounder': Layers,
  'eyes-on-the-street': Eye,
  scout: Compass,
};

/** A postage-stamp edge, in keeping with the site's torn-paper collage. Deterministic. */
const STAMP = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 216; i++) {
    const t = (i / 216) * Math.PI * 2;
    const r = 45 + 2.6 * Math.cos(t * 18);
    pts.push(`${(50 + r * Math.cos(t)).toFixed(2)},${(50 + r * Math.sin(t)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
})();

export function BadgeMark({ badge, size = 76 }: { badge: Pick<BadgeState, 'id' | 'tone' | 'unlocked'>; size?: number }) {
  const Icon = ICONS[badge.id];
  return (
    <span className="cw-bdg" data-tone={badge.tone} data-locked={!badge.unlocked} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 100 100" width={size} height={size} focusable="false">
        <path d={STAMP} className="cw-bdg-edge" />
        <circle cx="50" cy="50" r="34" className="cw-bdg-ring" />
      </svg>
      <Icon size={Math.round(size * 0.36)} strokeWidth={2.1} />
    </span>
  );
}
