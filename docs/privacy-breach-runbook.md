# Privacy breach runbook

What to do if personal information held by Calgary Watch is exposed. Written to
be followed under pressure, by one person, at an inconvenient hour.

Both PIPEDA and Alberta's PIPA require notifying affected individuals and the
relevant Commissioner where a breach creates a **real risk of significant harm**,
and require keeping a record of every breach — including ones you decide not to
report. The record is not optional; regulators ask for it.

Not legal advice. If a breach is real, tell a lawyer early.

---

## 1. Contain it first (minutes)

Stop the exposure before investigating it.

- **Firestore or Storage rules are wrong** — revert to the last known-good rules and deploy:
  ```bash
  git log --oneline -- firestore.rules storage.rules
  git checkout <good-sha> -- firestore.rules storage.rules
  firebase deploy --only firestore:rules,storage
  ```
- **A service-account key leaked** — revoke it in the Google Cloud console
  (IAM → Service Accounts → Keys), rotate `FIREBASE_SERVICE_ACCOUNT` in GitHub
  Actions secrets, then re-run any workflow that used it.
- **An admin account is compromised** — remove the email from
  `ALLOWED_ADMIN_EMAILS` in `src/constants/admin.ts` *and* from
  `isApprovedAdminToken()` in `firestore.rules`, then deploy both. The rules copy
  is the one that actually enforces it.
- **Content is publicly visible that should not be** — set the affected
  incidents' `visibility` to `deleted` before doing anything else.

## 2. Work out what was exposed (same day)

The sensitive personal information in this system, in rough order of how much it
would matter:

| Data | Where | Why it matters |
|---|---|---|
| Reporter email addresses | `incident_reporters` | Links a named person to a specific report and location |
| Account email and name | `users` | Contact details |
| Uploaded photos | Storage `incidents/{uid}/` | May contain faces, plates, house numbers |
| Report coordinates plus author | `incidents` | Can place an identifiable person at an address |
| Admin notes about a user | `users.notes` | Opinion about an identifiable person |
| Volunteer submissions | `volunteers` | Name, email, free text |

Analytics in `page_views` carries no name, no account and no advertising id, and
the referring URL is reduced to a hostname, so it is unlikely to be a reportable
breach on its own.

Write down, in the record: what data, how many people, when it started, when it
stopped, and how you know.

## 3. Decide whether it is reportable (same day)

Assess *real risk of significant harm*: sensitivity of the data, and the
probability it is misused. Significant harm includes humiliation, damage to
reputation or relationships, and identity theft.

Treat as reportable by default if **reporter identity was linkable to reports** —
this service exists because people report things they would not put their name
to publicly, and connecting the two is exactly the harm the split into
`incident_reporters` was built to prevent.

## 4. Notify (as soon as feasible)

- **Affected individuals** — directly, by email to the address on file. Say what
  happened, what data, what you have done, what they can do, and how to reach
  you.
- **Office of the Privacy Commissioner of Canada** — https://www.priv.gc.ca
- **Office of the Information and Privacy Commissioner of Alberta** —
  https://oipc.ab.ca

Alberta requires notification to the Commissioner **without unreasonable delay**.
Do not wait for a complete investigation to notify; send what you know and follow
up.

## 5. Record it (always)

Keep a dated note in the repository or a private document containing:

- what happened and when it was discovered
- what personal information was involved and how many people
- the containment steps and their timestamps
- the risk assessment and the reasoning for reporting or not reporting
- who was notified and when

Keep breach records for **24 months** minimum.

## 6. Close it out

Fix the cause, add a test that would have caught it, and note it here. The
`tests/rules-contract.test.ts` suite exists because a rules/client mismatch
silently rejected analytics writes for weeks — most breaches in a system like
this will be a similar mismatch rather than an attack.

---

## Standing reminders

- Rules are the enforcement boundary; the client is not. Anything the client
  hides is still readable unless a rule forbids it.
- `incidents` is world-readable by design so the map works signed out. Never put
  anything identifying into that collection.
- Firestore rules filter *queries*, not rows. A read rule that depends on a field
  only works if the client's query constrains that field.
