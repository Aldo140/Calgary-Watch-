/**
 * Distance as a resident would say it.
 *
 * Metres are rounded to the nearest ten: a report's pin carries GPS jitter of
 * several metres, so "437 m" claims precision the coordinate does not have.
 * Above a kilometre the unit changes rather than the digit count growing.
 */
export function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '';
  const metres = Math.round((km * 1000) / 10) * 10;
  if (metres <= 0) return 'here';
  if (metres < 1000) return `${metres} m`;
  if (km < 10) {
    const rounded = Math.round(km * 10) / 10;
    return `${rounded.toFixed(1)} km`;
  }
  return `${Math.round(km)} km`;
}
