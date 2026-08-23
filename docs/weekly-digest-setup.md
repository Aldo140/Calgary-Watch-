# Weekly digest — setup runbook

Everything in code is done. What remains is five accounts-and-DNS tasks that
can only be performed by a person with the credentials, plus one rehearsal.

Budget: about 45 minutes, most of it waiting for DNS.

---

## What is already built

| Piece | Where |
|---|---|
| Summary logic (selection, rings, week-over-week, consent gate) | `src/lib/digest.ts` |
| HTML + plain-text email | `scripts/digest/render.ts` |
| Resend transport, dry run, test redirect, per-run cap | `scripts/digest/send.ts` |
| The Monday job | `scripts/digest/weekly.ts` |
| Admin contribution planner | `/admin` → Email planner |
| Immediate admin preview function | `functions/index.js` |
| Inline email identity assets | `public/images/email/` (packaged into the function before deploy) |
| Offline preview | `scripts/digest/preview.ts` → `npm run digest:preview` |
| Unsubscribe page | `src/pages/UnsubscribePage.tsx`, route `/unsubscribe` |
| Rules for `digest_sends` / `digest_unsubscribes` | `firestore.rules` |
| Schedule | `.github/workflows/weekly-digest.yml` |
| Tests | `tests/digest.test.ts` |

The weekly sender adds no root npm dependency and calls Resend over `fetch`.
The isolated `functions/` package carries only the Firebase runtime SDKs.

The immediate planner preview uses Cloud Functions and therefore requires the
Firebase project to be on the Blaze plan. The function is capped at three
instances and only runs when an admin submits a planner entry.

Planner publishes are conflict-safe: if another admin changes the same week,
the stale draft cannot overwrite it. Unsaved copy is recovered for the current
browser tab, removals keep the standard brief scheduled, and every publish,
retest, or removal is recorded in the admin audit log. Preview messages are
sent separately to each approved admin so their addresses are not exposed to
one another.

The planner is a constrained editorial studio rather than a raw HTML editor.
Admins can add subheadings, bold emphasis, bullet lists, quotations and secure
links; set inbox preview text, an optional attribution line and one primary call-to-action; reuse a
scheduled edition; and review desktop, mobile and plain-text previews. A live
preflight checks content length, secure links, week selection and revision
freshness before publishing. The same parser drives the subscriber HTML and
plain-text alternative, while the proof function independently escapes and
validates every field.

The email lifecycle deliberately uses three formats with separate purposes:

- **Welcome letter:** sent once to introduce Calgary Watch and explain the
  recurring brief. A weekly planner note never appears here.
- **Weekly brief:** the recurring personalized Monday email. The planner can
  add a neighbour note, news brief, or personal story before its automated
  location-based content.
- **Admin proof:** a private branded delivery check sent after publishing,
  retesting, or removing a weekly note.

All HTML formats carry the primary Calgary Watch plane logo and live-text
wordmark. The logo travels as an inline CID attachment, so it is not dependent
on a hosted image URL. The function predeploy step packages the same prepared
logo used by the subscriber templates. The shield and Bow emblem remain
secondary artwork with their own roles instead of substituting for the logo.

---

## Step 0 — look at the email first (2 min, no accounts needed)

```bash
npm run digest:preview
open dist-preview/digest.html      # or xdg-open / just open the file
```

Change the copy in `scripts/digest/render.ts` and re-run until it reads right.
Do this before spending any of the setup below.

---

## Step 1 — DNS at Namecheap — **THE REMAINING BLOCKER**

The Resend account exists, the API key works, and `calgarywatch.ca` has been
added to it (id `335d8a9c-ac37-4ff7-a5f9-55fc53b12326`, status `not_started`).
All that is left is pasting four records into Namecheap.

Namecheap → Domain List → `calgarywatch.ca` → **Advanced DNS**.

### First: a decision about Mail Settings

Your **Mail Settings** are currently on **Email Forwarding**, which is why the
root SPF record shows as "Locked by". Namecheap will not accept a new MX record
in that mode, and Resend wants one on the `send` subdomain for bounce handling.

