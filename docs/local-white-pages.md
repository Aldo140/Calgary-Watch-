# The Calgary White Pages

How /local's directory works, why it is shaped like a phone book, and how it
makes money without selling what people trust it for.

## The idea in one line

Remember looking a plumber up in the phone book? CalgaryWatch is that, just
better: every name is checked against the business's own site, filed by what
they do and where they are, and the best ones arrive because a Calgarian
recommended them. Recommending is free. Being listed is free. Trust is never
for sale; attention around it is.

## What's built (this PR)

| Piece | Where | What it does |
|---|---|---|
| White Pages directory | `src/components/discovery/WhitePages.tsx` | Replaces the "little black book" swipe. Sections (Services, Food & drink, Shops, Arts & theatre, Markets & makers, Out & about), A–Z entries with dotted leaders, call / website / directions on each, sticky search and section tabs, four per section on first view with "See all". |
| Open lines | same file, `OpenLines` | Every trade we haven't filled is printed as an empty line with "Recommend one". Busy-season trades go first. The gap in the book is the ask. |
| Recommend a business | `/local/recommend`, `src/pages/RecommendPage.tsx` | Six short fields, prefilled from `?service=` or `?name=`. Sign-in on send (spam guard), five a day per account. |
| Recommendation inbox | Admin → Local partners → Neighbour recommendations | Invite to claim (creates a `partner_leads` doc so outreach picks it up, quoting the neighbour's reason), Listed, or Decline. |
| Calmer calendar | `/local/services` | Phones see three cards (book now, next month, coming up). The twelve-month grid is folded behind "See the whole year" and open by default on desktop. |
| Rules | `firestore.rules`, `local_recommendations` | Create-only for the sender with field and length checks; admins update status. **Needs a rules deploy** ("Deploy Firebase Backend", target rules) before the form can save. |

## The customer flow

```
Resident needs a plumber
  → searches "plumber calgary" / taps Services
  → White Pages: listed names, or an open line
      ├─ listed: call / site / directions (we count the tap)
      └─ empty: "Recommend one" → /local/recommend
Resident who had a great experience
  → recommends (free) → admin checks against the business's own site
  → Invite to claim → outreach email: "A Calgarian recommended you"
  → business claims (free) → Verified + business account
  → business sees what we send them → buys attention (paid, labelled)
```

Two loops feed each other: residents fill the book, and every filled line
gives a business a warm, true reason to claim. A cold email says "list with
us". Ours says "your customer sent us". That is the cheapest acquisition
channel a directory can have.

## Where the money is (CFO view)

The rule that protects everything else: **rank and recommendations are never
sold**. "Our pick", "Verified" and neighbour credit are earned. Anything paid
says "Featured partner" (or its own label) and sits apart. Break this once and
the book is worth nothing.

Revenue ladder, cheapest to most valuable. Prices are starting hypotheses to
test, not commitments, and nothing here is promised in outreach until it's
live (see `scripts/ops/lib/claimFacts.ts`).

1. **Free listing** — $0. Costs us a source check. Value: inventory, SEO pages,
   a reason to claim.
2. **Claimed / Verified** — $0. The business keeps its own hours, photos and
   offer up to date (less work for us) and gets a business account. This is
   the funnel step every paid product sells to.
3. **Featured partner** — exists today. Top of its section, labelled, same
   storefront. Hypothesis: $49–99/month per section.
4. **Season sponsor** ("Book before the rush") — one labelled slot per trade
   on the "Book now" card in that trade's busy months (furnaces in Sept–Nov,
   snow removal Oct–Apr, tires Oct/Apr). Sold by the season, which is how
   trades budget. Hypothesis: $150–300 per trade per season; 18 trades × ~2
   seasons is a small, finite, sell-out-able inventory.
5. **Leads, not clicks** — later. "Ask for a quote" on a verified trade's
   entry, routed by email. Charged per qualified request ($5–15) or bundled
   into the season slot. Only after we can measure taps honestly.
6. **The Thursday email** — a "Neighbour-recommended" line in the weekly
   picks, sponsor-labelled. Uses an audience we already have.

Rough shape at modest scale (assumptions, to be replaced with data): 40
claimed businesses → 10% featured at $69/mo ≈ $3.3k/yr; 18 trades × 2
seasons × 50% sold × $200 ≈ $3.6k/yr. Small, but almost no marginal cost,
and every number grows with listings, which residents fill for free.

## What to measure

- Recommendations per week, and % that pass the source check.
- Open lines filled (trades with ≥1 listing / 18).
- Directory taps per entry (call, website, directions). This is the number a
  business will pay for; start logging it before selling anything on it.
- Recommendation → claim conversion, and claim → paid.
- Search queries that hit an open line ("plumber", "furnace") — demand we
  can show a business in the outreach email.

## Next steps (not in this PR)

- Show "Recommended by a neighbour" (and the credit name, when given) on a
  listing once a recommendation is marked Listed.
- Log entry taps (call / website / directions) into the existing visitor
  analytics, per entity.
- Add recommendation-sourced wording to claimFacts so outreach can say
  "a Calgarian recommended you" only when it's true.
- Price test Featured partner and the season slot with the first five claimed
  trades before publishing any price.
