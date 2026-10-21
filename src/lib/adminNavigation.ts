/** Stable IDs preserve existing bookmarked admin links. */
export const ADMIN_SECTIONS = [
  {
    id: "desk",
    title: "Overview",
    description: "How CalgaryWatch is growing, and what needs you today.",
    group: "Daily work",
    keywords: "home watch desk tasks pending queue",
  },
  {
    id: "partners",
    title: "Organizations & claims",
    description:
      "Verify representatives, review business updates and manage outreach.",
    group: "Daily work",
    keywords:
      "partners owners companies business approvals market hq contact email",
  },
  {
    id: "content",
    title: "Listings & suggestions",
    description:
      "Find events and markets, review submissions and edit published content.",
    group: "Daily work",
    keywords: "events markets inventory publish archive cancel source",
  },
  {
    id: "members",
    title: "Members & businesses",
    description:
      "Find a member, see their dashboard and check organization access.",
    group: "Daily work",
    keywords: "plans accounts users subscriptions signup dashboard",
  },
  {
    id: "planner",
    title: "Email & reader replies",
    description:
      "Plan the weekly emails, inspect audiences and handle reader replies.",
    group: "Daily work",
    keywords: "newsletter monday thursday digest inbox proof subscribers",
  },
  {
    id: "ops",
    title: "Social publishing",
    description:
      "Review Instagram drafts, schedule posts and inspect automation health.",
    group: "Publishing & system",
    keywords: "operations agent instagram calgarydaily briefs performance",
  },
  {
    id: "feeds",
    title: "Data & service health",
    description: "Check civic feeds, failures and source freshness.",
    group: "Publishing & system",
    keywords: "apis ingestion backend system status",
  },
  {
    id: "reports",
    title: "Community reports",
    description: "Review report history, trust levels and moderation.",
    group: "Insights & tools",
    keywords: "incidents flags resident map",
  },
  {
    id: "people",
    title: "Account administration",
    description: "Edit account roles and notes; inspect contribution history.",
    group: "Insights & tools",
    keywords: "people roles permissions admin users directory",
  },
  {
    id: "visitors",
    title: "Website traffic",
    description: "Review visits, pages, referrers and campaigns.",
    group: "Insights & tools",
    keywords: "analytics visitors sessions utm views",
  },
  {
    id: "demand",
    title: "Search opportunities",
    description:
      "See what people search for and which requests have no results.",
    group: "Insights & tools",
    keywords: "demand queries missing coverage",
  },
  {
    id: "city",
    title: "City data & scores",
    description: "Inspect crime data and maintain community safety scores.",
    group: "Insights & tools",
    keywords: "stats city neighbourhood safety",
  },
] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number]["id"];
export function adminSection(value: string | null): AdminSection {
  return ADMIN_SECTIONS.some((s) => s.id === value)
    ? (value as AdminSection)
    : "desk";
}
export function matchesAdminNavigation(
  item: { label: string; description?: string; keywords?: string },
  search: string,
) {
  const words = search.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const text = [item.label, item.description, item.keywords]
    .join(" ")
    .toLocaleLowerCase();
  return words.every((word) => text.includes(word));
}
export function adminSectionUrl(section: string, view?: string) {
  return `/admin?${new URLSearchParams({ section, ...(view ? { view } : {}) })}`;
}