- **If you do not use `@calgarywatch.ca` forwarding** (most likely — your
  contact address is `jorti104@mtroyal.ca`): switch Mail Settings to
  **Custom MX** and add all four records below. This is the clean path.
- **If you do use forwarding**: leave Mail Settings alone and add only the
  three TXT records. Resend will still verify on DKIM, but bounces route
  through Amazon's shared domain instead of yours — slightly worse
  deliverability, and no bounce data of your own. Acceptable to start.

### The records

Namecheap's **Host** column is relative, so type exactly what is in the Host
column below — no `.calgarywatch.ca` suffix.

| # | Type | Host | Value | Priority |
|---|---|---|---|---|
| 1 | TXT Record | `resend._domainkey` | the DKIM key — see `docs/dns-records-calgarywatch.txt` | — |
| 2 | TXT Record | `send` | `v=spf1 include:amazonses.com ~all` | — |
| 3 | MX Record | `send` | `feedback-smtp.us-east-1.amazonses.com` | `10` |
| 4 | TXT Record | `_dmarc` | `v=DMARC1; p=none; rua=mailto:jorti104@mtroyal.ca` | — |

Leave TTL on **Automatic** for all four.

Record 1's value is ~220 characters and must be pasted as one unbroken line
with no spaces or newlines. It is in `docs/dns-records-calgarywatch.txt` so you
can copy it without it wrapping in a terminal.

Record 4 (DMARC) is not from Resend — inbox providers increasingly expect it.
`p=none` means monitor only, which is the right place to start; move to
`p=quarantine` after a few weeks of clean reports.

**None of these conflict with what you already have.** Your existing root SPF,
the two `@` TXT verification records, the `_acme-challenge` record and both A
records are untouched — Resend's SPF lives on the `send` subdomain, not the
root.

### Then check verification

```bash
curl -s -H "Authorization: Bearer $RESEND_API_KEY" \
  https://api.resend.com/domains/335d8a9c-ac37-4ff7-a5f9-55fc53b12326 \
  | grep -o '"status":"[a-z_]*"' | head -1
```

Namecheap usually propagates in under 30 minutes. When it reads `verified`,
flip `DIGEST_FROM` (see step 2) and you can send to real recipients.

## Step 2 — GitHub secrets and variables — **DONE**

Already set on `Aldo140/Calgary-Watch-`:

| Kind | Name | Value |
|---|---|---|
| Secret | `RESEND_API_KEY` | set (verified working) |
| Variable | `DIGEST_SENDER_NAME` | `Calgary Watch` |
| Variable | `DIGEST_MAILING_ADDRESS` | `2011 Ulster Road NW, Calgary, AB` |
| Variable | `DIGEST_SUPPORT_EMAIL` | `jorti104@mtroyal.ca` |
| Variable | `DIGEST_ORIGIN` | `https://calgarywatch.ca` |
| Variable | `DIGEST_LIMIT` | `50` |
| Variable | `DIGEST_FROM` | `Calgary Watch <onboarding@resend.dev>` — **temporary**, see below |

Two follow-ups on those values:

- The **quadrant was inferred**. Ulster Road is NW in Calgary, but the postal
  code is missing and CASL wants a complete address. Fix with:
  ```bash
  gh api -X PATCH repos/Aldo140/Calgary-Watch-/actions/variables/DIGEST_MAILING_ADDRESS \
    -f name=DIGEST_MAILING_ADDRESS -f value='2011 Ulster Road NW, Calgary, AB T2N 4G6'
  ```
- `DIGEST_FROM` currently uses Resend's shared `onboarding@resend.dev` sender.
  That works today but **only delivers to your own Resend account address** —
  fine for rehearsal, useless for real recipients. Switch it after step 1:
  ```bash
  gh api -X PATCH repos/Aldo140/Calgary-Watch-/actions/variables/DIGEST_FROM \
    -f name=DIGEST_FROM -f value='Calgary Watch <digest@calgarywatch.ca>'
  ```

