import { emailDomain, sourceDomains } from './claims';

type Claimable = { id: string; kind: string; title: string; sources?: ReadonlyArray<{ url: string }>; developmentOnly?: boolean };

/**
 * Big institutions whose staff and students sign up as ordinary readers: a
 * ucalgary.ca address says nothing about running the university's listings.
 */
const BROAD = /(^|\.)(ucalgary\.ca|mtroyal\.ca|sait\.ca|bowvalleycollege\.ca|stmu\.ca|ambrose\.edu|calgary\.ca|alberta\.ca|gc\.ca|canada\.ca|ahs\.ca|albertahealthservices\.ca|cbe\.ab\.ca|cssd\.ab\.ca)$|\.edu$/;

/** Organizer profiles first: one claim there covers every event under it. */
const KIND_ORDER = ['business', 'market', 'event'];

/**
 * The listing someone most likely runs, from their sign-in email alone:
 * info@thebarnartisanmarket.ca → The Barn Artisan Market. Free-mail
 * addresses never match, because sourceDomains drops those domains.
 */
export function organizationForEmail<T extends Claimable>(email: string | null | undefined, entities: readonly T[], skip: ReadonlySet<string> = new Set()): T | null {
  const domain = emailDomain(email);
  if (!domain || BROAD.test(domain)) return null;
  const hits = entities.filter(e => KIND_ORDER.includes(e.kind) && !e.developmentOnly && !skip.has(e.id)
    && sourceDomains(e.sources ?? []).some(site => domain === site || domain.endsWith(`.${site}`)));
  hits.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  return hits[0] ?? null;
}
