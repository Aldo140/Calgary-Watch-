/**
 * Moves event- and market-level verifications to their organizer. Every
 * approved claim on an event or market linked to a published organization
 * profile is re-approved with that organization's access (approveOrganizationClaim):
 * the claimant and the listing's other approved representatives manage the
 * profile and its events, the organization gets the Verified mark, and
 * approval dates, email history and the weekly allowance are preserved.
 *
 * Reports only by default. `--apply` writes. Runs after the catalogue sync in
 * deploy-firebase.yml, so later event-level approvals are promoted on the next deploy.
 */
import { readFile } from 'node:fs/promises';
import type { DiscoveryEntity } from '../../src/types/discovery';
import { planOrganizerPromotions, promotionTargets, type PromotionClaim } from '../../src/lib/organizerPromotion';
import { approveOrganizationClaim } from './approve-organization';

export const PROMOTION_ACTOR = 'system:organizer-promotion';

export async function promoteOrganizerClaims(db: any, entities: readonly DiscoveryEntity[], claims: readonly PromotionClaim[], apply: boolean, now = Date.now()) {
  const rows = planOrganizerPromotions(claims, entities);
  const results: Array<{ entityId: string; organizationId: string; status: 'promoted' | 'planned' | 'failed'; moved?: number; error?: string }> = [];
  for (const row of promotionTargets(rows)) {
    if (!apply) { results.push({ entityId: row.entityId, organizationId: row.organizationId!, status: 'planned' }); continue; }
    try {
      const out = await approveOrganizationClaim(db, PROMOTION_ACTOR, { uid: row.uid, entityId: row.entityId, organizationId: row.organizationId, confirmSharedAccess: true }, {}, now, { system: true });
      results.push({ entityId: row.entityId, organizationId: row.organizationId!, status: 'promoted', moved: out.moved });
    } catch (error) {
      results.push({ entityId: row.entityId, organizationId: row.organizationId!, status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { rows, results };
}

if (process.argv[1]?.endsWith('promote-organizer-claims.ts')) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw Error('FIREBASE_SERVICE_ACCOUNT is required; no claims were read.');
  const apply = process.argv.includes('--apply');
  const { inventoryDatabase } = await import('../discovery/firebase');
  const { entities } = JSON.parse(await readFile('src/generated/discovery-index.json', 'utf8')) as { entities: DiscoveryEntity[] };
  const db = inventoryDatabase();
  const snapshot = await db.collection('listing_claims').where('status', '==', 'approved').limit(2000).get();
  const { rows, results } = await promoteOrganizerClaims(db, entities, snapshot.docs.map(d => d.data() as PromotionClaim), apply);
  const line = (r: (typeof rows)[number]) => `${r.entityTitle} (${r.entityId})${r.organizationTitle ? ` → ${r.organizationTitle} (${r.organizationId})` : ''}${r.organizer ? ` · organizer "${r.organizer}"` : ''}`;
  console.log(`Approved claims: ${rows.length}`);
  for (const [action, label] of [['organization', 'Already manage an organization profile'], ['promote', apply ? 'Moved to their organizer' : 'Would move to their organizer'], ['no-organizer', 'Event or market with no linked organization profile (keeps its organizer workspace)'], ['missing-listing', 'Listing no longer published']] as const) {
    const group = rows.filter(r => r.action === action);
    console.log(`\n${label}: ${group.length}`);
    for (const r of group) console.log(`  - ${line(r)}`);
  }
  const failed = results.filter(r => r.status === 'failed');
  for (const r of failed) console.log(`\nFailed ${r.entityId} → ${r.organizationId}: ${r.error}`);
  console.log(`\n${apply ? `Promoted ${results.filter(r => r.status === 'promoted').length} listing(s), ${failed.length} failed.` : `Report only. Re-run with --apply to promote ${results.length} listing(s).`}`);
  if (failed.length) process.exitCode = 1;
}
