# Firestore cost monitoring — 2026-10-27

Checked against `main` at `8bd459f` and the Firestore usage workflow run of
2026-10-27 03:14 UTC (Cloud Monitoring, last two days). Project `calgary-map-e70bb`.
Run **Actions → Firestore usage** to refresh every number below; it reads Cloud
Monitoring for free and costs about 50 reads for the collection counts.

## What the numbers say

| Quota day (07:00 UTC) | Reads | Free limit |
| --- | --- | --- |
| 2026-10-25 | 78,728 | 50,000 |
| 2026-10-26 | 43,605 with four hours left | 50,000 |

- **Reads** come in bursts of 1,000–5,700 per 15 minutes that line up with
  scheduled jobs and deploys (see `firebase-free-tier` notes and PR #171), plus
  map visits: each `/map` load reads up to 60 incidents for the live listener
  and a few small samples.
- **Writes** are small: most 15-minute windows hold 1–20 writes (page views and
  product events); the 400–900 bursts are ingest jobs. Nowhere near 20,000 a day.
- **Single-document reads** (`LOOKUP` in the usage output) run about 18–20 an
  hour outside job bursts, so even if every one were a rule `get()` they would
  be under 500 a day. Nearly all reads are `QUERY`.

## The outside audit, claim by claim

1. **Rules `get()`/`exists()` multiply reads.** True in principle, small here.
   A rule lookup is billed once per document per request (or when a listener
   starts), never per returned row. The only lookup on hot paths was
   `isAdmin()` reading `users/{uid}`, which every signed-in non-admin paid when
   it ran first in an `||`. Rules now put it last (`owner || isAdmin()`), so a
   public incident query or a member reading their own rows never touches the
   users document. The unsubscribe-token and claim lookups run on rare writes.
2. **Listener spikes multiply rules costs.** Rule evaluations are not billed;
   only document reads are. A live listener costs one read per changed document
   it receives. The October 15 audit measured 25 peak listeners and six
   connections. The report now prints peak listeners and connections per day.
3. **Move `page_views`/`product_events` to GA4.** Not worth it for cost:
   13,431 page views and 387 product events in total since April, roughly 70
   writes a day against a 20,000-a-day free tier. GA4 would also break the
   privacy page, which says the per-view event "is not shared with anyone" and
   carries no advertising identifier, and the admin Visitors and Overview
   panels read these collections directly. Keep them in Firestore.

## Alerts to set up

Create these in Google Cloud console → Monitoring → Alerting → Create policy,
project `calgary-map-e70bb`, notification channel = email.

| Alert | Metric | Condition | Why |
| --- | --- | --- | --- |
| Runaway reads | `firestore.googleapis.com/document/read_count` | sum over 1 h > 12,000 | Worst normal hour is about 8,500; a loop or a full collection scan shows up within the hour |
| Write burst | `firestore.googleapis.com/document/write_count` | sum over 1 h > 3,000 | Ingest peaks near 1,100 an hour; anything bigger is a job rewriting everything |
| Rules denials | `firestore.googleapis.com/rules/evaluation_count`, `result = DENY` | sum over 15 min > 200 (tune from the report's daily baseline) | A deploy that breaks a client query shows as a wall of denials and an empty map |
| Listener pile-up | `firestore.googleapis.com/network/snapshot_listeners` | max > 300 for 10 min | 12× the measured peak; catches a listener leak in the app |
| Connection pile-up | `firestore.googleapis.com/network/active_connections` | max > 300 for 10 min | Same, for tabs that never close their connection |

Also set a **billing budget** (Billing → Budgets & alerts) of $5 a month with
email at 50%, 90% and 100%. It is the only alert that also covers Hosting
downloads and Storage, which were over the free tier on October 25.
