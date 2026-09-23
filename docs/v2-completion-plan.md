# CalgaryWatch V2 completion plan

Updated: September 22, 2026
Branch: `prod/calgarywatch-v2`

This is the execution checklist for taking the current repository to launch readiness. It records the observed state rather than assuming the aspirational brief is already implemented. A checked item means the repository contains a working implementation and its current verification is noted below. External production actions remain out of scope until the owner explicitly approves them.

## Verified baseline

- [x] React 19, TypeScript, Vite, Tailwind 4 and route-level lazy loading are active.
- [x] CalgaryWatch Live remains at `/map`, with Firebase-backed reporting, moderation, alerts and existing city-data ingestion.
- [x] Discovery has a single public snapshot boundary used by React, search, SEO and prerendering.
- [x] Current snapshot: 22 published/source-checked entities and 50 market occurrences: 2 events, 6 markets, 4 businesses, 3 guides and 7 neighbourhoods.
- [x] Ticketmaster and recurring-market providers exist; imported records enter review rather than auto-publishing.
- [x] Event/market submissions and admin publication use callable/server trust boundaries.
- [x] Weekly email, reply sync, preview and alert infrastructure exist.
- [x] Privacy-aware page-view tracking records paths, host-only referrers, campaign labels and per-tab session IDs.
- [x] Production build, prerender and email preview generation pass on the audited branch.
- [ ] Current snapshot meets launch volume goals. It does not: event, business, guide, market and neighbourhood inventory remain below the stated targets.

## Immediate truth and product cleanup

- [x] Remove the fabricated homepage “trending” dataset, UI and test containing invented ranks, views, confirmations, incidents and relative times.
- [x] Remove hard-coded inventory/feed/audience/delivery counts from active homepage sections. Any future count must come from the snapshot or live source-health data.
- [x] Prevent shared local editorial artwork from using entity-specific alt text on cards, hero features, guides and entity detail pages. Provider/entity-specific images retain reviewed alt text.
- [ ] Complete the underlying asset provenance audit and correct/migrate the misleading alt values currently embedded in the generated snapshot/canonical records.
- [ ] Confirm every generated entity is backed by a canonical Firestore/admin-managed source rather than a hand-edited public JSON record.
- [ ] Replace unknown-rights imagery or document its licence/source.
- [ ] Ensure all development fixtures stay development-only and cannot enter production search, sitemap or structured data.

## Brand and global navigation

- [ ] Create the final simple vector-first CalgaryWatch mark and lockups: primary, horizontal, square/app, monochrome, dark, email, social and Open Graph fallback.
- [ ] Replace temporary/secondary collage marks in global brand positions while retaining them only as editorial art.
- [ ] Implement desktop navigation for Events, Markets, Local, Guides, Neighbourhoods and Live, plus Search and My Calgary/account.
- [ ] Keep the mobile masthead compact, with search and Live reachable in one interaction.
- [ ] Update favicons, manifest, metadata, email assets and design-system documentation.

## Homepage and discovery navigation

- [ ] Put useful inventory directly after the hero: intents, This Weekend, Markets, compact Live, Local, Guides and Neighbourhoods.
- [ ] Keep explanatory brand material below useful content and remove decorative sections that lengthen the path to inventory.
- [ ] Keep hero copy simple, with universal search and shortcuts for This Weekend, Tonight, Markets, Date Night, Food, Free, With Kids and Near Me.
- [ ] Use only real data for dates, counts and “right now” states.
- [ ] Verify mobile layouts at 390px, tablet, laptop and large desktop, including 200% zoom.

## Events and markets

- [x] Routes, Calgary-time Today/Tonight/Weekend logic, cancellation handling and occurrence filtering exist.
- [x] Market master entities and occurrences are separate.
- [x] Source URLs, verification timestamps and duplicate warnings exist in publication/admin infrastructure.
- [ ] Complete event detail actions: map/location, save, share and suggest correction.
- [ ] Complete market detail: prominent next opening, upcoming/cancelled dates, map, save, share and correction flow.
- [ ] Add canonical vendor and vendor-appearance records to public/admin/domain layers.
- [ ] Display “Vendors this week” and “Find them next” only from sourced appearance records.
- [ ] Grow verified inventory through approved/documented feeds and editorial batches; never auto-publish third-party imports.

## Local, claims and partners

- [ ] Expand the business schema and UI for listed, claimed, CalgaryWatch Pick and Featured Partner states.
- [ ] Build approved business-provider boundaries, keeping commercial-provider storage and attribution rules isolated.
- [ ] Implement authenticated claim requests, admin review and protected owner-edit proposals.
- [ ] Prevent clients/owners from setting partner, editorial, verification, publication or provenance fields.
- [ ] Build partner lead/contact/note/task/audit workflow without sending outreach.
- [ ] Keep paid status separate from editorial selection and label commercial placement clearly.

