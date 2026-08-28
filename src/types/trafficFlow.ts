export type TrafficFlowMode = 'observed' | 'estimated' | 'baseline';

export type TrafficCondition = 'free' | 'moderate' | 'heavy' | 'stopped' | 'unknown';

export type TrafficTrend = 'improving' | 'stable' | 'worsening' | 'unknown';

export type TrafficDemand = 'low' | 'medium' | 'high' | 'very_high' | 'unknown';

/**
 * A privacy-safe reading for one road segment.
 *
 * Geometry is stored as Leaflet-ready [lat, lng] pairs. There are deliberately
 * no device, plate, trip, image, or per-vehicle fields in this contract.
 */
export interface TrafficSegmentState {
  id: string;
  name: string;
  geometry: Array<[number, number]>;
  updatedAt: number;
  mode: TrafficFlowMode;
  condition: TrafficCondition;
  trend: TrafficTrend;
  demand: TrafficDemand;
  confidence: number;
  averageSpeedKph: number | null;
  freeFlowSpeedKph: number | null;
  vehicleCount: number | null;
  annualDailyVolume: number | null;
  sources: string[];
}

export interface TrafficFlowSnapshot {
  schemaVersion: 1;
  updatedAt: number;
  mode: TrafficFlowMode;
  source: string;
  sourceUrl?: string;
  segments: TrafficSegmentState[];
}

export interface TrafficFlowState {
  snapshot: TrafficFlowSnapshot | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
}
