# Emails, plans and badges: every case

One page for how sign-up, the two weekly emails, "I'm going", badges and
event suggestions work, what each person sees, what admin sees, and what is
stored. Code references are the source of truth; this explains them.

## The two emails

| | Monday: neighbourhood recap | Thursday: event picks |
|---|---|---|
| What | Public safety reports within a 15-minute walk, 3 km and 10 km of home (police news, 311, outages, neighbours) | Up to 8 events and market dates for the next 10 days matching the reader's interests, near home first, plus reminders for what they said they're going to |
| Sender | `scripts/digest/weekly.ts` | `scripts/digest/events.ts` |
| Workflow | `weekly-digest.yml`, Mondays 15:00 UTC (09:00 Calgary) | `events-digest.yml`, Thursdays 14:00 UTC (08:00 Calgary) |
| Opt-in fields | `weeklyDigestOptIn`, `weeklyDigestOptInAt` | `eventsDigestOptIn`, `eventsDigestOptInAt` |
| First email | Welcome letter (`digestWelcomeSentAt` set after it's delivered) | Picks with a short hello (`eventsWelcomeSentAt`) |
| Ledger | `digest_sends/{uid}_{week}` | `events_digest_sends/{uid}_{week}` (records `mode`, `first`) |
| Unsubscribe queue | `digest_unsubscribes/{uid}` | `events_digest_unsubscribes/{uid}` |
| Unsubscribe link | `/unsubscribe?uid&t` | `/unsubscribe?uid&t&list=events` |

Both share one per-account secret (`digestUnsubToken`), the Resend sender,
the CASL footer, `DIGEST_ALLOWLIST` (while set, nobody else can be mailed),
`DIGEST_LIMIT`, and the dry-run/test inputs on manual runs. Alberta is on
UTC-6 all year from 2026, so neither cron drifts with the seasons.

## Every person, every case

**Where people sign up.** One place: `/plans` ("Your CalgaryWatch"). Every
Subscribe / Sign up / Monday-email link on the site goes there, pre-ticking
the email the link was about (`?email=monday`, `?email=thursday`,
`?interests=music,arts`). The live map's own settings still write the same
fields and link to `/plans`.

**The form.** 01 home area (neighbourhood, or a street address that is
matched to its official community) → 02 the two emails as tick-cards →
03 interests. Rules: an area is always required; interests are required only
if Thursday is ticked. Signed-out visitors can fill everything in first; it
saves after Google sign-in. Saving also completes the live map's onboarding
so nobody is asked twice.

| Person wants | What they tick | Mondays | Thursdays | Offers they see |
|---|---|---|---|---|
| Crime/safety and events | both | Monday brief | Thursday picks | none |
| Crime/safety only | Monday | Monday brief | — | Thursday offer at the bottom of each Monday email; "Add Thursday" on `/plans`; one-tap Thursday offer on event pages |
| Events only | Thursday | — | Thursday picks | Monday offer at the bottom of each Thursday email; "Add Monday" on `/plans` |
| Neither (account, plans, badges) | neither | — | — | both offers on `/plans`; Thursday offer on event pages |

**Monday cases** (unchanged behaviour, now reachable from `/plans`)
- First Monday: the welcome letter. Later: the weekly brief.
- Street address: distances to each report. Neighbourhood only: area-level.
  No area at all: a city-wide brief with a prompt to add one.
- Quiet week: says so, rather than padding.

**Thursday cases** (`eventsEmailMode` in `src/lib/eventsDigest.ts`)

| Mode | When | What the email says | Preview file |
|---|---|---|---|
| `picks` | at least one listing matches their interests | "Chosen for live music, arts…" then the picks by date | `thursday.html` |
| `picks` + first | their first Thursday email | short hello, then picks; subject "Your first Thursday picks: N things…" | `thursday-first.html` |
| `fallback` | nothing matches their interests | "Nothing … matches your interests … here's what else is on" + up to 5 listings | `thursday-fallback.html` |
| `going-only` | nothing new, but they're going to something | "here's your reminder" | `thursday-going-only.html` |
| `skip` | nothing on at all, nothing planned | **no email**; the week is released so a re-run can send | — |
| no home area | any mode | no distances, plus "Tell us your neighbourhood…" | `thursday-no-area.html` |

"You're going" reminders always come first. A going event is never also
listed as a pick. A nightly series (same title) appears once, at its soonest
date. Interests match categories, tags and words in the title and summary,
so "Music" finds the symphony even when a feed only tagged it "arts".

**Changing their mind**
- Untick on `/plans` → that list's opt-in clears, `…UnsubscribedAt` and
  source `plans-page` are recorded; the other list is untouched.
- Email unsubscribe link → a request is filed (token-checked by rules); the
  next run for that list honours it before choosing recipients. If they opt
  back in after filing it, the newer consent wins.
- Re-subscribing records a fresh consent date.
- Unsubscribed by link but the run hasn't happened yet: `/plans` already
  shows that email unticked, with a note. If the person clicking the link is
  signed in as that account, it is switched off on the profile immediately.
- Street address but no neighbourhood name: picks still rank by distance
  (the address resolves to a point), and no "add your area" prompt is shown.

## "I'm going" and badges

- `event_rsvps/{uid}_{eventId}`: private, owner-only. `event_rsvp_counts/{eventId}`:
  public number only. Both are written in one batch; the rules allow the count
  to move by exactly one, in step with the caller's own RSVP (emulator-tested).
- Signed out: tapping "I'm going" signs in, then records the RSVP.
- Badges (`src/lib/badges.ts`): Founding neighbour, Neighbour, Tuned in (3+
  interests), On the list (Thursday), Monday reader, First plans, Regular
  (5 plans), All-rounder (3 kinds of plans), Event scout (shared a listing),
  Eyes on the street (one public report, no higher tier on purpose). A
  "Badge earned" toast appears the moment one is won.

## Event suggestions

`/submit` → the `submitDiscovery` Cloud Function when deployed, otherwise a
direct write to `entity_submissions/{uid}_{YYYY-MM-DD}_{1-5}` (five per
person per Calgary day, pending only, never editable by the submitter).
Admin approves or rejects in Events & markets; without the Cloud Function the
decision is queued in `discovery_actions` and `discovery-actions.yml` applies
it hourly with the same validation, then republishes the site.

## What admin sees

- **Members & plans**: account counts, Monday and Thursday subscribers, home
  areas, interest mix, most-planned events, newest members and their emails.
- **Email planner → Thursday picks**: both / Monday only / Thursday only /
  neither; who will get Thursday's email and why anyone won't; first emails;
  missing areas; pending opt-outs; this week's run by mode; a preview of
  every case for both emails.
- **People**: Monday and Thursday panels per person (status, consent date,
  first email, interests, opt-out source).
- **Events & markets**: resident suggestions first, listings by status, the
  queued-change history.
- **Search demand**: anonymous searches, and what people looked for but
  didn't find.

## Admin and the read quota

Firestore's free plan allows 50,000 reads a day, and every scheduled job
shares it with the site. Admin is built to stay small:
- The report archive and the account directory are read **once per browser
  tab** and shared between /admin, /admin/incidents and /admin/users. A live
  window on the newest 150 reports keeps the desk current; moderation edits
  update the screen without a re-read; **Refresh** re-reads on demand.
- Totals (accounts, subscribers, pending suggestions, opt-outs) are
  server-side counts: one read per thousand documents.
- Page views are re-read every five minutes, not streamed per visit.
- Every admin query uses single-field filters, so no composite index has to
  be deployed (the rules-only backend release doesn't create indexes).

**What appears on the Watch desk:** flagged reports, unreviewed reports,
failing feeds, resident event suggestions, moderation the hourly job couldn't
apply, and moderation queued for over two hours (the job may not be running).
Each has an action or an Open button; Events & markets carries the same count.

## Data model (Firestore)

| Collection | Written by | Read by | Holds |
|---|---|---|---|
| `users/{uid}` | owner (`/plans`, map settings); senders (welcome stamps, tokens, unsubscribes) | owner, admin | identity, `neighborhood` / `address` / `inferredNeighborhood`, `piiConsentAt`, both lists' opt-in fields, `eventInterests`, `digestUnsubToken`, `digestWelcomeSentAt`, `eventsWelcomeSentAt` |
| `digest_sends`, `events_digest_sends` | senders (Admin SDK) | admin (Thursday) | one row per person per week |
| `digest_unsubscribes`, `events_digest_unsubscribes` | anyone with the link's token | owner, admin | opt-out requests; stamped, never deleted |
| `event_rsvps` | owner | owner, admin | `uid`, `eventId`, `start`, `createdAt` |
| `event_rsvp_counts` | owner, in step with an RSVP | public | `count`, `updatedAt` |
| `entity_submissions` | submitter (direct path) or the callable | submitter, admin | a suggested event or market |
| `discovery_actions` | admin | admin | queued moderation, then `applied`/`failed` |
| `search_demand` | anyone | admin | `q`, `results`, `ts` (no identity) |
| `live_data/pulse` | ingest job | public | the homepage "right now" summary (1 read per visit) |

## Before going live

1. Merge to `main`.
2. Deploy Firebase Backend → `rules` (new collections are refused until then).
3. Run **Thursday Event Picks** manually (dry run is the default) and read the
   log: each person shows their mode and whether it's their first email.
4. Keep `DIGEST_ALLOWLIST` set until the dry runs look right.

## When something goes wrong

- Firestore daily quota exhausted: jobs log a warning and exit cleanly; the
  next run catches up. No failure email.
- No inventory for a reader's window: they are skipped, not sent an empty email.
- A send fails at Resend: the week's claim is released and the next run retries.
- Dry runs and blocked (allowlist) sends release their claim, so Thursday's
  real run still sends.
