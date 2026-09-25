// Instagram content publishing through the Graph API (Instagram API with
// Facebook Login). One image post = create a container, wait for it, publish.

import type { BrandId } from '../../../src/types/ops';

const GRAPH = 'https://graph.facebook.com/v21.0';

export function igToken(brand: BrandId): string | undefined {
  return brand === 'calgarywatch' ? process.env.IG_TOKEN_CALGARYWATCH : process.env.IG_TOKEN_CALGARYDAILY;
}

async function graph(path: string, token: string, init?: { method?: 'GET' | 'POST'; params?: Record<string, string> }) {
  const params = new URLSearchParams({ ...(init?.params ?? {}), access_token: token });
  const method = init?.method ?? 'GET';
  const url = method === 'GET' ? `${GRAPH}/${path}?${params}` : `${GRAPH}/${path}`;
  const res = await fetch(url, method === 'POST' ? { method, body: params } : undefined);
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = body.error ?? {};
    throw Object.assign(new Error(`Instagram: ${e.message ?? `HTTP ${res.status}`}`), { code: e.code, subcode: e.error_subcode });
  }
  return body;
}

const accounts = new Map<string, { id: string; username: string }>();

/** The Instagram professional account behind a token, found through its Facebook Page. */
export async function igAccount(token: string): Promise<{ id: string; username: string }> {
  if (accounts.has(token)) return accounts.get(token)!;
  const pages = await graph('me/accounts', token, { params: { fields: 'instagram_business_account{id,username}' } });
  const ig = (pages.data ?? []).map((p: any) => p.instagram_business_account).find(Boolean);
  if (!ig) throw new Error('Instagram: no Facebook Page with a linked Instagram professional account for this token.');
  accounts.set(token, ig);
  return ig;
}

export async function tokenExpiry(token: string): Promise<number | null> {
  const d = await graph('debug_token', token, { params: { input_token: token } });
  const at = d.data?.data_access_expires_at || d.data?.expires_at;
  return at ? at * 1000 : null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function publishImage(token: string, imageUrl: string, caption: string, altText: string): Promise<{ mediaId: string; permalink: string | null }> {
  const { id: igId } = await igAccount(token);
  let container: any;
  try {
    container = await graph(`${igId}/media`, token, { method: 'POST', params: { image_url: imageUrl, caption, alt_text: altText } });
  } catch (e: any) {
    // Older API versions reject alt_text on feed images; post without it rather than not at all.
    if (e.code !== 100) throw e;
    container = await graph(`${igId}/media`, token, { method: 'POST', params: { image_url: imageUrl, caption } });
  }
  for (let i = 0; i < 20; i++) {
    const s = await graph(container.id, token, { params: { fields: 'status_code,status' } });
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram: media container ${s.status_code} (${s.status ?? 'no detail'})`);
    await sleep(3000);
  }
  const published = await graph(`${igId}/media_publish`, token, { method: 'POST', params: { creation_id: container.id } });
  const media = await graph(published.id, token, { params: { fields: 'permalink' } }).catch(() => ({}));
  return { mediaId: published.id, permalink: media.permalink ?? null };
}

/** Posts published in the last 24 hours, for Instagram's per-account daily cap. */
export async function publishingUsage(token: string): Promise<{ used: number; limit: number }> {
  const { id } = await igAccount(token);
  const r = await graph(`${id}/content_publishing_limit`, token, { params: { fields: 'quota_usage,config' } });
  const row = r.data?.[0] ?? {};
  return { used: row.quota_usage ?? 0, limit: row.config?.quota_total ?? 50 };
}
