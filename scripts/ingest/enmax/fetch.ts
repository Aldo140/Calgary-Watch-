/**
 * ENMAX feed fetcher.
 *
 * Runs server-side only (GitHub Actions), so the browser never issues a
 * cross-origin request to ENMAX and ENMAX sees exactly one request per cron
 * tick regardless of how many people have Calgary Watch open.
 */

import type { PowerOutage } from '../../../src/types/powerOutage.js';
import { ENMAX_OUTAGE_URL, REQUEST_TIMEOUT_MS, USER_AGENT } from './config.js';
import { normalizeOutages } from './normalize.js';

/**
 * Fetch and normalize the current ENMAX outages.
 *
 * Throws on transport failure, a non-2xx response, or a payload that is not an
 * array. Callers treat a throw as "keep the previous snapshot" rather than
 * "there are no outages" — a feed change must never silently empty the map.
 */
export async function fetchEnmaxOutages(): Promise<PowerOutage[]> {
  const response = await fetch(ENMAX_OUTAGE_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`ENMAX responded ${response.status}`);
  }

  return normalizeOutages(await response.json());
}
