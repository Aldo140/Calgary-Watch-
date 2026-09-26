# Operations agent

It runs every day without a laptop open. It posts to **@calgarydaily**, CalgaryWatch's sister Instagram account. There is no separate CalgaryWatch Instagram. It also runs partner outreach from aldo@calgarywatch.ca and keeps an eye on the site.

- **Listing posts** (Today and Tonight roundups, spotlights, the Friday weekend Reel) publish on their own when they pass the brand rules.
- **News, opinion, anything with a warning, and paid posts** wait for you in /admin.
- **Partner emails** are sent automatically once every CASL check passes (`autoSend` in `brand/outreach.json`). You can cancel any queued email in /admin before its send window.
- **Replies from businesses** always wait for you. Opt-outs take effect at once and are permanent.

## How it runs

| Workflow | When | What it does |
| --- | --- | --- |
| `ops-daily.yml` | 03:05, 06:05, 07:05, 08:05 Calgary (summer time) | Rebuilds the listing index. Pulls Instagram numbers and follower count. Flags posts whose listing changed and expires stale drafts. Drafts and renders the day's posts, including the Friday Reel. Finds leads and drafts first emails and follow-ups, queued automatically. Runs the health check and emails you a summary once a day, after 6 am. Every step is safe to repeat. |
| `ops-hourly.yml` | :07, :22, :37, :52 every hour | Publishes due posts. Drafts briefs and redrafts you asked for. Reads replies: "stop" takes effect at once. Sends queued emails Mon–Thu, 9 am to 4:30 pm, at most 10 a day. |
| `ops-maintenance.yml` | 03:40 Calgary | Runs the type check, tests and `npm audit`. On failure, Claude Code opens a pull request with a fix. It never pushes to main. |
| `deploy-firebase.yml` | Every push to main, and twice a day | Exports the latest @calgarydaily posts into the homepage's "Calgary Daily, by CalgaryWatch" section (`npm run ops:feed`). |

**Why so many runs:** GitHub skips or delays scheduled runs. On 2026-09-25 only about 4 of 24 hourly runs started. Each run catches up on whatever is due, so more chances mean posts go out close to their slot. The repository is public, so the extra runs cost nothing. The admin performance panel shows how many minutes late automatic posts go out. If that stays over about 30 minutes, add an external trigger (see "External trigger" below).

Review happens in **/admin → Operations** (queue, performance, health) and **/admin → Local partners** (emails and replies).

Code: `scripts/ops/` (jobs), `src/components/admin/OpsWorkspace.tsx` and `PartnersWorkspace.tsx` (review), `brand/*.json` (brand and outreach rules), `tests/ops-agent.test.ts`. On the website: `src/components/home/CalgaryDailyStrip.tsx` (homepage section), `/partners` (how we work with businesses), and the footer link.

## What the agent learns from

The daily run reads Instagram's reach, views, likes, comments, saves and shares for every post from the last 21 days (`scripts/ops/jobs/insights.ts`). From these numbers:

