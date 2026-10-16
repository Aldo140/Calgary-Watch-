# Shared claim-page design — October 16, 2026

Every `/claim/:id` route uses the same updated page and stylesheet. Category presentation covers markets, theatre/performing arts, music/festivals, visual arts/culture, food/hospitality, community organizations, general businesses and other events. A linked listing supplies the context; presentation never changes organizer associations, claim IDs, ownership, verification or access rules.

The page now uses a concise category introduction and icon, a coordinated accent, a desktop organization stamp, a visible three-step process, and clear free-account/no-neighbourhood assurances. The prefilled organization context is distinct from the listing source card. A dedicated introduction and native radio role choices improve the application structure and keyboard navigation. The note prompt and benefits follow the category. Publishing limits remain visible in a separate panel: one submission per seven days per business, automatic publication/admin notification, and images handled by email.

Mobile uses a single-column form, stacked steps and full-width actions. Category-specific decoration is hidden on small screens. Focus indicators and reduced-motion behavior are preserved. Existing admin preview, normal claim access, signed-out signup, pending/approved claims and additional representatives retain their prior access behavior.

Validation: 1,221 individual tests across 104 files passed, including all claim-access regressions and category coverage over the entire claimable inventory. A local Chromium harness exercised the actual page with only Firebase/auth/site chrome mocked: canonical organization submission, a standalone market, additional-representative requests, approved workspace links and preserved legacy scope. Five categories were checked at 390px and 1280px with no horizontal overflow. Screenshots were visually inspected. No real claims or emails were submitted.

TypeScript (`npm run lint`) and the final production build/prerender passed; 666 pages were generated. This is released through the existing main-branch Hosting workflow; live deployment completion is verified separately.
