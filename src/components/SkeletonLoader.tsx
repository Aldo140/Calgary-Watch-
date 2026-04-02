import React from 'react';
import { cn } from '@/src/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-800/50", className)}
      {...props}
    />
  );
}

export function ReportCardSkeleton() {
  return (
    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="flex justify-between items-center">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}

export function SidebarSkeleton() {
  return (
    <div className="p-6 space-y-8">
      <div className="space-y-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="flex gap-2 overflow-hidden">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-8 w-20 rounded-full shrink-0" />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map(i => (
          <ReportCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function MapShimmer() {
  return (
    <div className="absolute inset-0 bg-slate-900 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
