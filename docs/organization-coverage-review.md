# Organization coverage review

Reviewed against the repository snapshot on 2026-10-16. Live official pages and production accounts could not be accessed from this environment. Counts represent linked records, including past or cancelled records; they do not establish a complete current programme.

| Organization | Linked records | Official source |
| --- | ---: | --- |
| Calgary Chinese Cultural Centre | 0 | [Official page](https://www.culturalcentre.ca/), [Official page](https://www.culturalcentre.ca/programs), [Official page](https://www.culturalcentre.ca/events) |
| Rosso Coffee Roasters — Inglewood | 0 | [Official page](https://rossocoffeeroasters.com/) |
| Vertigo Theatre | 6 | [Official page](https://www.vertigotheatre.com/), [Official page](https://purchase.vertigotheatre.com/Events?attribute_EventType=2627Season) |
| Higher Ground Café — Kensington | 0 | [Official page](https://highergroundcafe.ca/) |
| cSPACE Marda Loop Creative Hub | 0 | [Official page](https://cspaceprojects.com/) |
| Luke’s Drug Mart — Bridgeland | 0 | [Official page](https://lukesdrugmart.com/) |
| Wilder Institute’s Calgary Zoo | 2 | [Official page](https://www.calgaryzoo.com/) |
| Downstage | 4 | [Official page](https://downstage.ca/), [Official page](https://downstage.ca/currentseason/) |
| Ghost River Theatre | 0 | [Official page](https://www.ghostrivertheatre.com/#grt), [Official page](https://www.ghostrivertheatre.com/202627experiences) |
| Theatre Calgary | 1 | [Official page](https://www.theatrecalgary.com/) |
| Alliance Française de Calgary | 0 | [Official page](https://www.afcalgary.ca/) |
| Werklund Centre | 0 | [Official page](https://www.werklundcentre.ca/) |
| Inglewood Business Improvement Area | 1 | [Official page](https://www.inglewoodyyc.ca/) |
| Dalhousie Community Association | 1 | [Official page](https://www.dalhousiecalgary.ca/farmersmarket-harvest/) |

## Confirmed relationship repairs

- Added Inglewood Business Improvement Area as an organization. Mercantile on 9th belongs to Inglewood BIA; the event name is not a separate company.
- Added Dalhousie Community Association as an organization, with its Harvest Farmers’ Market relationship.
- Organization matching requires both an exact organizer alias and an official source domain. Venue tenancy never grants ownership.

## Dates requiring further research

- Downstage: retain the reviewed Creative Stretch, Dreaming Climate Consciousness and season coverage. The supplied email gives no upcoming From Scratch dates; do not invent them.
- Organizations with zero linked records need an official programme check. Zero records does not prove that they have no events.
- No additional event dates have been claimed as researched live or published during this review.

## Production roster audit

Run `node --import tsx scripts/claims/organization-coverage.ts --production` with the existing Firebase service account in the secure deployment environment. This reads Business accounts and approved claims once and reports which accounts have confirmed organization authority versus only specific listing access. It does not modify accounts, approve claims or send email.

Local inventory report: `node --import tsx scripts/claims/organization-coverage.ts`.
