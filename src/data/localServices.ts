/**
 * The everyday services Calgarians look for, as Local's service directory and as
 * partner-outreach categories (scripts/ops uses the same ids). Tips are general
 * hiring advice and Calgary/Alberta facts, never claims about a business.
 */
export type ServiceGroup = 'home' | 'outdoor' | 'car' | 'everyday';

export interface LocalService {
  id: string;
  label: string;
  group: ServiceGroup;
  /** Who does it, in plain words; the first one names a single business in outreach. */
  trades: string[];
  /** Months (1–12) when Calgarians book it most, for a "busy now" nudge. */
  peak: number[];
  tip: string;
  /** Listing tags or services that put a Local place under this service. */
  match: string[];
}

export const SERVICE_GROUPS: Record<ServiceGroup, { label: string; blurb: string }> = {
  home: { label: 'In the house', blurb: 'The calls you make when something breaks.' },
  outdoor: { label: 'Yard and weather', blurb: 'Snow, hail and a short summer.' },
  car: { label: 'The car', blurb: 'Winter tires and gravel season.' },
  everyday: { label: 'Everyday errands', blurb: 'The small fixes that make a week easier.' },
};

export const LOCAL_SERVICES: LocalService[] = [
  { id: 'plumbing', label: 'Plumbers', group: 'home', trades: ['plumber', 'drain cleaning', 'water heaters'], peak: [11, 12, 1, 2], match: ['plumber', 'plumbing', 'drain'],
    tip: 'Ask whether the job needs a City of Calgary permit and who pulls it. Frozen pipes are a January call, so know where your main shut-off is.' },
  { id: 'electrical', label: 'Electricians', group: 'home', trades: ['electrician', 'panel upgrades', 'EV chargers'], peak: [], match: ['electrician', 'electrical'],
    tip: 'Most wiring work needs a City permit. A licensed electrician can pull it for you; ask for it in the quote.' },
  { id: 'heating', label: 'Furnace and AC', group: 'home', trades: ['furnace repair', 'HVAC', 'AC installs'], peak: [9, 10, 11, 6, 7], match: ['furnace', 'hvac', 'heating', 'air conditioning'],
    tip: 'Book a furnace check in September or October, before the first cold snap fills every schedule in the city.' },
  { id: 'roofing', label: 'Roofers and eavestroughs', group: 'home', trades: ['roofer', 'eavestroughs', 'hail repair'], peak: [6, 7, 8, 9], match: ['roofing', 'roofer', 'eavestrough'],
    tip: 'Calgary sits in hail alley. After a big storm, check your insurer’s process first and be wary of crews knocking door to door.' },
  { id: 'handyman', label: 'Handyman', group: 'home', trades: ['handyman', 'small repairs', 'assembly'], peak: [], match: ['handyman', 'repairs'],
    tip: 'Paying a deposit? In Alberta, a contractor who takes money before the work is done needs a prepaid contracting licence. Ask for the number.' },
  { id: 'cleaning', label: 'House cleaning', group: 'home', trades: ['house cleaner', 'carpet cleaning', 'move-out cleans'], peak: [4, 5], match: ['cleaning', 'cleaner'],
    tip: 'Ask what’s included and whether the cleaners are insured and bonded, especially for move-out cleans.' },
  { id: 'pest', label: 'Pest control', group: 'home', trades: ['pest control', 'wasps', 'mice'], peak: [5, 6, 7, 8, 10], match: ['pest control', 'exterminator'],
    tip: 'Alberta is famously rat-free and keeps it that way. If you ever see a rat, report it to 310-RATS.' },
  { id: 'appliances', label: 'Appliance repair', group: 'home', trades: ['appliance repair', 'washers', 'fridges'], peak: [], match: ['appliance repair', 'appliances'],
    tip: 'Have the model number from the sticker inside the door ready. It saves a second visit for parts.' },
  { id: 'locksmith', label: 'Locksmiths', group: 'home', trades: ['locksmith', 'rekeying', 'lockouts'], peak: [], match: ['locksmith'],
    tip: 'Moved in? Rekeying is usually cheaper than new locks, and you know exactly who has a key.' },
  { id: 'snow', label: 'Snow removal', group: 'outdoor', trades: ['snow removal', 'sidewalk clearing'], peak: [10, 11, 12, 1, 2, 3, 4], match: ['snow removal', 'snow'],
    tip: 'Calgary’s bylaw gives you 24 hours after the snow stops to clear your sidewalk. A seasonal contract is booked in the fall.' },
  { id: 'yard', label: 'Lawn and yard', group: 'outdoor', trades: ['lawn care', 'aeration', 'tree trimming'], peak: [4, 5, 6, 9], match: ['lawn', 'landscaping', 'yard', 'tree'],
    tip: 'Spring aeration and fall cleanup book up first. Ask whether yard waste is hauled away or left for your green cart.' },
  { id: 'fencing', label: 'Fences and decks', group: 'outdoor', trades: ['fence builder', 'decks', 'concrete'], peak: [5, 6, 7, 8], match: ['fence', 'deck', 'concrete'],
    tip: 'Before any post hole, request a free utility locate through Click Before You Dig. It takes a few days, so ask early.' },
  { id: 'mechanic', label: 'Mechanics', group: 'car', trades: ['mechanic', 'brakes', 'inspections'], peak: [], match: ['mechanic', 'auto repair', 'garage'],
    tip: 'Ask for a written estimate and to see the old parts. A good shop will explain what can wait.' },
  { id: 'tires', label: 'Tire swaps', group: 'car', trades: ['tire shop', 'winter tires', 'storage'], peak: [10, 11, 4], match: ['tires', 'tire'],
    tip: 'Winter tires aren’t required in Alberta, but most Calgarians swap in October. Book before the first snow, not after.' },
  { id: 'glass', label: 'Windshields', group: 'car', trades: ['auto glass', 'chip repair'], peak: [3, 4, 5], match: ['auto glass', 'windshield'],
    tip: 'Spring gravel chips a lot of windshields. A small chip fixed early often avoids a full replacement.' },
  { id: 'tailoring', label: 'Tailors and dry cleaners', group: 'everyday', trades: ['tailor', 'alterations', 'dry cleaning'], peak: [], match: ['tailor', 'alterations', 'dry cleaning'],
    tip: 'Bring the shoes you’ll wear when getting pants hemmed. It’s the most common redo.' },
  { id: 'repair', label: 'Shoe, bike and phone repair', group: 'everyday', trades: ['shoe repair', 'bike tune-ups', 'phone screens'], peak: [3, 4, 5], match: ['shoe repair', 'bike repair', 'bike shop', 'phone repair'],
    tip: 'Bike shops are busiest on the first warm weekend. A March tune-up gets your bike back in days, not weeks.' },
  { id: 'pets', label: 'Groomers and vets', group: 'everyday', trades: ['dog groomer', 'vet clinic', 'dog walker'], peak: [], match: ['groomer', 'veterinary', 'vet', 'dog walker', 'pet'],
    tip: 'In Calgary, cats and dogs over three months old need a City pet licence. Your vet can remind you when it’s due.' },
];

export const SERVICE_IDS = new Set(LOCAL_SERVICES.map(s => s.id));
export const serviceById = (id: string) => LOCAL_SERVICES.find(s => s.id === id);

/** True when a Local listing offers this service, by its tags or services. */
export function offersService(entity: { tags?: string[]; services?: string[] }, service: LocalService): boolean {
  const words = [...(entity.tags ?? []), ...(entity.services ?? [])].map(w => w.toLowerCase());
  return service.match.some(m => words.some(w => w === m || w.includes(m)));
}

export function inPeak(service: LocalService, month: number): boolean {
  return service.peak.includes(month);
}
