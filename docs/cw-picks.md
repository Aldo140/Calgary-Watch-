# CalgaryWatch Picks

One vetted company per service list (/best service lists and service searches like "plumber"), an A–Z list under it, and an opt-in check-in a week after a reader contacts a company. Plan: https://claude.ai/artifact/Do7qmZLC1mCaZ8aHtFRsqu

## Setting a Pick

`pick` on a service `BestCategory` in `src/content/bestOf.ts`:

```ts
pick: { place: 'Knight Plumbing', why: 'One sentence, backed by the checks.', until: '2027-05-20',
  checks: { licence: '2026-11-18', insurance: '…', wcb: '…', local: '…', reviews: '…', 'mystery-call': '…', pledge: '…' } }
```

`activePick` (src/lib/cwPicks.ts) shows it only when all seven checks have a date on or before today, `until` hasn't passed and `place` is on the list. tests/cw-picks.test.ts fails the build if a list ships a Pick that wouldn't render. Re-vet every 6 months (`until`).

The checks (wording in `PICK_CHECKS`): licence (Alberta Tradesecrets or City licence), insurance certificate, WCB clearance letter, Calgary-area ownership, 50+ public reviews at 4.5+ read for patterns, a mystery call as a customer, and the signed pledge (written quotes, permits pulled, complaints answered in 5 business days, no deposit without an Alberta prepaid contracting licence). Keep the files (screenshots, dates, who checked) outside the public repo.

Never set a Pick for money, and never let paid products change the Pick, a badge or list order.

## Data

| Collection | Written by | Holds | Read by |
| --- | --- | --- | --- |
| `product_events` name `pick_contact` | any tap on Call/Website | list, place key, via, contact, followup yes/no | admins |
| `pick_followups` | reader, only with the consent box ticked | email, place, consent `pick-v1`, 24-char key, dueAt (+7 days) | admins |
| `pick_reviews/{followupId}` | reader via the emailed link | hired, stars, onTime, onPrice, again, ≤600 chars | admins |

firestore.rules accepts a review only when the follow-up exists and its key, list and place match. Deploy rules (Deploy Firebase Backend, target `rules`) before the UI can save follow-ups.

## The email

`npm run picks:followups` (scripts/picks/send-followups.ts) sends due follow-ups once and wipes the address after a review or 60 days. Not scheduled yet: send a sample first (`PICK_EMAIL_SAMPLE_TO=… npm run picks:followups`), and add it to discovery-actions.yml once Aldo approves the copy.

## Moderation

Reviews are never published automatically. Read each one; publish only counts and themes ("27 hired, 93% would hire again"), give the company a right of reply before anything negative appears, and drop reviews with contact details, abuse or signs of a burst.
