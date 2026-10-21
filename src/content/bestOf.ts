// /best: "Best ___ in Calgary" lists. An experiment (2026-10-21) to answer the
// searches people already make ("best pho calgary", "junk removal calgary")
// without inventing anything. Every fact on a place carries the source it came
// from. The order comes only from who else has named a place (independent,
// citable guides and awards), never from our own visits, reviews or payment.
// Home services have no such guides yet, so they're listed A–Z with what each
// company says about itself, and say so.

export interface BestSource {
  id: string;
  /** Who published it, e.g. "Daily Hive". Counted once per publisher. */
  publisher: string;
  title: string;
  url: string;
  /** ISO date or year-month, as precise as the source gives. */
  published: string;
}

export interface BestFact {
  text: string;
  /** A BestSource id, or the company's own website when `self` is set. */
  source: string;
  /** The company said this about itself. */
  self?: boolean;
}

export interface BestPlace {
  name: string;
  /** Neighbourhood or part of the city, only where the source gives it. */
  area?: string;
  /** Street address exactly as published by a source; omitted when unsure. */
  address?: string;
  website?: string;
  /** Guides and awards that recommend it (BestSource ids). Drives the order. */
  namedBy: string[];
  facts: BestFact[];
  /** Set from an approved claim, once one exists. Sorts first, never bought. */
  verified?: boolean;
}

export type BestKind = 'food' | 'service';

export interface BestCategory {
  slug: string;
  kind: BestKind;
  /** The thing, in a sentence: "pho", "window cleaning". */
  noun: string;
  /** Short label for chips and covers. */
  label: string;
  /** Big word on the cover art. */
  coverWord: string;
  motif: 'bowl' | 'slice' | 'window' | 'truck';
  /** Cover gradient. */
  from: string;
  to: string;
  ink: string;
  /** schema.org type for each place. */
  schemaType: 'Restaurant' | 'LocalBusiness';
  cuisine?: string;
  lead: string;
  seoTitle: string;
  seoDescription: string;
  /** Words that bring a search to this list. Matched on whole words. */
  keywords: string[];
  places: BestPlace[];
  /** Plain, true advice for choosing. No claims about any one place. */
  tips: string[];
  updated: string;
}

export const BEST_SOURCES: BestSource[] = [
  { id: 'dh-pho-2026', publisher: 'Daily Hive', title: 'Best pho restaurants in Calgary that you need to try at least once', url: 'https://dailyhive.com/calgary/best-pho-calgary-2026', published: '2026-01-21' },
  { id: 'dh-pho-2024', publisher: 'Daily Hive', title: 'Best pho restaurants in Calgary you need to try at least once', url: 'https://dailyhive.com/calgary/best-pho-calgary-2024', published: '2024' },
  { id: 'dh-pho-pham-2026', publisher: 'Daily Hive', title: 'Family-owned Vietnamese restaurant opens brand-new Calgary location', url: 'https://dailyhive.com/calgary/pho-pham-chinatown-open-calgary', published: '2026-06' },
  { id: 'dh-pizza-2026', publisher: 'Daily Hive', title: '12 Calgary restaurants that serve some of the best pizza in the city', url: 'https://dailyhive.com/calgary/best-pizza-calgary-2026', published: '2026-10' },
  { id: 'avenue-best-2026', publisher: 'Avenue Calgary', title: 'Avenue’s 13 Best Restaurants 2026', url: 'https://www.avenuecalgary.com/best-restaurants-calgary/avenue-13-best-restaurants-2026/', published: '2026' },
  { id: 'avenue-una-2021', publisher: 'Avenue Calgary', title: 'Best Restaurants 2021: Una Pizza + Wine', url: 'https://www.avenuecalgary.com/best-restaurants-calgary-2021/una-pizza-and-wine/', published: '2021' },
  { id: 'top-pizza-2026', publisher: '50 Top Pizza', title: '50 Top Pizza world ranking 2026, as reported by Daily Hive', url: 'https://dailyhive.com/calgary/pizza-culture-calgary-top-100-pizzerias-2026', published: '2026' },
];

