// Phase 0 access check for the operations agent. Reads tokens from the
// environment, calls each service once with a read-only request, and prints
// what works. Never posts, sends or writes anything.
//
//   IG_TOKEN_CALGARYWATCH=... IG_TOKEN_CALGARYDAILY=... ANTHROPIC_API_KEY=... npm run ops:check

import { brandKit } from './lib/brand';
import { igAccount, isInstagramLoginToken } from './lib/instagram';

const GRAPH = 'https://graph.facebook.com/v25.0';

type Result = { name: string; ok: boolean; detail: string };

async function getJson(url: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(url, init);
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

// A token works for publishing only if it reaches a Page that has an
// Instagram professional account linked to it.
async function checkInstagram(label: string, token: string | undefined): Promise<Result> {
  const name = `Instagram (${label})`;
  if (!token) return { name, ok: false, detail: 'token not set' };

  // Instagram-login tokens ("IG…") belong to exactly one account; the handle must match the brand kit.
  if (isInstagramLoginToken(token)) {
    const handle = brandKit(label === 'CalgaryWatch' ? 'calgarywatch' : 'calgarydaily').handle;
    try {
      const account = await igAccount(token, handle);
      return { name, ok: true, detail: `@${account.username} (Instagram login token; renewed daily by the ops job)` };
    } catch (e) {
      return { name, ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }

  const debug = await getJson(`${GRAPH}/debug_token?input_token=${token}&access_token=${token}`);
  const data = debug.body?.data;
  if (!data?.is_valid) {
    return { name, ok: false, detail: debug.body?.error?.message ?? 'token is not valid' };
  }
  const scopes: string[] = data.scopes ?? [];
  const missing = ['instagram_basic', 'instagram_content_publish', 'pages_show_list'].filter(
    (s) => !scopes.includes(s),
  );
  const expires = data.expires_at
    ? new Date(data.expires_at * 1000).toISOString().slice(0, 10)
    : 'never';

  const pages = await getJson(
    `${GRAPH}/me/accounts?fields=name,instagram_business_account{id,username}&access_token=${token}`,
  );
  const linked = (pages.body?.data ?? []).filter((p: any) => p.instagram_business_account);
  if (!linked.length) {
    return { name, ok: false, detail: 'no Facebook Page with a linked Instagram business account' };
  }
  const accounts = linked
    .map((p: any) => `@${p.instagram_business_account.username} (ig id ${p.instagram_business_account.id}, page "${p.name}")`)
    .join(', ');
  if (missing.length) {
    return { name, ok: false, detail: `${accounts}; missing permissions: ${missing.join(', ')}` };
  }
  return { name, ok: true, detail: `${accounts}; expires ${expires}` };
}

async function checkAnthropic(key: string | undefined): Promise<Result> {
  const name = 'Anthropic API';
  if (!key) return { name, ok: false, detail: 'ANTHROPIC_API_KEY not set' };
  const res = await getJson('https://api.anthropic.com/v1/models', {
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', ...(process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } : {}) },
  });
  if (res.status !== 200) {
    return { name, ok: false, detail: res.body?.error?.message ?? `HTTP ${res.status}` };
  }
  return { name, ok: true, detail: `${res.body?.data?.length ?? 0} models available` };
}

async function main() {
  const results = await Promise.all([
    checkInstagram('CalgaryWatch', process.env.IG_TOKEN_CALGARYWATCH),
    checkInstagram('CalgaryDaily', process.env.IG_TOKEN_CALGARYDAILY),
    checkAnthropic(process.env.ANTHROPIC_API_KEY),
  ]);
  for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'}  ${r.name}: ${r.detail}`);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
