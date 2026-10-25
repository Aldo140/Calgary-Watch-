import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ChevronDown, Clock3, HelpCircle, LayoutDashboard, LogOut, Settings } from 'lucide-react';
import { MAP_TIME_WINDOWS, type MapTimeWindow } from '@/src/lib/mapTimeWindow';
import { cn } from '@/src/lib/utils';

/**
 * Small pieces of the /map frame shared by the desktop command bar and the
 * phone chrome. Styles: src/styles/map-chrome.css (`lv-` classes).
 */

/** Red-pulse "Live" pill, the same signal as the site nav's Live link. */
export function LivePill({ label = 'Live' }: { label?: string }) {
  return (
    <span className="lv-live">
      <span className="lv-pulse" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * "Latest report 2 min ago", from the newest real report timestamp.
 * Says plainly when nothing has loaded instead of inventing a time.
 */
export function freshnessLabel(newest: number | null, now: number): string {
  if (newest === null) return 'No reports loaded yet';
  const mins = Math.max(0, Math.floor((now - newest) / 60_000));
  if (mins < 1) return 'Latest report just now';
  if (mins < 60) return `Latest report ${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Latest report ${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  return `Latest report ${days} day${days === 1 ? '' : 's'} ago`;
}

/** The word shown after a count: "15 reports · Tonight". */
export function windowWord(w: MapTimeWindow): string {
  if (w === 'all') return 'All loaded';
  return MAP_TIME_WINDOWS.find((o) => o.id === w)?.label ?? 'All loaded';
}

/** Tonight · 24h · Yesterday · 7 days · All, as pressed chips. */
export function WhenChips({
  value,
  onChange,
  className,
  size,
}: {
  value: MapTimeWindow;
  onChange: (w: MapTimeWindow) => void;
  className?: string;
  size?: 'sm';
}) {
  return (
    <div className={cn('lv-chips lv-when', className)} role="group" aria-label="Time window for the map and the feed">
      {MAP_TIME_WINDOWS.map((o) => (
        <button
          key={o.id}
          type="button"
          className={cn('lv-chip', size === 'sm' && 'lv-chip-sm')}
          aria-pressed={value === o.id}
          title={o.hint}
          onClick={() => onChange(o.id)}
        >
          {o.short}
        </button>
      ))}
    </div>
  );
}

/** Unread count, capped so it never overflows its badge. */
export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="lv-badge" aria-hidden="true">{count > 9 ? '9+' : count}</span>;
}

/** Spoken name for the bell, including the unread count. */
export function bellLabel(count: number): string {
  return count > 0 ? `Notifications, ${count > 9 ? 'more than 9' : count} unread` : 'Notifications';
}

type MenuUser = { displayName?: string | null; email?: string | null };

/** The one account menu, used by both the desktop bar and the phone rail. */
export function UserMenu({
  open,
  user,
  isAdmin,
  onAdmin,
  onSettings,
  onTour,
  onSignOut,
  className,
  motionFrom = 'down',
}: {
  open: boolean;
  user: MenuUser;
  isAdmin: boolean;
  onAdmin: () => void;
  onSettings: () => void;
  onTour: () => void;
  onSignOut: () => void;
  className?: string;
  motionFrom?: 'down' | 'side';
}) {
  const offset = motionFrom === 'side' ? { x: 8, y: 0 } : { x: 0, y: 8 };
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, ...offset }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, ...offset }}
          transition={{ duration: 0.16 }}
          className={cn('lv-pop lv-menu', className)}
          role="menu"
          aria-label="Account"
        >
          <div className="lv-menu-who">
            <p>{user.displayName || 'Your account'}</p>
            <p>{user.email}</p>
          </div>
          {isAdmin && (
            <MenuItem tone="admin" icon={<LayoutDashboard size={16} />} onClick={onAdmin}>Admin portal</MenuItem>
          )}
          <MenuItem icon={<Settings size={16} />} onClick={onSettings}>Settings</MenuItem>
          <MenuItem icon={<HelpCircle size={16} />} onClick={onTour}>App tour</MenuItem>
          <MenuItem icon={<LogOut size={16} />} onClick={onSignOut}>Sign out</MenuItem>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MenuItem({ icon, children, onClick, tone }: { icon: ReactNode; children: ReactNode; onClick: () => void; tone?: 'admin' }) {
  return (
    <button type="button" role="menuitem" className="lv-menu-item" data-tone={tone} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

/** Avatar content for an account button: photo, or the first initial. */
export function AvatarFace({ user }: { user: { photoURL?: string | null; displayName?: string | null; email?: string | null } }) {
  if (user.photoURL) {
    return <img src={user.photoURL} alt="" referrerPolicy="no-referrer" crossOrigin="anonymous" />;
  }
  return <span className="lv-sq-initial">{(user.displayName?.[0] ?? user.email?.[0] ?? 'U').toUpperCase()}</span>;
}

/**
 * Phone time switch: one glass track, a yellow thumb that slides to the
 * chosen window. Replaces the search field that used to sit here (the list
 * sheet has its own search), so the most-used control gets the top spot.
 */
export function WhenTrack({
  value,
  onChange,
}: {
  value: MapTimeWindow;
  onChange: (w: MapTimeWindow) => void;
}) {
  return (
    <div className="lv-track" role="radiogroup" aria-label="Time window for the map and the feed">
      {MAP_TIME_WINDOWS.map((o, i) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.hint}
            className="lv-track-opt"
            style={{ ['--i' as string]: i }}
            onClick={() => onChange(o.id)}
          >
            {on && (
              <motion.span
                layoutId="lv-track-thumb"
                className="lv-track-thumb"
                transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                aria-hidden="true"
              />
            )}
            <span className="lv-track-label">{o.short}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface CategoryChipOption {
  id: string;
  label: string;
  color: string;
  count: number;
  icon?: ReactNode;
}

/**
 * Category filter row under the time switch. Counts are the reports in the
 * current window, so a chip never promises more than tapping it shows.
 */
export function CategoryRail({
  options,
  value,
  onChange,
  total,
}: {
  options: CategoryChipOption[];
  value: string;
  onChange: (id: string) => void;
  total: number;
}) {
  return (
    <div className="lv-cats" role="group" aria-label="Filter by report type">
      <button
        type="button"
        className="lv-cat"
        aria-pressed={value === 'all'}
        style={{ ['--i' as string]: 0, ['--c' as string]: '#ffdf4f' }}
        onClick={() => onChange('all')}
      >
        All <b>{total}</b>
      </button>
      {options.map((o, i) => (
        <button
          key={o.id}
          type="button"
          className="lv-cat"
          aria-pressed={value === o.id}
          style={{ ['--i' as string]: i + 1, ['--c' as string]: o.color }}
          onClick={() => onChange(value === o.id ? 'all' : o.id)}
        >
          <span className="lv-cat-dot" aria-hidden="true">{o.icon}</span>
          {o.label} <b>{o.count}</b>
        </button>
      ))}
    </div>
  );
}

/**
 * Small-phone time switch: one yellow pill naming the window, opening a short
 * list. Takes the place of the five-option track, which needed its own row.
 */
export function WhenDial({
  value,
  onChange,
}: {
  value: MapTimeWindow;
  onChange: (w: MapTimeWindow) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MAP_TIME_WINDOWS.find((o) => o.id === value) ?? MAP_TIME_WINDOWS[MAP_TIME_WINDOWS.length - 1];
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className="lv-dial">
      <button
        type="button"
        className="lv-dial-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Time window: ${current.label}. Change`}
        onClick={() => setOpen((v) => !v)}
      >
        <Clock3 size={15} strokeWidth={2.6} aria-hidden="true" />
        <span>{current.short}</span>
        <ChevronDown size={15} strokeWidth={2.8} aria-hidden="true" className="lv-dial-caret" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label="Time window for the map and the feed"
            className="lv-dial-list"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.14 }}
          >
            {MAP_TIME_WINDOWS.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.id === value}
                  className="lv-dial-opt"
                  onClick={() => { onChange(o.id); setOpen(false); }}
                >
                  <span>
                    <b>{o.label}</b>
                    <small>{o.hint}</small>
                  </span>
                  {o.id === value && <Check size={16} strokeWidth={3} aria-hidden="true" />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
