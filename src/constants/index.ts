export const CALGARY_CENTER = {
  lng: -114.0719,
  lat: 51.0447,
};

export const INCIDENT_CATEGORIES = [
  { value: 'crime', label: 'Crime', color: '#ef4444' }, // red-500
  { value: 'traffic', label: 'Traffic', color: '#f97316' }, // orange-500
  { value: 'infrastructure', label: 'Infrastructure', color: '#3b82f6' }, // blue-500
  { value: 'weather', label: 'Weather', color: '#a855f7' }, // purple-500
] as const;

export const CREDIBILITY_STATUSES = [
  { value: 'unverified', label: 'Unverified', color: '#94a3b8' }, // slate-400
  { value: 'multiple_reports', label: 'Multiple Reports', color: '#facc15' }, // yellow-400
  { value: 'community_confirmed', label: 'Community Confirmed', color: '#22c55e' }, // green-500
] as const;
