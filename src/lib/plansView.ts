import type { PlansProfile } from './plansProfile';

/** Admin inspection must work even when the selected member has not finished setup. */
export function plansView(signedIn: boolean, profile: PlansProfile | null, adminPreview: boolean): 'loading' | 'dashboard' | 'setup' {
  if (adminPreview && (!signedIn || !profile)) return 'loading';
  if (signedIn && profile && (adminPreview || profile.piiConsentAt || profile.eventInterests.length)) return 'dashboard';
  return 'setup';
}
