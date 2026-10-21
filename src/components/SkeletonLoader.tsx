import React from 'react';
import { cn } from '@/src/lib/utils';
import '@/src/styles/map-feed.css';

/**
 * Loading placeholders shaped like the live feed: the navy briefing card,
 * the rounded search and time switch, and white report cards with a
 * category bar. Explicit colours (not bg-slate-*), because index.css remaps
 * Tailwind's dark utilities on the map.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('lv-feed-skel', className)} {...props} />;
}

export function ReportCardSkeleton() {
  return (
    <div className="lv-feed-skel-card" aria-hidden="true">
      <Skeleton className="h-9 w-9 shrink-0 rounded-[11px]" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-full" />
        <div className="flex gap-1.5 pt-1">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function SidebarSkeleton() {
  return (
    <div className="h-full bg-[#FAF8F3]" role="status" aria-label="Loading reports">
      <div
        className="h-[132px] border-b-2 border-[#151515]"
        style={{
          background:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,.12) 1px, transparent 1.5px) 0 0 / 22px 22px, radial-gradient(90% 80% at 88% 0%, #123a7a 0%, transparent 62%), #06162f',
        }}
      />
      <div className="space-y-3 border-b-2 border-[#151515] p-4">
        <Skeleton className="h-[46px] w-full rounded-[14px]" />
        <Skeleton className="h-[42px] w-full rounded-[14px]" />
      </div>
      <div className="space-y-3 p-4">
        <div className="lv-feed-skel-sky space-y-3 p-[18px]">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-10 w-1/3" />
        </div>
        <div className="flex flex-wrap gap-1.5 pt-2">
          {[64, 92, 70, 76].map((w) => (
            <Skeleton key={w} className="h-[34px] rounded-full" style={{ width: w }} />
          ))}
        </div>
        {[1, 2, 3, 4].map((i) => (
          <ReportCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function MapShimmer() {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: '#EEF0EC' }}>
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full animate-[shimmer_2s_infinite] motion-reduce:animate-none" />
      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