## Guides, neighbourhoods and Near Me

- [ ] Expand guide authoring into a structured editorial CMS with sections, entity references, methodology, disclosures, authorship and SEO fields.
- [ ] Render guide entries from canonical entity IDs so entity corrections propagate.
- [ ] Turn neighbourhood pages into automatic hubs for events, markets, businesses, guides and Live context.
- [ ] Add official boundary/point-in-polygon infrastructure and sourced nearby-neighbour relationships.
- [ ] Implement geolocation with clear permission timing, denied fallback and no silent storage of precise location.

## Search, demand and analytics

- [x] Public grouped search across the current snapshot exists.
- [ ] Add filters for date, category, neighbourhood, price/free and open-now where the data supports them.
- [ ] Track explicit privacy-aware product events separately from page views.
- [ ] Add zero-result query aggregation and admin demand topics with evidence and audit history.
- [ ] Do not expose or persist raw query text containing likely sensitive information beyond the documented retention boundary.
- [ ] Remove any “Trending” UI until backed by measured, privacy-safe demand data.

## My Calgary and submissions

- [ ] Build optional account navigation and a My Calgary area for saves, follows and preferences.
- [ ] Add save/unsave boundaries for supported entity types without requiring login for browsing.
- [ ] Extend moderated submissions to businesses, corrections, claims and place recommendations with strict DTOs.

## Admin and operations

- [x] Existing Admin, people, reports, attention queue, discovery content and email planning surfaces are present.
- [ ] Reorganize Admin into Overview, Content, Growth, Community and Operations without fictional metrics.
- [ ] Add claims, guides, businesses, neighbourhoods, demand and partners workspaces.
- [ ] Add stale inventory, source failures, duplicates, pending suggestions and zero-result opportunities to the actionable overview.
- [ ] Preserve audit history and reject stale concurrent edits across all new workflows.

## Jev / AI assistance

- [ ] Add an optional server-only Jev adapter only for assistive editorial tasks such as summarizing sourced notes or suggesting duplicate candidates.
- [ ] Keep Jev disabled when its server secret is absent and provide deterministic non-AI behaviour.
- [ ] Never send private claim evidence, account data, precise user location or unpublished sensitive reports to the model.
- [ ] Require human approval before AI-assisted copy or classification affects published content.
- [ ] Store the Vercel AI Gateway credential only in server/CI secret management; never in Vite variables, checked-in files, URLs or browser code.

## SEO, accessibility, privacy and performance

- [ ] Create collection-specific indexing readiness checks; do not globally remove noindex protection.
- [ ] Finish truthful first-response metadata, 404 handling, canonical URLs, sitemaps and schema validation.
- [ ] Enable indexing only for published, verified, fresh, useful entities after each collection passes its gate.
- [ ] Audit keyboard order, menus, dialogs, labels, errors, focus visibility, contrast, 44px touch targets, reduced motion and 200% zoom.
- [ ] Update Privacy to match final collections, vendors, retention and sponsored content.
- [ ] Verify Discovery routes do not load Leaflet, MapLibre, Three.js or heavy motion packages unnecessarily.
- [ ] Add responsive image sizes/srcset and measure LCP/CLS on production-equivalent builds.

## Security and release verification

- [ ] Keep all three existing admin identities synchronized across frontend, rules and functions until replacement access is confirmed.
- [ ] Add contract tests for claim, owner edits, partner/editorial separation, demand workflow and product analytics.
- [ ] Test Firestore and Storage rules plus callable boundaries against emulators/deployed smoke environments as appropriate.
- [ ] Cover provider failure, duplicates, stale inventory, fallbacks, 404s and critical user journeys.
- [ ] Keep `npm run lint`, `npm test` and `npm run build` green after each milestone.
- [ ] Complete browser QA for all routes listed in the owner brief at mobile, tablet, laptop and large desktop sizes.
- [ ] Create `docs/v2-completion-report.md` only after the implementation and evidence support the report.

## Credential and external-action status

- **Provided:** a Vercel AI Gateway key suitable for a server-side Jev adapter. It is not stored in the repository.
- **Still external/credential dependent:** production Firebase Admin access, Ticketmaster secret if not already configured in CI, optional 511 Alberta key, any licensed business/place provider, email provider/runtime secrets, billing-required Firebase functions, DNS and deployment access.
- **Human editorial dependent:** final “best” selections, guide recommendations, image-rights decisions, source approvals, partner status and publication review.
- **Prohibited without new approval:** production deployment, DNS/billing changes, real outreach, marketing email, paid activation or external publication.
