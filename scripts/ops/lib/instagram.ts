// Instagram content publishing through the Graph API (Instagram API with
// Facebook Login). One image post = create a container, wait for it, publish.

import type { BrandId } from '../../../src/types/ops';

const GRAPH = 'https://graph.facebook.com/v25.0';

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

/**
 * The Instagram professional account with this handle, found through the token's
 * Facebook Pages. One login often manages both brands' Pages, so the account is
 * matched by handle: a CalgaryWatch post can never land on CalgaryDaily.
 */
export async function igAccount(token: string, handle: string): Promise<{ id: string; username: string }> {
  const key = `${token}|${handle}`;
  if (accounts.has(key)) return accounts.get(key)!;
  const pages = await graph('me/accounts', token, { params: { fields: 'instagram_business_account{id,username}', limit: '100' } });
  const all = (pages.data ?? []).map((p: any) => p.instagram_business_account).filter(Boolean) as { id: string; username: string }[];
  if (!all.length) throw new Error('Instagram: no Facebook Page with a linked Instagram professional account for this token.');
  const ig = all.find(a => a.username.toLowerCase() === handle.toLowerCase());
  if (!ig) throw new Error(`Instagram: this token reaches ${all.map(a => '@' + a.username).join(', ')}, not @${handle}. Fix "handle" in brand/*.json or link @${handle} to a Page this login manages.`);
  accounts.set(key, ig);
  return ig;
}

export async function tokenExpiry(token: string): Promise<number | null> {
  const d = await graph('debug_token', token, { params: { input_token: token } });
  const at = d.data?.data_access_expires_at || d.data?.expires_at;
  return at ? at * 1000 : null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function publishImage(token: string, handle: string, imageUrl: string, caption: string, altText: string): Promise<{ mediaId: string; permalink: string | null }> {
  const { id: igId } = await igAccount(token, handle);
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
export async function publishingUsage(token: string, handle: string): Promise<{ used: number; limit: number }> {
  const { id } = await igAccount(token, handle);
  const r = await graph(`${id}/content_publishing_limit`, token, { params: { fields: 'quota_usage,config' } });
  const row = r.data?.[0] ?? {};
  return { used: row.quota_usage ?? 0, limit: row.config?.quota_total ?? 50 };
}