<details><summary>Original instructions, for reference</summary>

### Step 2 (reference) — GitHub secrets and variables

Repo → **Settings → Secrets and variables → Actions**.

**Secrets** tab → New repository secret:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | the key from step 1.6 |

`FIREBASE_SERVICE_ACCOUNT` already exists — the digest reuses it.

**Variables** tab → New repository variable:

| Name | Example | Notes |
|---|---|---|
| `DIGEST_SENDER_NAME` | `Calgary Watch` | Appears in the footer |
| `DIGEST_MAILING_ADDRESS` | `123 Somewhere St SW, Calgary, AB T2P 0A1` | **CASL requires a real one.** See the note below |
| `DIGEST_SUPPORT_EMAIL` | `hello@calgarywatch.ca` | A mailbox somebody reads |
| `DIGEST_FROM` | `Calgary Watch <digest@calgarywatch.ca>` | Domain must match step 1 |
| `DIGEST_ORIGIN` | `https://calgarywatch.ca` | Link base |
| `DIGEST_LIMIT` | `50` | Ceiling per run; raise as the list grows |

</details>

### The mailing address

Canada's Anti-Spam Legislation requires a physical mailing address in every
commercial email — a PO box or a mail-forwarding address is acceptable, a
missing one is not. `scripts/digest/render.ts` refuses to build a message
without it and rejects placeholders, so this cannot be forgotten into
production. If you would rather not publish a home address, a Canada Post PO
box is about $100/year and is the usual answer for small operators.

---

## Step 3 — deploy the function, rules and site (5 min)

The Firebase deployment workflow now installs the isolated `functions/`
package, syncs `RESEND_API_KEY` into Firebase Secret Manager, and deploys the
function, Firestore rules, Storage rules, and site together on pushes to
`main`. Hosting and security rules deploy before the function so an IAM issue
in Secret Manager cannot block an otherwise healthy site release. Confirm the
DNS domain is verified before deploying; planner previews send from
`digest@calgarywatch.ca`.

For a manual deployment, run:

```bash
npx firebase login          # if needed
npm ci --prefix functions
printf '%s' "$RESEND_API_KEY" | npx firebase-tools functions:secrets:set RESEND_API_KEY --data-file -
npx firebase deploy --only functions,firestore:rules,storage,hosting
```

No new Firestore index is needed: the sender's
`visibility == 'public' AND timestamp >= …` query is served by the existing
`visibility ASC, timestamp DESC` composite index.

Verify the page is live before sending anything:
<https://calgarywatch.ca/unsubscribe> — it should say the link did not work,
which is correct with no parameters.

---

## Step 4 — rehearse (10 min)

Three passes, each widening the blast radius. Do not skip to the last.

**Pass 1 — dry run, nobody is mailed.**
GitHub → Actions → *Weekly Digest* → **Run workflow**, leave *dry run* ticked.
Read the log: it should list each profile, say `DRY RUN → …` per recipient,
and end with `sent N, skipped N, failed 0`.

**Pass 2 — real send, redirected to you.**
Run workflow again: untick *dry run*, put your own address in *test email*.
Every message goes to you instead of the real recipient, through the identical
selection, rendering and ledger path. Check it in Gmail **and** on a phone.
Click the unsubscribe link — it should land on the page and confirm.

> Rehearsals leave no trace: any send that did not actually reach the provider
> — a dry run, or a recipient the allowlist refused — releases its ledger claim,
> so the real run is not affected. The claim is still taken first, so the
> ordering that makes duplicates impossible is exercised either way.

**Pass 3 — one real recipient.**
Run workflow with *dry run* off, *test email* blank, and your own account's uid
in *only uid*. Confirm it arrives at your real address.

Then leave the Monday schedule to run itself.

---

## The sender avatar (BIMI) — optional, partly paid