const PHO: BestCategory = {
  slug: 'pho', kind: 'food', noun: 'pho', label: 'Pho', coverWord: 'Phở', motif: 'bowl',
  from: '#7a2e12', to: '#f2a541', ink: '#fff7e6', schemaType: 'Restaurant', cuisine: 'Vietnamese',
  lead: 'The pho spots Calgary’s food writers keep naming, with what each one is known for and where to find it.',
  seoTitle: 'Best Pho in Calgary (2026): Where Food Writers Send You | CalgaryWatch',
  seoDescription: 'Calgary pho spots named in 2026 food guides, from Forest Lawn’s 17 Ave SE to the Beltline: what each is known for, addresses and the source for every fact. Never paid for.',
  keywords: ['pho', 'phở', 'vietnamese', 'noodle soup', 'pho soup'],
  updated: '2026-10-21',
  places: [
    { name: 'Hà Tiên', area: 'SW', address: '#10 11225 30 St SW', namedBy: ['dh-pho-2026'], facts: [{ text: 'Pho with brisket, tripe and seafood as well as the usual chicken and beef.', source: 'dh-pho-2026' }] },
    { name: 'Mot To', area: 'Crescent Heights', address: '1609 Centre St NW', namedBy: ['dh-pho-2026'], facts: [{ text: 'From the team behind Pho Dau Bo: traditional Vietnamese dishes with modern twists.', source: 'dh-pho-2026' }] },
    { name: 'Pho 26', area: 'Forest Lawn', address: '4019 17 Ave SE', namedBy: ['dh-pho-2026'], facts: [{ text: 'Named for its broth: 26 ingredients, starting with water, beef, bone, salt, pepper and sugar.', source: 'dh-pho-2026' }] },
    { name: 'Pho Dau Bo', area: 'Forest Lawn', address: '#110 4909 17 Ave SE', namedBy: ['dh-pho-2026', 'dh-pho-2024'], facts: [{ text: 'Known for its sate pho, with chicken, beef or seafood. The broth cooks for 16 hours.', source: 'dh-pho-2026' }] },
    { name: 'Pho Pham', area: 'Signal Hill, University District and Chinatown', namedBy: ['dh-pho-2024'], facts: [{ text: 'Beef pho is the specialty: steak, brisket, meatballs, tendon and more.', source: 'dh-pho-pham-2026' }, { text: 'Opened a third location, in Chinatown, in June 2026.', source: 'dh-pho-pham-2026' }] },
    { name: 'Pho Thanh', area: 'NE', address: '6630 4 St NE', namedBy: ['dh-pho-2026'], facts: [] },
    { name: 'Pure Street Food', area: 'Beltline', address: '1327 1 St SW', namedBy: ['dh-pho-2026'], facts: [{ text: 'Both beef and chicken pho.', source: 'dh-pho-2026' }] },
  ],
  tips: [
    'Sate (satay) pho is a spicy, peanutty broth. Pho Dau Bo is known for it; ask how hot it runs before you order.',
    'Two of these are on 17 Ave SE in Forest Lawn, the stretch called International Avenue, so one trip can cover both.',
    'Hours vary and some spots close one day a week. Check before you cross town.',
  ],
};

