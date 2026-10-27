# Profiles from empty searches

Admin → Search opportunities lists every term whose latest search found nothing.
Aldo's rule (Oct 27 2026): **when a term is a real organization, confirmed, in
Calgary, and it has no profile yet, add one.** Everything else gets fixed in
search, or left alone.

## 1. Sort the terms

Paste the panel (or type the terms) into:

```
npm run search:gaps -- madigan altafor "herringer kiss gallery"
pbpaste | npm run search:gaps
```

Each term comes back as `answered` (a community, a street, a time, or a listing
search finds today) or `CHECK`. Only `CHECK` terms need a person. The admin
panel shows the same thing: an "Answered now" line, or a "Look it up" link.

## 2. Decide what a CHECK term is

| It is… | Do this |
| --- | --- |
| A street ("madigan") | Nothing. Search tries a lone word against the City's address register and shows the street when it's there. |
| A typo of a community ("altafor") | Add an alias in `src/data/calgaryCommunities.ts`, or check that the typo rule in `searchIntent.ts` catches it. |
| An abbreviation of something we list ("atp") | Add it to `ABBREVIATIONS` in `src/lib/listingSearch.ts`. |
| A landmark that isn't an organization page ("westside") | Add it to `LANDMARKS` in `src/lib/searchIntent.ts`. |
| **A real organization in Calgary with no profile** | **Add a profile (step 3).** |
| A person, a chain with no Calgary location, a place outside city limits (Airdrie, Cochrane, Chestermere, Okotoks), or something we can't confirm | Leave it. Don't make a profile. |

"Confirmed" means its **own official website** (not a directory, review site or
social post alone) names the organization exactly and gives a Calgary street
address or says it operates in Calgary. If the official site can't be reached,
wait; don't build the profile from third-party pages.

## 3. Add the profile

Add a `business` entity to `src/content/editorial-inventory.json`, shaped like
`biz-the-plaza-theatre`:

- `id` is `biz-{slug}`; `claimed`, `partner` and `editorialSelection` are `false`.
- `address` includes "Calgary"; `neighbourhood` is the bundled community it sits in.
- `tags` include `organization` and `search-gap`.
- `sources` has at least one `"kind": "official"` https link, each with the real `retrievedAt`.
- `verification` is `source-checked`, and `verifiedAt` is the real current time
  (a future time hides the record).
- Copy is factual: what it is, where, and what the official site says it does.
  No images without permission; no socials you haven't confirmed.

`tests/search-gap-profiles.test.ts` enforces the list above for anything tagged
`search-gap`. Then regenerate the index (`npm run discovery:preview`) and check
that `/search?q=<the term>` lands on the new profile.

The 3-events rule for automatic organizer profiles (`feedOrganizerProfiles`) is
unchanged; this is the curated path for organizers people are already looking for.
