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
