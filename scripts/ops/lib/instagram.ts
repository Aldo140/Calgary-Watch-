// Instagram content publishing. Two kinds of token work:
//  - Instagram API with Instagram Login (tokens start with "IG"): one token per
//    account, calls go to graph.instagram.com, and the token can be refreshed
//    for another 60 days at any time, so the daily job keeps it alive.
//  - Instagram API with Facebook Login: a user token that reaches accounts
//    through their Facebook Pages, calls go to graph.facebook.com.
// One image post = create a container, wait for it, publish.

import type { BrandId } from '../../../src/types/ops';

const VERSION = 'v25.0';
const FB = `https://graph.facebook.com/${VERSION}`;
const IG = `https://graph.instagram.com/${VERSION}`;

export const isInstagramLoginToken = (token: string) => token.startsWith('IG');
const base = (token: string) => (isInstagramLoginToken(token) ? IG : FB);

/** The token configured in GitHub secrets. The daily job may hold a fresher one (see jobs/igTokens.ts). */
export function igToken(brand: BrandId): string | undefined {
  return (brand === 'calgarywatch' ? process.env.IG_TOKEN_CALGARYWATCH : process.env.IG_TOKEN_CALGARYDAILY) || undefined;
}

async function graph(path: string, token: string, init?: { method?: 'GET' | 'POST'; params?: Record<string, string>; root?: string }) {
  const params = new URLSearchParams({ ...(init?.params ?? {}), access_token: token });
  const method = init?.method ?? 'GET';
  const root = init?.root ?? base(token);
  const url = method === 'GET' ? `${root}/${path}?${params}` : `${root}/${path}`;
  const res = await fetch(url, method === 'POST' ? { method, body: params } : undefined);
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = body.error ?? {};
    throw Object.assign(new Error(`Instagram: ${e.message ?? `HTTP ${res.status}`}`), { code: e.code, subcode: e.error_subcode });
  }
  return body;
}

const accounts = new Map<string, { id: string; username: string }>();

/**
 * The Instagram professional account with this handle. A Facebook-login token
 * can reach several accounts through its Pages, so the account is matched by
 * handle: a CalgaryWatch post can never land on CalgaryDaily.
 */
export async function igAccount(token: string, handle: string): Promise<{ id: string; username: string }> {
  const key = `${token}|${handle}`;
  if (accounts.has(key)) return accounts.get(key)!;
  let all: { id: string; username: string }[];
  if (isInstagramLoginToken(token)) {
    const me = await graph('me', token, { params: { fields: 'user_id,username' } });
    all = [{ id: String(me.user_id ?? me.id), username: me.username }];
  } else {
    const pages = await graph('me/accounts', token, { params: { fields: 'instagram_business_account{id,username}', limit: '100' } });
    all = (pages.data ?? []).map((p: any) => p.instagram_business_account).filter(Boolean);
  }
  if (!all.length) throw new Error('Instagram: no Instagram professional account reachable with this token.');
  const ig = all.find(a => a.username?.toLowerCase() === handle.toLowerCase());
  if (!ig) throw new Error(`Instagram: this token is for ${all.map(a => '@' + a.username).join(', ')}, not @${handle}. Fix "handle" in brand/*.json or use the right account's token.`);
  accounts.set(key, ig);
  return ig;
}

/** Expiry of a Facebook-login token (Instagram-login tokens report expiry when refreshed). */
export async function tokenExpiry(token: string): Promise<number | null> {
  if (isInstagramLoginToken(token)) return null;
  const d = await graph('debug_token', token, { params: { input_token: token } });
  const at = d.data?.data_access_expires_at || d.data?.expires_at;
  return at ? at * 1000 : null;
}

/** Instagram-login tokens only: a new 60-day token. Works once the token is at least 24 hours old. */
export async function refreshInstagramToken(token: string): Promise<{ token: string; expiresAt: number }> {
  const r = await graph('refresh_access_token', token, { params: { grant_type: 'ig_refresh_token' }, root: 'https://graph.instagram.com' });
  return { token: r.access_token, expiresAt: Date.now() + Number(r.expires_in ?? 0) * 1000 };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitUntilReady(containerId: string, token: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const s = await graph(containerId, token, { params: { fields: 'status_code' } });
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram: media container ${s.status_code}`);
    await sleep(3000);
  }
}

/** A swipeable post: one container per slide, then a carousel container, then publish. */
export async function publishCarousel(token: string, handle: string, imageUrls: string[], caption: string): Promise<{ mediaId: string; permalink: string | null }> {
  if (imageUrls.length < 2 || imageUrls.length > 10) throw new Error('Instagram: a carousel needs 2 to 10 images.');
  const { id: igId } = await igAccount(token, handle);
  const children: string[] = [];
  for (const url of imageUrls) {
    const child = await graph(`${igId}/media`, token, { method: 'POST', params: { image_url: url, is_carousel_item: 'true' } });
    await waitUntilReady(child.id, token);
    children.push(child.id);
  }
  const parent = await graph(`${igId}/media`, token, { method: 'POST', params: { media_type: 'CAROUSEL', children: children.join(','), caption } });
  await waitUntilReady(parent.id, token);
  const published = await graph(`${igId}/media_publish`, token, { method: 'POST', params: { creation_id: parent.id } });
  const media = await graph(published.id, token, { params: { fields: 'permalink' } }).catch(() => ({}));
  return { mediaId: published.id, permalink: media.permalink ?? null };
}

export async function publishImage(token: string, handle: string, imageUrl: string, caption: string, altText: string): Promise<{ mediaId: string; permalink: string | null }> {
  const { id: igId } = await igAccount(token, handle);
  let container: any;
  try {
    container = await graph(`${igId}/media`, token, { method: 'POST', params: { image_url: imageUrl, caption, alt_text: altText } });
  } catch (e: any) {
    // If alt text is rejected for this account, post without it rather than not at all.
    if (e.code !== 100) throw e;
    container = await graph(`${igId}/media`, token, { method: 'POST', params: { image_url: imageUrl, caption } });
  }
  for (let i = 0; i < 20; i++) {
    const s = await graph(container.id, token, { params: { fields: 'status_code' } });
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram: media container ${s.status_code}`);
    await sleep(3000);
  }
  const published = await graph(`${igId}/media_publish`, token, { method: 'POST', params: { creation_id: container.id } });
  const media = await graph(published.id, token, { params: { fields: 'permalink' } }).catch(() => ({}));
  return { mediaId: published.id, permalink: media.permalink ?? null };
}
