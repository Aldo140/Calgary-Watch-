# Profile expansion and scouting — October 16, 2026

## Implementation

Eight organization profiles have been added from existing stored official-source records. This is profile completion and relationship repair, not newly verified live research. No new event dates or market occurrences were invented or added. All existing event/market IDs, images and source timestamps were preserved; no ownership, partner status or account access was granted.

| Organization | Upcoming linked event records | Market locations | Profile | Claim entry |
| --- | ---: | ---: | --- | --- |
| Heritage Park Historical Village | 21 | 0 | [/local/heritage-park](https://calgarywatch.ca/local/heritage-park) | [Claim](https://calgarywatch.ca/claim/biz-heritage-park) |
| The Confluence Historic Site & Parkland | 25 | 0 | [/local/the-confluence](https://calgarywatch.ca/local/the-confluence) | [Claim](https://calgarywatch.ca/claim/biz-the-confluence) |
| Contemporary Calgary | 18 | 0 | [/local/contemporary-calgary](https://calgarywatch.ca/local/contemporary-calgary) | [Claim](https://calgarywatch.ca/claim/biz-contemporary-calgary) |
| Calgary Opera | 3 | 0 | [/local/calgary-opera](https://calgarywatch.ca/local/calgary-opera) | [Claim](https://calgarywatch.ca/claim/biz-calgary-opera) |
| Wordfest | 2 | 0 | [/local/wordfest](https://calgarywatch.ca/local/wordfest) | [Claim](https://calgarywatch.ca/claim/biz-wordfest) |
| Alberta Ballet | 1 | 0 | [/local/alberta-ballet](https://calgarywatch.ca/local/alberta-ballet) | [Claim](https://calgarywatch.ca/claim/biz-alberta-ballet) |
| Calgary Farmers' Market | 0 | 2 | [/local/calgary-farmers-market](https://calgarywatch.ca/local/calgary-farmers-market) | [Claim](https://calgarywatch.ca/claim/biz-calgary-farmers-market) |
| Calgary Earth Market Society | 0 | 1 | [/local/calgary-earth-market-society](https://calgarywatch.ca/local/calgary-earth-market-society) | [Claim](https://calgarywatch.ca/claim/biz-calgary-earth-market-society) |

Counts are stored event records, including repeat performances and exhibition runs; they are not counts of distinct experiences. Links above are intended public routes after deployment, not verified live pages.

Market organizer profiles now show their exact market locations with the next uncancelled stored market date, location address and link to the separate location calendar. Calgary Farmers’ Market South and West keep independent schedules. Calgary Earth Market Society owns the cSPACE market relationship; cSPACE does not receive ownership by being its venue.

## New prospects

[16 additional research candidates](2026-10-16-new-prospects.json): eight market/community prospects, three distinctive business prospects and five major festival/convention prospects. These supplement the earlier [48-item worklist](2026-q4-opportunities.json). Candidate names are suggestions to investigate, not evidence of current operation, an upcoming edition, partnership or permission to use images. No invented domains, dates or contacts were supplied. None was added to automated outreach or the approved feed registry.

Prioritize independent maker markets and community markets for local breadth. For major event research, start with the next officially announced Comic Expo, Auto and Truck Show, High Performance Rodeo, Block Heater and Underground Film Festival editions. These may be 2027 planning opportunities; do not infer a remaining-2026 date.

## Live research blocker

The official Spruce Meadows Christmas Market URL was retried using network escalation. The proxy returned `CONNECT tunnel failed, response 403` before fetching the site. No official-source browser/search connector is available in this session. The earlier research report documents the same failure across other organizer sites. This is not evidence that any candidate lacks upcoming events.

To finish live scouting, this environment needs outbound access to organizer websites (preserving existing network configuration), or an enabled web research connector. Then verify each actual event page: current edition, dates and times, Calgary or clearly labelled regional location, responsible organizer, admission and cancellations. Only then populate new public events/market days and profile details. Do not substitute annual-date guesses or venue ownership.

## Validation

Validation: all 1,200 individual assertions across 101 test files passed, including four new profile/market regressions. The safe offline discovery export passed without production credentials. Existing entity IDs, market occurrence IDs and artwork were compared with HEAD and preserved. Actual React server rendering passed for the two market locations with independent addresses and next dates, and the ATP/Werklund event lists. The final production build/prerender passed and generated 666 pages; static email previews were generated without sending messages. TypeScript validation (`npm run lint`) passed. The user subsequently authorized committing and pushing these changes to main, which triggers the existing Hosting deployment workflow. Deployment completion and live route verification remain unverified. No emails, claim approvals or direct production database writes were performed.
