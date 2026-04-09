import { useMemo } from 'react';
import { Incident } from '@/src/types';

export type RiskLevel = 'clear' | 'active' | 'high';

export interface NeighborhoodRisk {
  name: string;
  count: number;
  level: RiskLevel;
}

export const RISK_CONFIG: Record<RiskLevel, { dot: string; label: string; bg: string; text: string }> = {
  clear:  { dot: 'bg-emerald-500', label: 'Clear',  bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  active: { dot: 'bg-amber-400',   label: 'Active', bg: 'bg-amber-400/10',   text: 'text-amber-400'   },
  high:   { dot: 'bg-red-500',     label: 'High',   bg: 'bg-red-500/10',     text: 'text-red-400'     },
};

export function useNeighborhoodPulse(incidents: Incident[]): NeighborhoodRisk[] {
  return useMemo(() => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const counts = new Map<string, number>();
    for (const inc of incidents) {
      if (inc.timestamp > twoHoursAgo && inc.deleted !== true && inc.neighborhood) {
        counts.set(inc.neighborhood, (counts.get(inc.neighborhood) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, count]) => ({
        name,
        count,
        level: count >= 3 ? 'high' : count >= 1 ? 'active' : 'clear',
      }));
  }, [incidents]);
}
