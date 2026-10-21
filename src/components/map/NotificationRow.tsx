import { ArrowRight, Bell, MapPin } from 'lucide-react';

export type MapNotification = {
  id: string;
  title: string;
  timestamp: number;
  neighborhood?: string;
  kind?: 'incident' | 'neighborhood_report';
  /**
   * For neighbourhood reports: the saved profile setting this area was derived
   * from. Shown so it is obvious the report follows their location settings
   * rather than their current GPS position.
   */
  basis?: string;
};

/** A community's 311 figures, compared with the Calgary median. No rank. */
export type AreaComparison = {
  total: number;
  year: number;
  /** Relative to most Calgary communities; null when no median is available. */
  comparison: 'more' | 'about the same as' | 'fewer' | null;
};

/**
 * One row in the notifications popover (desktop) or sheet (phone).
 *
 * The neighbourhood report card used to show "City report-volume rank #N of M"
 * with a Hot/High/Elevated/Calm band. A league table of neighbourhoods built
 * from 311 volume is the opposite of what the product is for, so it now says
 * how the count compares with most communities, and what it counts.
 */
export function NotificationRow({
  n,
  stats,
  onOpen,
  onChangeLocation,
}: {
  n: MapNotification;
  stats: AreaComparison | null;
  onOpen: (n: MapNotification) => void;
  onChangeLocation: () => void;
}) {
  if (n.kind === 'neighborhood_report') {
    const areaName = (n.neighborhood ?? 'Your area').replace(/\b\w/g, (c) => c.toUpperCase());
    return (
      <div className="lv-note-feature lv-sky">
        <button type="button" onClick={() => onOpen(n)} className="lv-note-feature-main">
          <span className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border-2 border-[#151515]" style={{ background: '#ffdf4f', color: '#151515' }}>
              <Bell size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="lv-eyebrow block" style={{ color: '#9fe9f5' }}>Your neighbourhood report</span>
              <span className="mt-1 block font-display text-[19px] font-extrabold leading-tight tracking-[-0.02em]" style={{ color: '#fff' }}>
                {areaName}
              </span>
            </span>
          </span>
          {n.basis && (
            <span className="mt-2.5 flex items-start gap-1.5 text-[12px] font-medium leading-snug" style={{ color: '#a9b8d0' }}>
              <MapPin size={12} className="mt-[2px] shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                Built from <span className="font-bold" style={{ color: '#fff' }}>{n.basis}</span>
              </span>
            </span>
          )}
          {stats ? (
            <span className="lv-note-compare block">
              <span className="block text-[13px] font-semibold leading-snug" style={{ color: '#fff' }}>
                {stats.total.toLocaleString('en-CA')} 311 requests in {stats.year}
                {stats.comparison ? `, ${stats.comparison} most Calgary communities` : ''}.
              </span>
              <span className="mt-1 block text-[11.5px]" style={{ color: '#a9b8d0' }}>
                Counts follow population and foot traffic. Not a crime rate.
              </span>
            </span>
          ) : (
            <span className="mt-2.5 block text-[12px] font-medium" style={{ color: '#a9b8d0' }}>
              Lead stories, reports near you, nearby cameras and community figures
            </span>
          )}
          <span className="lv-note-open">
            Open full report <ArrowRight size={15} />
          </span>
        </button>
        {/* Sibling of the main button, never nested inside it. */}
        <div className="px-3.5 pb-3">
          <button
            type="button"
            onClick={onChangeLocation}
            className="min-h-9 text-[12px] font-semibold underline underline-offset-2"
            style={{ color: '#9fe9f5' }}
          >
            Change location settings
          </button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => onOpen(n)} className="lv-note-row">
      <span className="lv-note-ico"><Bell size={14} /></span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold leading-snug text-[#151515] line-clamp-2">{n.title}</span>
        <span className="mt-0.5 block font-mono text-[11px] text-[#565a61]">
          {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {n.neighborhood ? ` · ${n.neighborhood}` : ''}
        </span>
      </span>
    </button>
  );
}

/** Empty state shared by the popover and the sheet. */
export function NotificationsEmpty() {
  return (
    <div className="px-5 py-9 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-[14px] border-2 border-[#151515]" style={{ background: '#fff5cc' }}>
        <Bell size={18} className="text-[#151515]" />
      </span>
      <p className="mt-3 font-display text-[16px] font-extrabold text-[#151515]">All caught up</p>
      <p className="mx-auto mt-1 max-w-64 text-[12.5px] leading-relaxed text-[#565a61]">New reports for your saved area will appear here.</p>
    </div>
  );
}
