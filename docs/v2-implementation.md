# CalgaryWatch V2 — foundation milestone

Phase 2 implementation and release requirements are documented in [Events & Markets operations](events-markets-operations.md). The notes below describe the original foundation milestone, not the current production activation status.

## Execution plan and architecture decisions

- `src/types/discovery.ts`: provenance-bearing discovery entities; market master and occurrences are separate. Business partner state is independent of editorial selection.
- `src/lib/discovery.ts`, `src/data/discovery.ts`: repository boundary, search normalization, Calgary calendar filters and development-only fixtures. Production has no invented inventory. Categories reserve their slugs under `/local`; one resolver distinguishes categories from businesses.
- `src/components/site/`: shared masthead, mobile navigation, search and footer. Wordmark is replaceable independently of page structure.
- `src/components/discovery/`, `src/components/entity/`: reusable editorial cards, hero, Live preview, existing digest entry point and attributed detail views.
- `src/pages/DiscoveryHomePage.tsx`, `DiscoveryPage.tsx`: home and lazy listing/detail/search shells. Original `LandingPage.tsx` is preserved and accessible at `/community`, linked from discovery navigation and footer. The discovery homepage remains at `/` as the main entry page.
- `src/styles/discovery.css`: scoped explicit tokens. Legacy `index.css` remaps are not modified.
- `src/App.tsx`: preserve every existing route and add discovery surfaces. Map is not imported by discovery pages.
- `src/pages/AdminPage.tsx`: add clearly identified Content, Demand and Partners workspaces to the current authenticated shell. No new CMS or fabricated admin metrics.
- `src/lib/seo.ts`, `discoverySeo.ts`, `scripts/seo/`: broaden homepage metadata; noindex inventory shells; dynamic entity JSON-LD and verified-only sitemap helpers. Existing safety prerenders remain.
- Public contact copy, ingestion User-Agents, security contact and digest runbook move to `aldo@calgarywatch.ca`. Existing admin allowlists remain untouched; Microsoft mailbox ownership does not prove Firebase authentication.

The previous PRODUCT.md homepage tagline requirement is superseded by the V2 request. The exact tagline remains the Live proposition. Existing uncommitted alerts, MapPage, functions and rules work is preserved.

## Publication boundary

Development fixtures are illustrative, labelled in the interface and filtered out of production. They have fixture provenance and cannot enter the generated sitemap. Production listing pages use empty states and organizer suggestion links until actual sources are ingested and reviewed. No live counts or popularity rankings are fabricated. Search operates locally on the repository; it stores no queries or personal information.

The existing weekly email preference flow is reused. Discovery email content, saves, automated claiming, demand metrics and CRM mutations are later milestones, not simulated working controls. New admin panels state this explicitly.

## Next vertical slices

1. Events and Markets: approved sources, normalization, occurrence deduplication, freshness/cancellation handling, moderation, Firestore collections/rules and publishing adapter.
2. Local and Guides: source verification, entity references, claim evidence, independent sponsorship/editorial disclosures.
3. Search, Demand and Partners: grouped search, privacy-safe aggregate measurement, audited claim and outreach workflows.
4. Extend the existing weekly digest after real inventory is available; no email transport rewrite.

Future collections: `discovery_events`, `markets`, `market_occurrences`, `businesses`, `guides`, `neighbourhoods`, `vendor_appearances`, `claim_requests`, `entity_submissions`, `demand_topics`, `demand_history`, `search_events`, `partner_leads`. Do not open client write rules merely to prepare these names. Publishing must use the existing admin/auth/audit conventions.

Firebase Hosting sends X-Robots-Tag: noindex for discovery collections and their descendants during the shell milestone, including unknown entity routes that use the SPA fallback. Remove those collection-wide headers only when the publishing adapter supplies verified inventory and per-entity prerenders/noindex handling; search should remain noindex.

## Release checks

Run `npm run lint`, `npm test`, `npm run build`. Inspect desktop/mobile discovery, keyboard navigation, empty states, unknown entities, search and existing `/map`. Verify production output contains no fixture inventory and inventory shells are noindex. Build regenerates `dist/sitemap.xml` from indexable routes; pass only reviewed entities to its future inventory adapter.

## Foundation verification — September 21, 2026

- TypeScript passes; 573 tests pass in the isolated staged snapshot, including 11 new discovery tests.
- Full production build completes, including 22 route prerenders, generated sitemap and existing digest previews.
- Desktop and 390px mobile hero inspected in Chrome. Mobile menu navigates and closes, search returns grouped sample results, detail pages display provenance.
- Production homepage verified to exclude all development fixtures. Existing Live map opens from the new masthead.
- Baseline had two Windows-only test failures caused by CRLF assumptions in the robots test; the test now normalizes line endings without altering crawler policy.
- Existing map, alerts, Firebase rules/functions and admin data changes present before this work were retained. No live data was created, no email was sent and no deployment was performed.
- Real inventory ingestion, production claim workflows, demand metrics, partner CRM, final logo art and independent accessibility audit remain later work. The current photography reuses existing repository assets.
