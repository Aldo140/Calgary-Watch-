# Admin dashboard audit and redesign

The dashboard now opens around daily work: organization claims, listings, members, email and publishing. All twelve original workspaces remain available, using the same `section` IDs so existing bookmarks continue to work. Advanced reports are grouped separately from daily tasks. No collections, published listings or capabilities were deleted.

Code inspection can identify broken paths and confusing defaults; it cannot establish that a feature is unused without authenticated usage evidence. For that reason, the redesign consolidates presentation rather than deleting features based on assumptions.

## Workspace inventory

| Existing section | Updated navigation | Preserved functionality and changes |
| --- | --- | --- |
| `desk` | Overview | Ranked moderation/feed tasks, suggestions, claims, business updates; adds social drafts/corrections, market requests and reader replies. Direct actions open the correct subview. Existing charts, civic counts and KPIs are in an expandable overview. |
| `partners` | Organizations & claims | Verification, organization scope selection, approval repair, approval/email history, owner update notifications, outreach drafts/replies/suppression and managed Market HQ. Four focused views replace the stacked page. |
| `content` | Listings & suggestions | Resident suggestion approval/rejection, source-backed edits, publish/unpublish/archive/cancel and queued-action inspection. Search includes published release inventory as well as backend records. Snapshot-only entries link to public pages and management access rather than submitting unsupported backend moderation actions. |
| `members` | Members & businesses | Search/filter accounts, inspect email plans and approved organization access, open the member dashboard/organization workspace. Directory opens first; audience insights remain in a separate view. |
| `planner` | Email & reader replies | All six email views: overview, every-email gallery, readers, opening-note composer, reply inbox and delivery rules. Existing proof, draft, approval, deletion and preflight protections remain. |
| `ops` | Social publishing | Review/schedule/reject/redraft/unschedule posts, corrections, source briefs, agent health, recent performance and all-time history. Five focused views avoid opening every listener at once. |
| `feeds` | Data & service health | Civic endpoints, scheduled-ingestion health, configuration and freshness. No new automatic repairs or changed feed policy. |
| `reports` | Community reports | Report archive, category/trust/timeline analytics and record moderation. |
| `people` | Account administration | Account role/notes management and contribution history; member/business inspection is the daily directory. |
| `visitors` | Website traffic | Visits, sessions, pages, referrers, campaigns and organic search reports. |
| `demand` | Search opportunities | Time windows, missed searches, current search answers and popular terms; failed reads show errors/retry rather than a false perfect hit rate. |
| `city` | City data & scores | Crime/community data, charts and score maintenance. Save failures are surfaced. |

## Navigation and presentation

- Search task names and familiar old labels (for example newsletter, partners, roles or Instagram).
- Workspace tabs use URL parameters; refresh, direct links and browser Back retain the selected view. Main section navigation removes incompatible subview parameters.
- Desktop sidebar groups daily work, publishing/system and reference tools. Phone navigation exposes frequent tasks and an accessible searchable all-tools dialog.
- The mobile dialog traps keyboard focus, supports Escape, restores focus to its opener and restores scrolling when dismissed.
- Shared panels wrap titles/actions, long email addresses and URLs, and give phone controls usable touch targets. All workspace views remain visible on small screens.
- A section-level error boundary preserves navigation if one workspace fails.

## Functional repairs

- Queue count failures are isolated per source and keep last known successful values. Loading or unavailable queues never announce that the desk is clear.
- Failed report, member, search, market-service, business-update and social-health reads are distinguished from empty collections. Relevant workspaces offer retries; shared errors identify their source.
- The admin route loads workspace code together to avoid stale per-workspace lazy chunks during releases. Hidden outreach, social reports and member insights still do not mount their collection listeners on entry to claims, the post queue or the directory.
- Claim approval keeps the existing atomic account/claim/verification transaction and the newer default organization scope. Its CRM lookup works even when the separate outreach view has not been loaded.
- Do-not-contact suppression and lead status are committed in one batch. A failed suppression write cannot silently mark only the lead as blocked.
- Social brief requests handle duplicate clicks and write errors. Requested posts missing caption/alt text no longer crash. Invalid source URLs no longer crash rendering. Notes count as unsaved edits.
- Social scheduling reads/writes the site's Calgary timezone convention even when the administrator's browser uses another timezone; invalid/past schedules are rejected before saving.
- Social correction and reader-inbox write failures are shown instead of left as unhandled promises or console-only errors. Reports distinguish missing snapshots from denied reads and warn when snapshots are older than two days.
- Consent timestamps are no longer counted as home locations. Capped audience samples are labelled and do not stand in for exact totals at the cap.
- The email proof setup message no longer guesses the Firebase billing plan or directs the administrator to upgrade an unrelated hard-coded project. It points to backend setup and the actual build flag.
- Backend inventory rows win over published release snapshots, including drafts and archives; old release data cannot resurrect unpublished records. Development fixtures and guides are excluded from the listing moderation inventory.

## Production dependencies and limits

This is a frontend/admin workflow release. It does not change roles, access policies, weekly organization allowances, image policy, approval requirements or outbound-message policy.

A frontend release cannot repair missing deployed Firestore rules, missing callable functions, failed job credentials or a disabled proof service. The existing backend deployment workflow remains the route for those dependencies:

https://github.com/Aldo140/Calgary-Watch-/actions/workflows/deploy-firebase-backend.yml

Owner-edit notification permissions require the current rules. Broader organization approval requires the existing `approveOrganizationClaim` callable. Proofs require the deployed service plus the repository variable `DIGEST_PROOF_ENABLED` and a site rebuild. Existing scheduled ingest, export, moderation and publishing workflows still need production execution/monitoring.

No real claims were approved, no emails were sent, and no production records were changed during validation. Browser checks use the actual admin components and hooks with an isolated fake Firebase backend; authenticated production authorization and scheduled-job execution are separate checks.

## Validation

- TypeScript: `npm run lint`.
- Regression suite: all `tests/*.test.ts` executed individually with `node --import tsx` to report actual assertion counts, including navigation, inventory fallback/precedence, incomplete attention states, isolated workload failures and Calgary scheduling.
- Production build, messaging worker, release marker, prerender and email preview generation.
- Chromium: 25 section/view combinations at 1440, 768, 390 and 320 pixels (100 renders); no section crashes, page errors, unintended writes or document overflow.
- Isolated browser actions cover navigation search, URL/back state, hidden-view subscriptions, mobile focus/scroll restoration, denied reads/retries, incomplete social drafts, future schedule validation, Calgary scheduling from a Pacific browser, atomic suppression success/failure, published inventory search and exact overview task destinations.

## Production crash follow-up

Search analytics, listing metadata and legacy timestamps must be decoded at read boundaries rather than trusted through TypeScript casts. Shared `TimeAgo` accepts numeric, ISO and Firestore timestamps and handles invalid dates without throwing. Listing adapters normalize optional sources/dates/duplicate metadata, show incomplete records and block unsupported moderation. Submission editors open incomplete dates as blank required fields; unsupported submission kinds cannot be approved. Claims preserve real identity and scope; missing identity/status is reported rather than guessed. These adapters do not migrate or modify stored records.

Follow-up browser validation uses Vite production chunks in addition to isolated Firebase fixtures. Both Listings and Claims were exercised at four widths with missing source arrays, malformed submissions, missing queue actions, legacy timestamp objects, and pending/approved claim records. No production claims or data were changed.
