# CalgaryWatch Spotlights

Long-form features on the people behind what's on in Calgary. First one:
**The Dark Side of Calgary Cinema: Inside Hex After Dark** at
`/spotlight/hex-after-dark`.

## Where things live

| What | File |
| --- | --- |
| Content (copy fields, links, sources, films, interview, review) | `src/content/spotlights.ts` |
| Helpers: promo window, nights left, analytics, JSON-LD | `src/lib/spotlights.ts` |
| Feature page | `src/pages/SpotlightPage.tsx`, `src/styles/spotlight.css` |
| Reusable film/filmmaker showcase | `src/components/spotlight/FilmShowcase.tsx`, `src/styles/film-showcase.css` |
| Seasonal promo card (home, /events, related event pages) | `src/components/spotlight/SpotlightCard.tsx`, `src/styles/spotlight-card.css` |
| SEO, breadcrumbs, prerender, share card | `src/lib/seo.ts`, `scripts/seo/rewriteHtml.ts`, `src/lib/shareImage.ts` (theme `spotlight`) |
| Exposure report | `scripts/ops/spotlight-report.ts`, workflow **Spotlight report** |
| Tests | `tests/spotlight.test.ts` |

## Rules

- Every fact is cited to a public page (`sources`, shown as numbered superscripts) or attributed to the person who told us.
- No invented films, quotes, biographies or review. The showcase shows an empty state until real details arrive; the review and Q&A sections stay as "coming after Friday" until `review.status` / answers are filled in. Tests enforce this.
- Images need `credit` and `permission`. No stock photos presented as festival photography.
- The partnership disclosure (`disclosure`, `partnerLabel`) shows on the cards, the share card and at the top and bottom of the feature.

## Temporary vs evergreen

The organizer's /local profile (`profileId`) carries the card for good, and the feature links back to it.

`promo.from` / `promo.until` control the homepage and /events cards (Hex: Oct 27 to midnight Oct 31, 2026). The card on related event pages follows `relatedSourceIds` (the ScreamFest nights) and goes away when those listings expire. The feature page itself is indexed and stays up; after the run it says "This year's run has ended".

## After the visit: adding the review and interview

1. In `src/content/spotlights.ts`, fill `interview.questions[].answer` with Cameron's actual words (edited for length only, with his OK), and set `interview.status: 'published'`.
2. Put the review paragraphs in `review.body` and set `review.status: 'published'`.
3. Add each film as a `ShowcaseFilm`, with `source` saying where the details came from.
4. Bump `updated`.

## Measuring

Page views come from the existing `page_views` collection (path, referrer host, UTM tags, per-tab session). Spotlight interactions are `product_events`:

| Event | Props |
| --- | --- |
| `spotlight_card_seen` | `spot`, `at` (home, events, event-page, profile), `sid`; once per tab per placement |
| `spotlight_card_click` | `spot`, `at`, `sid` |
| `spotlight_link_click` | `spot`, `link` (tickets, festival, screamfest, facebook, submissions, directions, filmmaker-email, film-*), `at`, `sid` |
| `spotlight_read` | `spot`, `depth` (middle = reached the films, end = reached the links), `sid`; once per tab |

Run **Actions → Spotlight report → Run workflow** (slug `hex-after-dark`), or `npm run spotlight:report -- hex-after-dark --since 2026-10-27` with the service account. The Markdown lands in the run summary and is shareable as-is. It reports views, sessions, taps and sources only; it never claims ticket sales or attendance.

Tag shared links with `?utm_source=<network>&utm_medium=social&utm_campaign=hex-after-dark` so the report can split traffic by post.