const PIZZA: BestCategory = {
  slug: 'pizza', kind: 'food', noun: 'pizza', label: 'Pizza', coverWord: 'Pizza', motif: 'slice',
  from: '#b3121b', to: '#ff7a3d', ink: '#fff4e0', schemaType: 'Restaurant', cuisine: 'Pizza',
  lead: 'New York, Neapolitan, Roman, Detroit and Greek: the Calgary pizzerias that food writers and award lists name, most-named first.',
  seoTitle: 'Best Pizza in Calgary (2026): The Most-Named Pizzerias | CalgaryWatch',
  seoDescription: 'Calgary pizzerias ranked by how many independent guides and awards name them: Noble Pie, Pizza Culture, Una and more, with styles, addresses and a source for every fact.',
  keywords: ['pizza', 'pizzeria', 'pizzas', 'slice', 'neapolitan', 'detroit style'],
  updated: '2026-10-21',
  places: [
    { name: 'Noble Pie', area: 'Beltline', address: '720 11 Ave SW', namedBy: ['dh-pizza-2026', 'avenue-best-2026'], facts: [{ text: 'Big New York-style pies, through a back-alley entrance. Lines get long, so get on the waitlist early.', source: 'dh-pizza-2026' }, { text: 'On Avenue’s 13 Best Restaurants list for 2026.', source: 'avenue-best-2026' }] },
    { name: 'Pizza Culture', area: 'Edmonton Trail NE', address: '1114 Edmonton Trail NE', namedBy: ['dh-pizza-2026', 'top-pizza-2026'], facts: [{ text: 'Neapolitan-style. No. 80 on the 2026 50 Top Pizza world list, and the only Canadian pizzeria on it.', source: 'top-pizza-2026' }] },
    { name: 'Una Pizza + Wine', area: '17 Ave SW, plus other locations', namedBy: ['dh-pizza-2026', 'avenue-una-2021'], facts: [{ text: 'Thin-crust, California-style pies. The 4-Maggi, with truffle honey, is the one people order.', source: 'avenue-una-2021' }] },
    { name: 'Acme Pizza Co.', namedBy: ['dh-pizza-2026'], facts: [{ text: 'An extra-crispy crust and a long list of toppings.', source: 'dh-pizza-2026' }] },
    { name: 'Actually Pretty Good', namedBy: ['dh-pizza-2026'], facts: [{ text: 'From the team behind Our Daily Brett: pizza with natural wine and beer.', source: 'dh-pizza-2026' }] },
    { name: 'Cold Beer & Pizza', area: '17 Ave SW', address: '1019 17 Ave SW', namedBy: ['dh-pizza-2026'], facts: [{ text: 'Roman-style pizza by the slice, plus half-metre and metre-long pies to share.', source: 'dh-pizza-2026' }] },
    { name: 'Connie & John’s', area: 'Three take-out locations', namedBy: ['dh-pizza-2026'], facts: [{ text: 'New York- or Detroit-style pies.', source: 'dh-pizza-2026' }] },
    { name: 'Letty', area: 'Beltline', address: '247 12 Ave SE', namedBy: ['dh-pizza-2026'], facts: [{ text: 'Neapolitan-style, with classics and odd ones: satay chicken, elote, everything bagel.', source: 'dh-pizza-2026' }] },
    { name: 'Nikos Pizza', area: 'Including a newer Bridlewood location', namedBy: ['dh-pizza-2026'], facts: [{ text: 'Greek-style, cheesy pies.', source: 'dh-pizza-2026' }] },
    { name: 'Pizza Face', area: '17 Ave SW', address: '1103 17 Ave SW', namedBy: ['dh-pizza-2026'], facts: [{ text: 'From the team behind DOPO and Penny Crown. Sandwiches too.', source: 'dh-pizza-2026' }] },
    { name: 'Portland Street Pizza', area: 'Inside Eighty-Eight Brewing’s taproom', namedBy: ['dh-pizza-2026'], facts: [{ text: 'Square, pillowy pies.', source: 'dh-pizza-2026' }] },
    { name: 'Sinatras Pizzeria', area: 'Killarney and West Hillhurst', namedBy: ['dh-pizza-2026'], facts: [{ text: 'Huge New York-style pies, and pizza by the slice.', source: 'dh-pizza-2026' }] },
  ],
  tips: [
    'Know the style you want: New York (big, foldable slices), Neapolitan (soft, blistered, wood-fired), Roman (by the slice, crisp), Detroit (square, crispy cheese edges).',
    'Three are on 17 Ave SW (Una, Cold Beer & Pizza and Pizza Face), close enough to compare slices in one evening.',
  ],
};

const WINDOWS: BestCategory = {
  slug: 'window-cleaning', kind: 'service', noun: 'window cleaning', label: 'Window cleaning', coverWord: 'Windows', motif: 'window',
  from: '#0b4f9e', to: '#5fd3f3', ink: '#f0fbff', schemaType: 'LocalBusiness',
  lead: 'Calgary window cleaners that publish their services and service area. No one has ranked these yet, so they’re A–Z, with what each says about itself.',
  seoTitle: 'Window Cleaning in Calgary: Local Companies Compared | CalgaryWatch',
  seoDescription: 'Calgary window cleaning companies side by side: who does inside, outside, gutters and acreages, and what to ask before you book. Listed A–Z, never paid for.',
  keywords: ['window cleaning', 'window cleaner', 'window cleaners', 'window washing', 'window washer', 'windows cleaned', 'clean windows'],
  updated: '2026-10-21',
  places: [
    { name: 'Bristol Window Cleaning', website: 'https://bristolwindowcleaning.ca/', namedBy: [], facts: [{ text: 'Says it specializes in large houses, acreages, walkouts and high, hard-to-reach windows. Also gutters and pressure washing.', source: 'https://bristolwindowcleaning.ca/', self: true }] },
    { name: 'Canadian Property Stars', website: 'https://www.canadianpropertystars.com/window-cleaning-calgary.php', namedBy: [], facts: [{ text: 'Says it has served Calgary for more than 10 years and cleans from the ground with telescopic poles rather than ladders.', source: 'https://www.canadianpropertystars.com/window-cleaning-calgary.php', self: true }] },
    { name: 'Elite Window Cleaning of Calgary', website: 'https://elitewindowcleaning.ca/calgary/', namedBy: [], facts: [{ text: 'Residential window cleaning with an online quote calculator. Also serves Airdrie, Okotoks and Chestermere.', source: 'https://elitewindowcleaning.ca/calgary/', self: true }] },
    { name: 'Pro Window Cleaning Calgary', website: 'https://prowindowcleaningcalgary.ca/', namedBy: [], facts: [{ text: 'Homes and businesses, plus gutter cleaning and pressure washing. Says its crews are fully insured.', source: 'https://prowindowcleaningcalgary.ca/', self: true }] },
    { name: 'Squeaky D', website: 'https://squeakyd.ca/', namedBy: [], facts: [{ text: 'Says it is locally owned with more than 10 years in Calgary. Also gutter cleaning and house washing.', source: 'https://squeakyd.ca/', self: true }] },
    { name: 'WonderWash', website: 'https://wonderwindowwashing.ca/', namedBy: [], facts: [{ text: 'Focuses on interior window cleaning for Calgary homes, and says it protects floors while it works.', source: 'https://wonderwindowwashing.ca/', self: true }] },
  ],
  tips: [
    'Ask whether the price covers inside, outside, screens and tracks, or only the outside glass.',
    'For anyone working at height, ask for proof of liability insurance and a WCB Alberta clearance letter. Both are standard requests.',
    'Get a written quote. Prices depend on window count, storeys and access, so phone estimates vary.',
  ],
};

