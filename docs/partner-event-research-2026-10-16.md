# Partner event research — 2026-10-16

## Result and scope

All 21 official URLs attempted across the 14 repository business profiles were blocked by the environment proxy (`CONNECT tunnel failed, response 403`). This is an access failure, not evidence that the organizations have no events. No live pages were retrieved and no new event dates were added.

The checked-in profiles have no partner/approval stamps. The actual production partner roster cannot be confirmed without Firebase access; this review therefore covers all repository business profiles rather than claiming they are all confirmed partners.

## Existing inventory and official pages

Counts below are existing stored upcoming events, not newly researched or newly published events. Markets are counted separately from individual event listings.

| Organization | Existing upcoming events | Linked markets | Official pages attempted |
| --- | ---: | ---: | --- |
| [Calgary Chinese Cultural Centre](https://calgarywatch.ca/local/calgary-chinese-cultural-centre) | 0 | 0 | [Official page](https://www.culturalcentre.ca/) — blocked, [Official page](https://www.culturalcentre.ca/programs) — blocked, [Official page](https://www.culturalcentre.ca/events) — blocked |
| [Rosso Coffee Roasters — Inglewood](https://calgarywatch.ca/local/rosso-coffee-roasters-inglewood) | 0 | 0 | [Official page](https://rossocoffeeroasters.com/) — blocked |
| [Vertigo Theatre](https://calgarywatch.ca/local/vertigo-theatre) | 6 | 0 | [Official page](https://www.vertigotheatre.com/) — blocked, [Official page](https://purchase.vertigotheatre.com/Events?attribute_EventType=2627Season) — blocked |
| [Higher Ground Café — Kensington](https://calgarywatch.ca/local/higher-ground-cafe-kensington) | 0 | 0 | [Official page](https://highergroundcafe.ca/) — blocked |
| [cSPACE Marda Loop Creative Hub](https://calgarywatch.ca/local/cspace-marda-loop-creative-hub) | 0 | 0 | [Official page](https://cspaceprojects.com/) — blocked |
| [Luke’s Drug Mart — Bridgeland](https://calgarywatch.ca/local/lukes-drug-mart-bridgeland) | 0 | 0 | [Official page](https://lukesdrugmart.com/) — blocked |
| [Wilder Institute’s Calgary Zoo](https://calgarywatch.ca/local/wilder-institutes-calgary-zoo) | 2 | 0 | [Official page](https://www.calgaryzoo.com/) — blocked |
| [Downstage](https://calgarywatch.ca/local/downstage) | 4 | 0 | [Official page](https://downstage.ca/) — blocked, [Official page](https://downstage.ca/currentseason/) — blocked |
| [Ghost River Theatre](https://calgarywatch.ca/local/ghost-river-theatre) | 0 | 0 | [Official page](https://www.ghostrivertheatre.com/) — blocked, [Official page](https://www.ghostrivertheatre.com/#grt) — blocked, [Official page](https://www.ghostrivertheatre.com/202627experiences) — blocked |
| [Theatre Calgary](https://calgarywatch.ca/local/theatre-calgary) | 1 | 0 | [Official page](https://www.theatrecalgary.com/) — blocked |
| [Alliance Française de Calgary](https://calgarywatch.ca/local/alliance-francaise-calgary) | 0 | 0 | [Official page](https://www.afcalgary.ca/) — blocked |
| [Werklund Centre](https://calgarywatch.ca/local/werklund-centre) | 0 | 0 | [Official page](https://www.werklundcentre.ca/) — blocked |
| [Inglewood Business Improvement Area](https://calgarywatch.ca/local/inglewood-bia) | 1 | 0 | [Official page](https://www.inglewoodyyc.ca/) — blocked |
| [Dalhousie Community Association](https://calgarywatch.ca/local/dalhousie-community-association) | 0 | 1 | [Official page](https://www.dalhousiecalgary.ca/) — blocked, [Official page](https://www.dalhousiecalgary.ca/farmersmarket-harvest/) — blocked |

## Access needed to finish

1. In this cloud environment’s network settings, permit access to the official site hosts below, preserving existing destinations. All observed failures came from the proxy before reaching the sites.
2. Make the existing production Firebase service-account credential available securely as `FIREBASE_SERVICE_ACCOUNT` in environment settings, or provide a working equivalent production ADC binding. The current variable is absent and the available ADC file does not contain usable credential metadata. Do not put credential contents in chat.
3. Once access is available, query the actual approved partner roster, inspect official programme/season pages and individual event pages, compare against the existing inventory, and publish only missing confirmed events with the exact organizer association.

Required official-site hosts:

- `cspaceprojects.com`
- `downstage.ca`
- `highergroundcafe.ca`
- `lukesdrugmart.com`
- `purchase.vertigotheatre.com`
- `rossocoffeeroasters.com`
- `www.afcalgary.ca`
- `www.calgaryzoo.com`
- `www.culturalcentre.ca`
- `www.dalhousiecalgary.ca`
- `www.ghostrivertheatre.com`
- `www.inglewoodyyc.ca`
- `www.theatrecalgary.com`
- `www.vertigotheatre.com`
- `www.werklundcentre.ca`

No organization with a blocked site has been marked as having no upcoming events. Existing event verification timestamps, ownership grants, images and weekly submission allowances were left unchanged.
