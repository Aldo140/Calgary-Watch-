/** Bounded transient retries only; no credentials are included in diagnostics. */
export async function providerFetch(url: URL | string, init: RequestInit, deps: { fetch?: typeof fetch; pause?: (ms: number) => Promise<void> } = {}): Promise<Response> {
  const request = deps.fetch ?? fetch;
  const pause = deps.pause ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    const response = await request(url, init);
    if (attempt >= 2 || (response.status !== 429 && response.status < 500) || response.ok) return response;
    // Never hold a workflow for an unbounded Retry-After supplied by an upstream.
    const retry = Number(response.headers?.get('retry-after'));
    await response.body?.cancel();
    await pause(Math.min(3000, Math.max(500, Number.isFinite(retry) && retry > 0 ? retry * 1000 : 500 * 2 ** attempt)));
  }
}
