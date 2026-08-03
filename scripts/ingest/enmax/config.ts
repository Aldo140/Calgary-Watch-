/**
 * ENMAX outage feed configuration.
 *
 * This is the ONLY file in the repository that knows the ENMAX endpoint URL.
 * It is imported exclusively by the ingest pipeline (server-side, GitHub
 * Actions) and never reaches the browser bundle. If ENMAX moves or changes the
 * feed, this file and `normalize.ts` are the only places that need edits.
 *
 * Note: this endpoint is undocumented and is not a formally supported public
 * API. It is polled read-only, no more than once every five minutes, with a
 * descriptive User-Agent. No authentication or rate limit is bypassed.
 */

/** Undocumented ENMAX current-outage JSON feed. Read-only, JSON only — never scrape HTML. */
export const ENMAX_OUTAGE_URL = 'https://powerservices.enmax.com/api/outage?type=Current';

/** Public ENMAX outage portal linked from every popup for attribution. */
export const ENMAX_PORTAL_URL = 'https://powerservices.enmax.com/';

/** Upstream request timeout. ENMAX is usually sub-second; 9s covers a bad day. */
export const REQUEST_TIMEOUT_MS = 9_000;

/** Identifies our traffic so ENMAX can contact us rather than silently blocking. */
export const USER_AGENT = 'CalgaryWatch/1.0 (+https://calgarywatch.ca; community safety map)';

/** Firestore location of the published snapshot. Never the `incidents` collection. */
export const OUTAGE_COLLECTION = 'live_data';
export const OUTAGE_DOC_ID = 'power_outages';

/**
 * Hard cap on records written to the snapshot document. Firestore documents max
 * out at 1 MiB; ~40 outages is the norm and 400 leaves an enormous margin, but
 * the cap means a runaway feed can never produce an unwritable document.
 */
export const MAX_OUTAGES_PER_SNAPSHOT = 400;
