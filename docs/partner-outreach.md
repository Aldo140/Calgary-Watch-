# CalgaryWatch launch partners

This list starts with organizations whose recurring schedules are already represented from their official websites. Partnership status stays separate from editorial inclusion: a listing can be source-checked without being sponsored, and any future paid placement must be labelled.

| Organization | Contact | Why it fits | Listing source | Status |
| --- | --- | --- | --- | --- |
| Calgary Farmers' Market | info@calgaryfarmersmarket.ca | Two year-round markets, more than 100 local vendors, strong family and food discovery fit | https://calgaryfarmersmarket.ca/ | Replied 2026-10-07: link switched to homepage at their request |
| Crossroads Market | info@crossroadsmarket.ca | Year-round Friday-to-Sunday schedule and a large mix of local food and independent vendors | https://www.crossroadsmarket.ca/ | Draft prepared |
| Farmers & Makers Market / Calgary Earth Market Society | farmersmakersmarket@gmail.com | Nonprofit weekly market with a direct community and local-business mission | https://www.farmersmakersmarket.ca/ | Draft prepared |
| Hillhurst Sunnyside Farmers' Market | Official contact form | Year-round community-association market and inner-city neighbourhood anchor | https://farmersmarket.hsca.ca/ | Research contact |
| Bridgeland-Riverside Farmers' Market | Official contact form | Seasonal weekly market with vendors, music and neighbourhood programming | https://bridgelandfm.ca/location-hours | Research contact |

## Initial offer

- A free source-checked listing linked to the organizer's official page.
- A direct line for schedule corrections, cancellations and approved imagery.
- Inclusion in relevant weekly CalgaryWatch discovery briefs when the dates fit.
- Optional cross-promotion experiments measured with aggregate traffic only.
- Any later sponsorship is labelled and does not buy editorial selection.

## Outreach message

**Subject:** CalgaryWatch has added your official market schedule

Hello [team name],

I’m Aldo Ortiz, founder of CalgaryWatch. We are building a free Calgary discovery and live-city guide that helps residents find real events, recurring markets and neighbourhood updates with visible dates and sources.

We added [market name] using the schedule on your official website and link every listing back to that source. I would love to make sure the details are right and explore a simple launch partnership: you send us schedule changes or approved highlights, and CalgaryWatch helps more Calgarians discover the market and its vendors.

There is no fee for an accurate source-checked listing. If we ever discuss paid promotion, it will be clearly labelled and kept separate from editorial selection.

Would you be open to a short conversation? I can send the listing for review first.

Thank you,

Aldo Ortiz  
Founder, CalgaryWatch  
aldo@calgarywatch.ca  
https://calgarywatch.ca


## Claimed listings

Partner replies kept asking for the same things, so organizers now get a self-serve route:

| Reply (Oct 2026) | What they asked for | Where it lands now |
| --- | --- | --- |
| Vertigo Theatre | "a direct line to update our listings", happy to "fill out a form and add production photos" | Claim the listing, then send dates and photos from the claim page |
| Alberta Ballet | Venue is the Jubilee Auditorium, not "in Banff Trail" | A claimed organizer files a location change |
| Dalhousie Community Association | Replace our image | Photo change from the claim page |
| Calgary Farmers' Market | Link to the homepage; we also have a West location | Link change and an extra location |
| Farmers & Makers Market | STOP | Suppressed automatically; never contacted again |

**How it works**

1. Every event, market and business listing ends with "Is this yours? Claim this listing" (`/claim/:entityId`).
2. The organizer registers with Google, then gives their name, role, work email, an optional phone number and anything to fix straight away.
3. Admin sees the claim under **Local partners → Claimed listings**, with evidence recomputed from the listing's own site:
   - A Google account at the organization's domain is the strongest evidence.
   - A matching work email needs a one-click "Confirm by email" first.
   - A personal or other-domain address needs checking through the organization's published contact details.
4. On approval:
   - The listing shows **Managed by the organizer** (`verified_listings/{entityId}`).
   - The partner lead moves to `claimed`, so outreach stops.
   - The claim page becomes the organizer's direct line, with change types for dates and hours, location, link, photo, description, cancelled and other.
5. Changes queue in the same admin panel. Make the edit in Events & markets, then mark it applied. The organizer sees the status on their claim page.

Every outreach email, follow-up and drafted reply to a listed organization now ends with the claim link, placed just above the signature (`withClaimLink` in `scripts/ops/jobs/outreach.ts`).

Data:
- `listing_claims/{uid}_{entityId}`: written by the claimant, decided by admin.
- `listing_updates/{auto}`: can only be filed under an approved claim.
- `verified_listings/{entityId}`: public read, admin write.

The rules are tested in `tests/claims.test.ts` and against the emulator.

## Market HQ (`/organizer/:marketId`)

Vendor management for market organizers, offered two ways with the same tools:

- **Run it yourself (free).** The market's verified organizer, meaning an approved listing claim, runs it.
- **We run it for you.** Admin can do everything an organizer can. Organizers ask from Market HQ → Plan & sharing, and requests land under **Local partners → Market HQ**, where they also count toward the desk badge.

What's in it:

| Tab | What it does | Public? |
| --- | --- | --- |
| Lineup | Pick a market date, tick who's coming, add a "this week at the market" note, publish | Yes, once published: on the listing ("Who's at the market…") and in event picks and the weekly emails ("14 vendors, including…") |
| Vendors | Roster (name, category, description, links) plus private contact name, email and phone; active and opted-out toggles | Roster yes; contacts never |
| Applications | Public form at `/apply/:marketId` (Google sign-in). Approve adds the vendor and their contact in one write | No |
| Messages | Templates (load-in, weather, cancellation, thank you) to all active vendors or one date's lineup. Sent hourly by `scripts/markets/send-vendor-messages.ts`, one email per vendor, from "<Market> via CalgaryWatch", Reply-To the organizer, CASL footer, opted-out vendors skipped | No |
| Plan & sharing | Self-serve vs managed; copyable application and listing links | n/a |

The landing page for organizers is `/for-markets`. Claimed markets get an "Open Market HQ" card on their claim page.

Data:
- `market_vendors/{marketId}__{slug}`: public.
- `market_vendor_contacts/{same}`: organizer and admin only.
- `market_lineups/{occurrenceId}`: public when `published`.
- `vendor_applications/{auto}`: applicant, organizer and admin.
- `vendor_messages/{auto}`: queued by the organizer, sent by the job.
- `market_service_requests/{uid}_{marketId}`.

The rules have 27 emulator cases and contract tests in `tests/markets.test.ts`. Payments, stall maps and document storage are deliberately not built yet; payments need a server, which the current Firebase plan doesn't include.
