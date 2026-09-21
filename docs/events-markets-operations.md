# Events & Markets: publishing and operations

This milestone uses the existing V2 UI and Firebase project. `/community`, `/map`, Local, Guides, Demand, Partners and email transport remain in place. No discovery search service or SSR dependency is introduced.

## Trust boundary

`/submit` sends a strict Event/Market suggestion to `submitDiscovery`. A verified signed-in account may submit up to five new suggestions per UTC day. Identical retries are idempotent. Clients cannot write inventory or submission documents directly. Extra fields such as status, verification, scores, partner and editorialSelection are rejected. BusinessSubmissionInput is defined for the future but is not accepted by this milestone.

The admin Content workspace reads private inventory and calls `manageDiscovery`. The service checks the same approved-email/user-role convention as the existing admin console. Public suggestions require an administrator to select an approved official/editorial source, check the facts and save a normalized pending record. A separate Verify & publish action records reviewer, verification time and revision. No import automatically publishes.

Collections: `events`, `markets`, `market_occurrences`, `entity_submissions`, `discovery_sources`, `discovery_source_records`, `discovery_audit`, `discovery_submission_limits`. Raw submissions/source records and reviewer identifiers never enter the public bundle.

## Source import

The initial researched source batch is `scripts/discovery/reviewed-sources.json`. Facts were checked on September 21, 2026 against:

- [Alcove: Love Letters From the Diaspora](https://www.alcoveartscentre.ca/upcomingprograms/love-letters-from-the-diaspora): September 26, 18:00–20:30, 1040 8 Street SW; paid admission.
- [Alcove: Comics Workshop](https://www.alcoveartscentre.ca/upcomingprograms/comics-workshop-sept-27): September 27, 13:30–15:30, 244 7 Avenue SW; registration and donation admission.
- [Farmers & Makers Market at cSPACE](https://www.farmersmakersmarket.ca/cspace): Saturdays 10:00–14:00 through October 17, 2026, 1721 29 Avenue SW. Four remaining dates are represented as separate occurrences, with source IDs that survive time corrections.

These are actual researched records, not development fixtures. Research does not imply they have been written to Firestore or published. Recheck the sources if importing this batch later. No unconfirmed vendor rosters, prices, transit advice or popularity counts are invented.

```sh
npm run discovery:ingest -- --file=scripts/discovery/reviewed-sources.json
npm run discovery:ingest -- --file=scripts/discovery/reviewed-sources.json --write
```

The first command validates without connecting to Firestore. The second requires Admin SDK access (`FIREBASE_SERVICE_ACCOUNT` or Application Default Credentials) and creates/updates pending records. `VITE_FIREBASE_PROJECT_ID` and `VITE_FIRESTORE_DATABASE_ID` select the target project/database. Firebase CLI login alone is not Application Default Credentials; use the existing CI service account or `gcloud auth application-default login` for Admin SDK commands.

`InventoryProvider` supports independent providers. EditorialFileProvider handles sourced manual entries; JsonFeedProvider consumes an approved HTTPS endpoint returning `{id,input,cancelled?}[]`, with time/size limits and redirects disabled. This is an explicit adapter contract, not a claim that an organizer offers a compatible API. No undocumented API or broad scrape is configured. Additional provider-specific feed adapters can implement the same interface.

Stable provider + source-record IDs update records in a transaction. Cross-provider title/address/time matches produce review warnings rather than silently merging distinct events. An unchanged fetch preserves publication and verification time; a changed fetch returns content to pending. Removed market occurrences are retained as cancelled. An archived record stays archived during ingestion. The editor rejects stale revisions when a concurrent import changes a record.

## Release sequence

1. Configure callable functions in the existing Firebase project and deploy `submitDiscovery`, `manageDiscovery` plus Firestore rules. The default function database is `(default)`; set `DISCOVERY_DATABASE_ID` in the Functions environment if using a named database, matching `VITE_FIRESTORE_DATABASE_ID` on the site and CLI.
2. Import approved sources, review source links/dates, then publish through Admin → Discovery content. Editing a market manages individual occurrences; cancelling the whole market marks all its occurrences cancelled.
3. Run `npm run discovery:export`, then `npm run build`. Export uses one consistent Firestore transaction, checks publication/verification/freshness, removes private review fields, and atomically writes `src/generated/discovery-index.json`.
4. Release Hosting using the existing deployment workflow. The workflow now exports authenticated Firestore inventory before building and fails if that export fails. It never falls back to fixtures. Local builds use the explicitly checked-in snapshot, initially empty; they do not invent or download inventory implicitly.
5. Repeat export/release after publication, archive, cancellation or source corrections. The admin UI states this delay explicitly. This milestone does not claim real-time publication to a static site. Operations must recheck inventory at least every 14 days and release after changes. Expired verification is excluded on export and by the browser repository.

Public homepage, list/detail pages, search, JSON-LD, entity prerenders and sitemap eligibility all read the same generated inventory. Market details include next and upcoming dates, cancellation labels, location, confirmed amenities and source links. No data is read from unmoderated Firestore documents in the public app.

## Indexing gate

`discoveryIndexingEnabled` remains false and broad Firebase noindex headers remain in place. Verified entity pages still get their own metadata, HTML and Event/Place JSON-LD, but do not enter the release sitemap until indexing is enabled. Unknown, draft, stale and unverified records never become indexable. Collection pages and search retain their noindex metadata.

Before opening indexing, verify a real export and entity HTML, set the explicit gate, and remove **only** the Events/Markets descendant header rules in the same reviewed Hosting release. Keep collection/search noindex until their own content is ready. Do not remove all discovery headers globally. Unknown SPA fallback URLs must keep their client noindex; for strict first-response 404/noindex on arbitrary paths, introduce an explicit Hosting routing strategy before broad crawl promotion.

## Calendar policy and validation

All filtering uses America/Edmonton, including DST. Weekend means Friday–Sunday of the current weekend, or the upcoming weekend on Monday–Thursday. Tonight means a start at 17:00 through just before midnight, or at least one hour **and half the event duration** overlapping that window. A noon–20:00 event is not Tonight. Ended/cancelled events and markets with no future non-cancelled occurrences are excluded from browsing filters; existing cancellation detail pages remain available while verified.

Run `npm run lint`, `npm test`, `npm run build`. The pipeline tests cover strict DTOs, approved hosts, stable normalization, duplicate warnings, repeat imports, revisions, cancellations, missing occurrence handling, stale records, DST, Tonight, repository/SEO consistency and rule/callable boundaries. Transaction tests use an in-memory adapter; they are not a substitute for a deployed Firebase permissions smoke test. Production submission/moderation smoke tests and the first authenticated inventory export remain required before launch.
