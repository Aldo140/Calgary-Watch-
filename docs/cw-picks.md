# CalgaryWatch Picks

One vetted company per Local service (all 20 in `src/data/localServices.ts`), an A–Z shortlist under it, and an opt-in check-in a week after a reader contacts a company. Plan: https://claude.ai/artifact/Do7qmZLC1mCaZ8aHtFRsqu

## Where it shows

- `/picks`: hub. Find a service, busy-now first, how a Pick is earned, privacy (`#privacy`), vetting ask for businesses.
- `/picks/:service`: a desk per service (noindex until Picks exist). Pick card or open slot, the shortlist, what to ask on the phone, booking months.
- `/search`: `serviceForQuery` turns "plumber", "snow removal", "best electricians calgary" into the compact desk.
- `/best/<service list>`: the full board above the cited sources.
- `/local/services`: each card links to its desk ("Who to call").

A shelf is the cited Best of Calgary list for the service (`best` on the service) plus every Local business profile that offers it (`offersService`), merged by name, verified first, then A–Z ignoring "The". Only companies with a phone or website.

## Setting a Pick

`PICKS` in `src/content/cwPicks.ts`, keyed by service id:

```ts
plumbing: { place: 'Knight Plumbing', why: 'One sentence, backed by the checks.', until: '2027-05-20',
  checks: { licence: '2026-11-18', insurance: '…', wcb: '…', local: '…', reviews: '…', 'mystery-call': '…', pledge: '…' } }
```

`shelfFor` (src/lib/cwPicks.ts) shows it only when all seven checks have a date on or before today, `until` hasn't passed and `place` is a contender's exact name on that service's shelf. tests/cw-picks.test.ts fails the build if a list ships a Pick that wouldn't render. Re-vet every 6 months (`until`).

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

## Making a Pick live (vetting desk)

Admin → Partners → CalgaryWatch Picks → **Vetting desk**. One row per service, busiest first.

1. Open a service and choose the company (the most contacted one is pre-selected).
2. Do each check and date it the day it passes. The private note (licence number, insurer, what the mystery call sounded like) stays in Firestore `pick_vetting` and is never published.
3. Check 7: copy the pledge email, send it, date it when they reply "I agree".
4. Write the one-line why, then **Make it live**.

`owner-listing-edits.yml` (every 15 minutes) sees the change and starts a deploy unless one is running. The deploy runs `scripts/picks/export-picks.ts`, which writes only the company, check dates, why and lapse date to `src/generated/cw-picks.json`, then marks the change published. A Pick lapses six months after its oldest check. **Pause the Pick** takes the seal off the same way. A Pick written in `src/content/cwPicks.ts` wins over the desk.