- The **performance panel** in /admin and the morning email show followers (and this week's change), which formats, post types and times of day reach the most people, the top five posts, and how late automatic posts went out.
- The **two captions with the most saves and shares** in the last 30 days are added to the writer's voice examples, so new captions lean toward what works. News and opinion are left out.

Insights need the `instagram_business_manage_insights` permission on the token. If the log says "insights failed", generate a new token with that permission ticked.

## One-time setup

1. **Repository secrets** (Settings → Secrets and variables → Actions → Secrets):
   - `ANTHROPIC_API_KEY`: drafting. Without it, posts use the fixed templates. See "Anthropic" below.
   - `IG_TOKEN_CALGARYDAILY`: set.
   - `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`: the Outlook sending app. See "Outlook" below.
   - `IG_TOKEN_CALGARYWATCH` is no longer needed.
2. **Repository variables** (same page, Variables tab):
   - `OPS_SUMMARY_TO` = `aldo@calgarywatch.ca` (set).
   - `DIGEST_MAILING_ADDRESS`: set. CASL requires a real mailing address in every commercial email.
   - `ANTHROPIC_WORKSPACE_ID`: only if you keep a key that isn't tied to a workspace. See "Anthropic" below.
3. **Let Actions open pull requests:** Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests".
4. **Instagram bio for @calgarydaily** (the API can't change it): add "by CalgaryWatch · calgarywatch.ca".

### Anthropic

The 400 error means the key was created outside a workspace. The easiest fix is a new key made inside one:

1. Sign in at console.anthropic.com and open **Settings → Workspaces**. Use the Default workspace, or create "CalgaryWatch Ops".
2. Open **Settings → API keys → Create key** and pick that workspace. Copy the key; it starts with `sk-ant-`.
3. Replace the `ANTHROPIC_API_KEY` secret with it. You don't need `ANTHROPIC_WORKSPACE_ID`.

To keep the current key instead, open the workspace in **Settings → Workspaces**. Copy its ID from the address bar (it starts with `wrkspc_`) and save it as the repository **variable** `ANTHROPIC_WORKSPACE_ID`.

### Outlook (sending as aldo@calgarywatch.ca)

This needs aldo@calgarywatch.ca to be a real Microsoft 365 / Exchange Online mailbox, for example Exchange Online Plan 1, with you as a tenant admin. A personal Outlook.com or iCloud account can't do this.

1. Go to entra.microsoft.com and sign in as the admin. Open **Identity → Applications → App registrations → New registration**. Name it "CalgaryWatch Ops", choose "Single tenant" and leave Redirect URI empty.
2. On the app's **Overview** page, copy:
   - **Directory (tenant) ID**, which goes in `MS_TENANT_ID`;
   - **Application (client) ID**, which goes in `MS_CLIENT_ID`.
3. Open **API permissions → Add a permission → Microsoft Graph → Application permissions**. Tick **Mail.Send** and **Mail.ReadWrite**, then click **Grant admin consent**.
4. Open **Certificates & secrets → New client secret** and choose 24 months. Copy the **Value** column, not the Secret ID, into `MS_CLIENT_SECRET`. It's shown only once.
5. **Limit the app to one mailbox.** Otherwise it can reach every mailbox in the tenant. Run `powershell -ExecutionPolicy Bypass -File scripts\ops\restrict-outlook-app.ps1 -AppId <client id>`, which does the following:
   ```powershell
   New-DistributionGroup -Name "CW Ops Mailboxes" -Type Security -Members aldo@calgarywatch.ca
   New-ApplicationAccessPolicy -AppId <client id> -PolicyScopeGroupId "CW Ops Mailboxes" -AccessRight RestrictAccess -Description "Ops agent: aldo@ only"
   ```
6. To check it, run "Operations Hourly" by hand. The log should stop saying "Outlook is not connected".

### External trigger (only if posts are still late)

At cron-job.org (free), create a job that runs every 15 minutes: `POST https://api.github.com/repos/Aldo140/Calgary-Watch-/actions/workflows/ops-hourly.yml/dispatches`, with body `{"ref":"main"}`, header `Accept: application/vnd.github+json`, and `Authorization: Bearer <token>`. The token should be a fine-grained personal access token limited to this repository, with **Actions: read and write** permission only.

## Rules the agent follows

- **Posts** are built only from the facts in a verified listing, and those facts are shown next to every draft. Images are brand templates or credited, openly licensed photos, never AI-generated scenes. Any post about crime, emergencies or a private person is flagged as sensitive and waits. Captions point to CalgaryWatch once ("Full list on CalgaryWatch, link in bio").
- **Leads** come only from businesses and markets already listed on the site. There's no bulk import of strangers.
- **Email addresses:** only an address the business publishes on its own site. The page it came from and the CASL consent basis are stored with the lead. A "no solicitation" notice blocks the lead. An address or domain that has already been contacted is never pitched twice.
- **Every email** carries your name, CalgaryWatch, the mailing address, a link to /partners and a "reply stop" opt-out. Opt-outs are permanent (`outreach_suppression`), and the browser can't undo them.
- **Automatic sending** (`autoSend: true`): a draft that fails any of these checks is blocked, not sent. If a person has edited a lead or cancelled its send in the admin, that lead waits for the person. Set `autoSend` to `false` to approve every email by hand again.
- **No prices or paid placement** appear in any email while `paidOfferEnabled` is `false` in `brand/outreach.json`. The public page it requires now exists (/partners). Turn it on once the Local Partner price and deliverables are final, and update the "Featured partners" card on /partners in the same change.
- **One follow-up** is allowed, after 7 days. After that the lead is closed.

## Earlier contacts

Export them to a CSV with this header: `businessName,email,website,status,lastContactAt,notes`. Then run:

```sh
npm run ops:import-leads -- contacts.csv          # dry run
npm run ops:import-leads -- contacts.csv --write  # needs FIREBASE_SERVICE_ACCOUNT
```

Imported businesses are never pitched again automatically, and `do-not-contact` rows go straight onto the suppression list.

## Local commands

- `npm run ops:preview` renders sample posts, both profile images and a grid preview into `brand/preview/`.
- `npm run ops:daily` without Firebase credentials is a dry run: it drafts and renders into `brand/preview/dry-run/`. On a Friday it also renders the Reel, which needs ffmpeg.
- `npm run ops:check` checks the Instagram and Anthropic keys.
- `npm run ops:feed` refreshes the homepage's CalgaryDaily posts (needs Firebase credentials).
