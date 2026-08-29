# Search impact baseline — 2026-08-29

Source: `src/pages/calgarywatch.ca-Performance-on-Search-2026-08-29 - Queries.pdf`

The export compares August 15–21, 2026 with August 8–14, 2026. The local-intent SEO release landed late on August 13. That makes this useful directional evidence, but not a clean experiment: the earlier window contains part of the release, Google can recrawl at different times, and most queries have very small samples.

## What changed after the August 13 release

| Query or cluster | Earlier period | Later period | Direction |
| --- | ---: | ---: | --- |
| Calgary crime-map cluster impressions | 19 | 81 | +326% |
| Calgary crime-map cluster clicks | 0 | 2 | Positive, still low volume |
| Calgary crime-map cluster weighted position | 13.05 | 8.98 | Improved by 4.07 positions |
| Exact `calgary crime map` impressions | 12 | 62 | +417% |
| Exact `calgary crime map` clicks | 0 | 2 | 0% → 3.23% CTR |
| Exact `calgary crime map` position | 13.17 | 8.52 | Moved onto page one on average |
| `neighbourhood watch` | 3 impressions, position 2.00 | 3 impressions, position 1.67 | Rank steady; no CTR evidence |
| `airdrie crime map` | 6 impressions, position 8.67 | 4 impressions, position 8.25 | Too little data; no growth yet |

The Calgary crime-map cluster contains queries in the report that include both “Calgary” and “crime map”: `calgary crime map`, `crime map calgary`, `calgary police crime map`, `city of calgary crime map`, and `calgary crime map 2026`. Weighted position uses impressions as weights.

## Commits associated with the movement

| Deployment | Commit | Relevant change |
| --- | --- | --- |
| 2026-08-02 | `3127800` | Added per-route prerendering so crawlers receive page-specific metadata and content. |
| 2026-08-02 | `420806e` | Removed trailing-slash redirects that conflicted with canonical URLs. |
| 2026-08-13 | `64ad269` | Changed titles and copy to target Calgary crime-map and local-safety searches; replaced client-only navigation controls with crawlable links. |
| 2026-08-13 | `d53e72f` | Published the crawlable Calgary neighbourhood-watch guide. |
| 2026-08-13 | `6c22d3a` | Published the focused Airdrie crime-map guide. |
| 2026-08-13 | `5971dc6` | Refreshed visible neighbourhood-guide content. |

The most defensible reading is that the August 13 work is associated with a substantial discovery and ranking improvement for the Calgary crime-map cluster. It is not yet defensible to say it caused the improvement, and there is not enough evidence to judge the Airdrie or neighbourhood-watch guides.

## Next measurement

The active experiment is `seo-2026-08-29-query-ctr-v2` in `experiments.json`. Its deployment commit will be exposed at `/seo-release.json`. Compare the first complete 28 days after deployment against the immediately preceding 28 days. Evaluate clicks, impressions, CTR, and average position together; do not call a higher CTR a win if impressions collapsed.
