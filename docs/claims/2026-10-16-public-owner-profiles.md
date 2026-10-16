# Public and owner organization profiles — October 16, 2026

## Visitor profile

Shared public company profiles now provide direct section navigation, prominent event/market entry points, event search and seven-/30-day filters. Ongoing runs remain discoverable. The initial programme is bounded to 12 listings with explicit Show more; changing search or dates resets that limit. Existing event identities, market calendars and organizer associations are preserved.

A city-only organization address no longer produces directions to an invented visitor entrance. The page points people to individual events or market locations instead. Actual street addresses and named venue addresses retain directions. The visitor profile and management workspace share category accents from the claim-page presentation rules.

Event/market selection and related-company sorting are memoized. The illustrated related-company street is memoized independently, so typing in the programme search does not rebuild every neighbouring storefront. No new Firestore queries were added.

## Claimed-owner workspace

Owners see a preview of the currently published profile above its editing fields. If profile edits exist in the weekly draft, a clear notice explains that the visitor page updates after the complete submission is published. The preview includes current introduction, official website and location information, with a direct visitor-view link.

Active-listing totals include market locations. Date-only productions show an explicit date and official-showtime hint instead of a fake midnight performance time. The workspace adds category context, clearer field grouping, desktop section navigation and responsive preview cards. Existing editing permissions, admin read-only defaults, image restrictions, weekly submission allowance, confirmation, automatic publication and audit behavior are unchanged.

## Validation

All 1,224 tests across 105 files passed, including new visitor-address, ongoing-run/search/window filtering and date-only owner schedule regressions. Public-profile Chromium checks exercised search, filters, pagination/reset, separate market calendars, city-only address behavior and four organizations at 390px/1280px without overflow. Screenshots were visually reviewed.

The existing owner-workspace browser harness passed persisted multi-listing drafts, atomic submission payloads, review/cancel, rate limits and timed unlock, no extra reads on unrelated live updates, admin mode, standalone workspaces and mobile overflow. Browser Firebase/auth boundaries were mocked; no production data writes or emails occurred.

TypeScript (`npm run lint`) and the final production build/prerender passed; 666 pages were generated. Changes follow the existing main-branch Hosting release workflow. Live deployment completion and authenticated production behavior remain separately verifiable.