The grey default avatar beside `digest@calgarywatch.ca` is replaced through
**BIMI** (Brand Indicators for Message Identification). The logo is built and
committed at `public/bimi/logo.svg` — SVG Tiny 1.2 Portable/Secure, the strict
profile mail providers require, validated against every constraint.

Two DNS changes turn it on, both free:

1. **Upgrade DMARC to enforcement.** BIMI is ignored at `p=none`. Edit the
   `_dmarc` TXT record at Namecheap to:
   ```
   v=DMARC1; p=quarantine; rua=mailto:jorti104@mtroyal.ca
   ```
   Do this only after a few clean weeks of sending — enforcement tells inbox
   providers to quarantine anything failing alignment, and turning it on before
   your own mail is reliably aligned is how you quarantine yourself.

2. **Add the BIMI record.** New TXT record at Namecheap:
   - Host: `default._bimi`
   - Value: `v=BIMI1; l=https://calgarywatch.ca/bimi/logo.svg;`

   The SVG must be publicly reachable, so this only works after the site is
   deployed with `public/bimi/logo.svg` in it.

**What this actually gets you, honestly:**

| Client | Result |
|---|---|
| Yahoo / AOL | Logo shows. Free. |
| Fastmail, La Poste, others | Logo shows. Free. |
| **Gmail** | **Logo does NOT show without a VMC** |
| Apple Mail | Uses the recipient's contact photo; BIMI is not consulted |

Gmail additionally requires a **Verified Mark Certificate** — an identity
certificate from DigiCert or Entrust that costs roughly **US$1,000–1,500 a
year** and requires a registered trademark on the logo. That is the honest
state of BIMI: the free work below is worth doing and will show up in some
inboxes, but the Gmail checkmark is a paid product and there is no way around
it.

If Gmail is where your users are and the certificate is not worth it, the
cheaper win is that Gmail shows a coloured letter avatar derived from the
sender name — which it already does — and reputation matters far more to
whether the message is opened than the avatar does.

## Operating notes

- **Schedule:** Mondays, `0 15 * * 1` UTC — 09:00 Calgary in summer, 08:00 in
  winter. The *week* a send belongs to is computed in `America/Edmonton`, so
  the hour drift cannot cause a double send.
- **Planned opening note:** saving in the admin Email planner writes one
  `weekly_email_plans/{isoWeek}` document and queues a test for every approved
  admin. A Firestore-triggered function delivers it immediately; the browser
  never receives the Resend key. Saving again replaces that edition's note and
  queues a fresh test. The deployment workflow syncs `RESEND_API_KEY` into
  Firebase Secret Manager before deploying the function.
- **Editorial syntax:** `## Heading`, `**bold**`, `- list item`, `> quotation`
  and `[label](https://secure-link)` are supported. Raw HTML is always escaped.
  Calls to action require both a short label and an `https://` destination.
- **Idempotency:** each send claims `digest_sends/{uid}_{isoWeek}` before the
  provider is called. Re-running the workflow is safe.
- **Unsubscribes** are honoured at the start of every run, before recipients
  are selected. Worst case latency is seven days; CASL allows ten business.
- **Failures** release their claim, so a provider outage retries next week
  rather than silently skipping somebody forever.
- **Bounces and complaints:** Resend's dashboard shows these. Nothing yet
  reads them back into Firestore — see below.

## Deliberately not built

- **Bounce/complaint feedback loop.** Needs a Resend webhook, which needs an
  HTTP endpoint this static site does not have. Check the Resend dashboard
  monthly and clear hard-bouncing addresses by hand until the list is big
  enough to justify a Cloud Function.
- **One-click unsubscribe (`List-Unsubscribe-Post`).** Requires honouring an
  unauthenticated POST — same missing endpoint. Gmail only mandates it above
  5,000 messages a day. The standard `List-Unsubscribe` header is present, so
  Gmail and Apple Mail still show their native unsubscribe control.
- **`weeklyDigestTopics` filtering.** The field is captured at opt-in and the
  sender loads it, but nothing filters on it yet — every issue covers every
  topic. Splitting the digest by topic is a content decision, not plumbing.
