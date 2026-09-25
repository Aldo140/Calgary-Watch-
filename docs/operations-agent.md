# Operations agent

It runs every day without a laptop open. It drafts Instagram posts for CalgaryWatch and CalgaryDaily from the verified listings, keeps an eye on the site, and runs partner outreach from aldo@calgarywatch.ca. **Nothing is published or emailed until you approve it in /admin.**

## How it runs

| Workflow | When | What it does |
| --- | --- | --- |
| `ops-daily.yml` | 07:05 Calgary (summer) | Rebuilds the listing index. Flags published posts whose listing changed or was cancelled, and expires stale drafts. Drafts new posts and renders them to PNG. Finds leads among listed businesses and markets, and drafts first emails and follow-ups. Runs the health check and emails you a summary. |
| `ops-hourly.yml` | :25 every hour | Publishes approved posts that are due. Drafts briefs and redrafts you asked for. Reads replies: "stop" takes effect at once and permanently. Sends approved emails Mon–Thu, 9 am to 4:30 pm, at most 10 a day. |
| `ops-maintenance.yml` | 03:40 Calgary | Runs the type check, tests and `npm audit`. On failure, Claude Code opens a pull request with a fix. It never pushes to main. |

Review happens in **/admin → Operations** (posts, briefs, health) and **/admin → Local partners** (emails and replies).

Code: `scripts/ops/` (jobs), `src/components/admin/OpsWorkspace.tsx` and `PartnersWorkspace.tsx` (review), `brand/*.json` (brand and outreach rules), `tests/ops-agent.test.ts`.

## One-time setup

1. **Deploy the new Firestore rules.** Actions → Deploy Firebase Backend → target `rules`, then type `DEPLOY`. Until this is done, the admin screens show a "rules are not deployed" message.
2. **Repository secrets** (Settings → Secrets and variables → Actions → Secrets):
   - `ANTHROPIC_API_KEY`: drafting. Without it, posts use the fixed templates.
   - `IG_TOKEN_CALGARYWATCH`, `IG_TOKEN_CALGARYDAILY`: long-lived tokens (see "Instagram" below).
   - `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`: the Outlook sending app (see "Outlook" below).
   - `VITE_FIREBASE_STORAGE_BUCKET`: should already exist.
3. **Repository variables** (same page, Variables tab):
   - `OPS_SUMMARY_TO` = `aldo@calgarywatch.ca`
   - `DIGEST_MAILING_ADDRESS`: a real mailing address. CASL requires one in every commercial email, and the outreach job refuses to draft without it.
   - `OUTREACH_MAILBOX` = `aldo@calgarywatch.ca` (this is also the default).
4. **Let Actions open pull requests:** Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests".
5. **Check it:** run `npm run ops:check` locally with the tokens in `.env`, then run "Operations Daily" once by hand from the Actions tab.

### Instagram

Both accounts must be **Business** accounts, each linked to its own Facebook Page. Then:

1. Create a Meta app (Business type) and add Instagram with Facebook Login.
2. In the Graph API Explorer, generate a user token with `instagram_basic`, `instagram_content_publish`, `pages_show_list` and `pages_read_engagement`.
3. Extend the token in the Access Token Debugger.

The daily health check shows how many days each token has left and warns 10 days before it expires.

### Outlook (sending as aldo@calgarywatch.ca)

1. In Entra admin center, go to App registrations → New registration ("CalgaryWatch Ops").
2. Under API permissions, add Microsoft Graph **Application** permissions **Mail.Send** and **Mail.ReadWrite**, then grant admin consent.
3. Create a client secret under Certificates & secrets. Copy the tenant ID, client ID and secret into the secrets above.
4. **Limit the app to one mailbox.** Otherwise it can reach every mailbox in the tenant. Run `powershell -ExecutionPolicy Bypass -File scriptsopsestrict-outlook-app.ps1 -AppId <client id>`, which does the following:
   ```powershell
   New-DistributionGroup -Name "CW Ops Mailboxes" -Type Security -Members aldo@calgarywatch.ca
   New-ApplicationAccessPolicy -AppId <client id> -PolicyScopeGroupId "CW Ops Mailboxes" -AccessRight RestrictAccess -Description "Ops agent: aldo@ only"
   ```

## Rules the agent follows

- **Posts** are built only from the facts in a verified listing, and those facts are shown next to every draft. Images are brand templates, never photos or AI-generated scenes. Any post about crime, emergencies or a private person is flagged as sensitive. Every post needs approval: see `autoPublish` in `brand/*.json`, which is all `false`.
- **Leads** come only from businesses and markets already listed on the site. There's no bulk import of strangers.
- **Email addresses:** only an address the business publishes on its own site. The page it came from and the CASL consent basis are stored with the lead. A "no solicitation" notice blocks the lead.
- **Every email** carries your name, CalgaryWatch, the mailing address and a "reply stop" opt-out. Opt-outs are permanent (`outreach_suppression`), and the browser can't undo them.
- **No prices or paid placement** appear in any email while `paidOfferEnabled` is `false` in `brand/outreach.json`. Turn it on only when the Local Partner offer is final and a public "How Featured partners work" page exists.
- **One follow-up** is allowed, after 7 days, and it also needs approval. After that the lead is closed.

## Earlier contacts

Export them to a CSV with this header: `businessName,email,website,status,lastContactAt,notes`. Then run:

```sh
npm run ops:import-leads -- contacts.csv          # dry run
npm run ops:import-leads -- contacts.csv --write  # needs FIREBASE_SERVICE_ACCOUNT
```

Imported businesses are never pitched again automatically, and `do-not-contact` rows go straight onto the suppression list.

## Local commands

- `npm run ops:preview` renders sample posts, both profile images and a grid preview into `brand/preview/`.
- `npm run ops:daily` without Firebase credentials is a dry run: it drafts and renders into `brand/preview/dry-run/`.
- `npm run ops:check` checks the Instagram and Anthropic keys.
