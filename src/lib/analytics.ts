/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TrafficSource = 'direct' | 'search' | 'social' | 'referral' | 'email' | 'utm_campaign';

/**
 * Gets or creates a session ID stored in sessionStorage.
 * Session IDs are unique per tab and persist for the duration of the session.
 */
export function getSessionId(): string {
  const key = 'cw_session_id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(key, id);
  }
  return id;
}

/**
 * Determines traffic source from referrer and URL parameters.
 * Priority:
 * 1. UTM parameters (utm_source, utm_medium, utm_campaign)
 * 2. Direct traffic (no referrer)
 * 3. Search engines (Google, Bing, DuckDuckGo, Yahoo, Baidu, Yandex)
 * 4. Social media (Twitter, X, Facebook, Instagram, Reddit, LinkedIn, TikTok, YouTube)
 * 5. Email (Mail.com, Gmail, Outlook)
 * 6. Other referral (external website)
 */
export function getTrafficSource(referrer: string, params: URLSearchParams): TrafficSource {
  if (params.get('utm_source')) return 'utm_campaign';
  if (!referrer) return 'direct';
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (/google|bing|duckduckgo|yahoo|baidu|yandex/.test(host)) return 'search';
    if (/twitter|x\.com|facebook|instagram|reddit|linkedin|tiktok|youtube/.test(host)) return 'social';
    if (/mail|gmail|outlook/.test(host)) return 'email';
  } catch {
    /* invalid referrer URL */
  }
  return 'referral';
}
