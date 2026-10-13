/**
 * Use CalgaryWatch's Hosting domain for live sign-in so Google presents the
 * public brand domain. Local development and preview channels keep the domain
 * supplied by their environment.
 */
export function resolveFirebaseAuthDomain(
  configuredDomain: string,
  hostname: string,
  isProduction: boolean
): string {
  return isProduction && hostname === 'calgarywatch.ca'
    ? 'calgarywatch.ca'
    : configuredDomain;
}
