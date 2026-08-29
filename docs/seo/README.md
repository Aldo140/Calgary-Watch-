# SEO change tracking

This folder connects three things that otherwise drift apart:

1. the exact Git commit deployed to production;
2. the SEO hypothesis and routes changed in that release; and
3. Search Console results measured over fixed before/after windows.

## For every material SEO change

1. Add or update an experiment in `experiments.json` before deployment.
2. Keep one primary hypothesis and name the target routes and queries.
3. Deploy through the Firebase workflow. The build publishes `/seo-release.json`, containing the exact Git SHA, build time, active experiment, and an SEO-file fingerprint.
4. Record the deployment date in the experiment after the production workflow succeeds.
5. Avoid overlapping material title/content experiments on the same route for 28 days when possible.
6. Export Search Console **Queries** and **Pages** as CSV after the measurement window. PDFs remain useful evidence, but CSV makes exact comparison repeatable.
7. Compare against the immediately preceding equal-length window and record clicks, impressions, CTR, and average position. Segment by page before attributing a query change to a route.

Use `npm run seo:history` to list the active experiment and commits that touched tracked SEO surfaces. The production marker at `https://calgarywatch.ca/seo-release.json` answers the more important question: which commit actually reached the live site?

For future Search Console comparisons, export the Queries table as CSV and run:

```bash
npm run seo:compare -- --csv path/to/Queries.csv --experiment seo-2026-08-29-query-ctr-v2 --out docs/seo/impact-YYYY-MM-DD.md
```

The generated report puts each target query’s before/after clicks, impressions, CTR, and position beside the commits registered for that experiment.

## Attribution rules

- Say **caused** only when the periods are clean, the release was isolated, and competing explanations are unlikely.
- Otherwise say **associated with** or **moved after** the release.
- Do not evaluate CTR alone. A CTR increase paired with a large impression loss can be a regression.
- Low-volume queries are directional. Prefer query clusters and 28-day windows.
- Search Console dates outside the 24-hour view use Pacific Time; Git commit timestamps in this repository use Calgary time. Use calendar-day deployment boundaries, not hour-level attribution.
