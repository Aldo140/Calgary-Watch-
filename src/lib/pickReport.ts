import { LOCAL_SERVICES, serviceById } from '../data/localServices';
import { shelfFor, type Contender } from './cwPicks';
import type { DiscoveryEntity } from '../types/discovery';

/**
 * The admin side of CalgaryWatch Picks: who Calgarians reached from each desk.
 * Built from anonymous pick_contact events (list, place, via, contact,
 * followup), so it can say "12 people called Knight Plumbing" but never who.
 */

export interface PickContactEvent { list?: unknown; place?: unknown; via?: unknown; contact?: unknown; followup?: unknown; ts?: unknown }

export interface CompanyTally { key: string; name: string; contacts: number; calls: number; sites: number; checkIns: number; path?: string }
export interface ServiceTally { id: string; label: string; contacts: number; checkIns: number; companies: CompanyTally[]; bySource: Record<string, number> }

const DAY = 86_400_000;

/** Contacts per service and company in the window, busiest first. Unknown lists are dropped, unknown companies kept by key. */
export function tallyPickContacts(events: readonly PickContactEvent[], opts: { now?: number; days?: number; entities?: readonly DiscoveryEntity[] } = {}): ServiceTally[] {
  const now = opts.now ?? Date.now();
  const since = now - (opts.days ?? 30) * DAY;
  const out = new Map<string, ServiceTally>();
  const names = new Map<string, Map<string, Contender>>();
  for (const e of events) {
    if (typeof e.list !== 'string' || typeof e.place !== 'string' || typeof e.ts !== 'number' || e.ts < since || e.ts > now) continue;
    const service = serviceById(e.list);
    if (!service) continue;
    let s = out.get(service.id);
    if (!s) {
      s = { id: service.id, label: service.label, contacts: 0, checkIns: 0, companies: [], bySource: {} };
      out.set(service.id, s);
      names.set(service.id, new Map((shelfFor(service.id, opts.entities ?? [], now)?.contenders ?? []).map(c => [c.key, c])));
    }
    let c = s.companies.find(x => x.key === e.place);
    if (!c) {
      const known = names.get(service.id)!.get(e.place);
      c = { key: e.place, name: known?.name ?? e.place, contacts: 0, calls: 0, sites: 0, checkIns: 0, ...(known?.path ? { path: known.path } : {}) };
      s.companies.push(c);
    }
    const checkIn = e.followup === 'yes';
    s.contacts++; c.contacts++;
    if (checkIn) { s.checkIns++; c.checkIns++; }
    if (e.contact === 'call') c.calls++; else if (e.contact === 'site') c.sites++;
    const via = typeof e.via === 'string' ? e.via : 'other';
    s.bySource[via] = (s.bySource[via] ?? 0) + 1;
  }
  for (const s of out.values()) s.companies.sort((a, b) => b.contacts - a.contacts || a.name.localeCompare(b.name));
  return [...out.values()].sort((a, b) => b.contacts - a.contacts || LOCAL_SERVICES.findIndex(x => x.id === a.id) - LOCAL_SERVICES.findIndex(x => x.id === b.id));
}

/** The line an outreach email can quote, true to the numbers and never a promise. */
export function contactLine(company: CompanyTally, days = 30): string {
  const n = company.contacts;
  return `${n} ${n === 1 ? 'Calgarian' : 'Calgarians'} reached ${company.name} from CalgaryWatch in the last ${days} days (${company.calls} ${company.calls === 1 ? 'call' : 'calls'}, ${company.sites} website ${company.sites === 1 ? 'visit' : 'visits'}).`;
}
