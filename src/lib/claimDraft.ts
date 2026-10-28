import type { ClaimDraft } from './claims';
export const emptyClaimDraft = (): ClaimDraft => ({ name: '', role: '', workEmail: '', phone: '', note: '', agree: false });
export function restoreClaimDraft(raw: string | null): ClaimDraft {
  const out = emptyClaimDraft();
  try {
    const data = JSON.parse(raw || '{}');
    for (const key of ['name', 'role', 'workEmail', 'phone', 'note'] as const) if (typeof data?.[key] === 'string') out[key] = data[key];
    out.agree = data?.agree === true;
  } catch { /* A blocked storage or invalid draft must never block sign-in. */ }
  return out;
}

/**
 * The verification link opens in a new tab (and sessionStorage is per tab),
 * so a claim waiting on verification is kept in localStorage: the draft, and
 * a flag that says "send this as soon as the email is verified". Both are
 * dropped once the claim is sent, and ignored after a week.
 */
const WEEK = 7 * 24 * 60 * 60_000;
const draftKey = (id: string) => `claim-draft:${id}`;
const queueKey = (id: string) => `claim-queued:${id}`;
function local(): Storage | null { try { return window.localStorage; } catch { return null; } }

export function loadClaimDraft(id: string): ClaimDraft {
  try {
    const raw = local()?.getItem(draftKey(id));
    const at = raw ? Number(JSON.parse(raw)?.savedAt) : 0;
    if (raw && Date.now() - at < WEEK) return restoreClaimDraft(raw);
    return restoreClaimDraft(sessionStorage.getItem(draftKey(id)));
  } catch { return restoreClaimDraft(null); }
}
export function saveClaimDraft(id: string, draft: ClaimDraft): void {
  try { local()?.setItem(draftKey(id), JSON.stringify({ ...draft, savedAt: Date.now() })); } catch { /* storage is optional */ }
}
export function isClaimQueued(id: string): boolean {
  try { const at = Number(local()?.getItem(queueKey(id))); return at > 0 && Date.now() - at < WEEK; } catch { return false; }
}
export function setClaimQueued(id: string, on: boolean): void {
  try { if (on) local()?.setItem(queueKey(id), String(Date.now())); else local()?.removeItem(queueKey(id)); } catch { /* storage is optional */ }
}
export function clearClaimDraft(id: string): void {
  setClaimQueued(id, false);
  try { local()?.removeItem(draftKey(id)); sessionStorage.removeItem(draftKey(id)); } catch { /* storage is optional */ }
}