const JUNK: BestCategory = {
  slug: 'junk-removal', kind: 'service', noun: 'junk removal', label: 'Junk removal', coverWord: 'Junk', motif: 'truck',
  from: '#1f5f2c', to: '#b8e04a', ink: '#f6ffe8', schemaType: 'LocalBusiness',
  lead: 'Calgary junk haulers that publish what they take and how they work. Nobody has ranked these yet, so they’re A–Z, in their own words.',
  seoTitle: 'Junk Removal in Calgary: Local Haulers Compared | CalgaryWatch',
  seoDescription: 'Calgary junk removal companies side by side: estate cleanouts, hot tubs, same-day pickup, donation and recycling, plus what to ask before you book. Listed A–Z, never paid for.',
  keywords: ['junk removal', 'junk', 'junk hauling', 'rubbish removal', 'garbage removal', 'haul away', 'dump run', 'estate cleanout'],
  updated: '2026-10-21',
  places: [
    { name: 'All In Junk', website: 'https://allinjunk.ca/', namedBy: [], facts: [{ text: 'Says it is locally owned and operated. Also estate cleanouts and dirt removal.', source: 'https://allinjunk.ca/', self: true }] },
    { name: 'Junk Direct', website: 'https://junkdirect.ca/', namedBy: [], facts: [{ text: 'Advertises same-day service and no hidden fees.', source: 'https://junkdirect.ca/', self: true }] },
    { name: 'The Junk Man', website: 'https://www.calgaryjunkman.com/', namedBy: [], facts: [{ text: 'Publishes a starting price per load on its site.', source: 'https://www.calgaryjunkman.com/', self: true }] },
    { name: 'The Junk Movement', website: 'https://thejunkremovalmovement.ca/', namedBy: [], facts: [{ text: 'Says it gives a quote before any work starts. Serves Calgary and surrounding areas.', source: 'https://thejunkremovalmovement.ca/', self: true }] },
    { name: 'The Junk People', website: 'https://www.thejunkpeople.ca/', namedBy: [], facts: [{ text: 'Says it is family-owned. Lists hot tubs, sheds and estate cleanouts among its jobs.', source: 'https://www.thejunkpeople.ca/', self: true }] },
    { name: 'YYC Junk Removal', website: 'https://yycjunkremoval.ca/', namedBy: [], facts: [{ text: 'Focuses on donating and recycling what it hauls. Doesn’t take cash.', source: 'https://yycjunkremoval.ca/', self: true }] },
  ],
  tips: [
    'Ask where it goes. Haulers that donate and recycle will tell you; the rest goes to a City of Calgary landfill, which charges by weight.',
    'Pricing is usually by how much of the truck you fill. Ask for the price per load before they start, not after.',
    'Small jobs can be cheaper to do yourself: the City’s landfills and throw ’n’ go sites take household loads.',
  ],
};

export const BEST_CATEGORIES: BestCategory[] = [PHO, PIZZA, WINDOWS, JUNK];
