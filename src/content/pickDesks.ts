// Companies on a Pick desk that has no Best of Calgary list (docs/cw-picks.md).
// Same rules as src/content/bestOf.ts: every fact is the company's own words
// from its own site (self: true), phone numbers as the company publishes them,
// A–Z on the desk, never paid for. Add a company only after reading its site.
import type { BestPlace } from './bestOf';

export interface DeskList {
  /** When the facts were last read off each company's site. */
  checked: string;
  places: BestPlace[];
}

export const DESK_COMPANIES: Partial<Record<string, DeskList>> = {
  heating: {
    checked: '2026-11-12',
    places: [
      { name: 'Action Furnace', website: 'https://actionfurnace.ca/', phone: '403-288-4004', address: '925 26 St NE', namedBy: [], facts: [
        { text: 'Says it has served Albertans since 1975, with certified technicians for heating, cooling, duct cleaning and plumbing.', source: 'https://actionfurnace.ca/about/', self: true },
      ] },
      { name: 'Arpi’s Industries', website: 'https://www.arpis.com/', phone: '403-236-2444', address: '6815 40 St SE', namedBy: [], facts: [
        { text: 'Says it has served Calgary since 1963. Furnaces, boilers, heat pumps and water heaters, with NATE-certified technicians and an emergency line.', source: 'https://www.arpis.com/', self: true },
      ] },
      { name: 'DR Heat & Air', website: 'https://www.drheatandair.ca/', phone: '403-225-2077', address: '7060 Farrell Rd SE', namedBy: [], facts: [
        { text: 'Furnace and AC installs, repairs and maintenance, plus water heaters and heat pumps, for homes and businesses.', source: 'https://www.drheatandair.ca/', self: true },
      ] },
      { name: 'Fagnan’s Furnace Service', website: 'https://www.fagnansfurnace.ca/', phone: '403-272-0443', address: '5025 23 Ave SE', namedBy: [], facts: [
        { text: 'Says Calgary homeowners have trusted it since 1971, and that it is fully licensed, insured and bonded. A Carrier factory authorized dealer.', source: 'https://www.fagnansfurnace.ca/', self: true },
      ] },
      { name: 'Legacy Heating & Cooling', website: 'https://www.legacyheating.ca/', phone: '403-451-1337', address: '5830 51 St SE', namedBy: [], facts: [
        { text: 'Furnace, air conditioning and heat pump installs and repairs, with an after-hours no-heat emergency line available 24/7.', source: 'https://www.legacyheating.ca/', self: true },
      ] },
    ],
  },
  electrical: {
    checked: '2026-11-12',
    places: [
      { name: '4-Star Electric', website: 'https://www.4starelectric.com/', phone: '403-248-0037', address: '2333 18 Ave NE', namedBy: [], facts: [
        { text: 'Says it has served Calgary since 1989, open 24/7 for emergency electrical work. Panel upgrades, EV chargers and aluminum wiring replacement.', source: 'https://www.4starelectric.com/', self: true },
      ] },
      { name: 'CodeRad Electrical', website: 'https://www.coderadelectrical.com/', phone: '403-333-6344', address: '36 Cramond Cir SE', namedBy: [], facts: [
        { text: 'Residential and commercial electrical, smart upgrades, energy efficiency, design and inspections.', source: 'https://www.coderadelectrical.com/', self: true },
      ] },
      { name: 'Enerpro Electrical Services', website: 'https://enerproelectrical.ca/', phone: '403-254-0661', address: '6120 2 St SE', namedBy: [], facts: [
        { text: 'Says it is a licensed, insured Calgary electrician. Inspections, repairs, home automation, EV charging and fire alarm systems.', source: 'https://enerproelectrical.ca/', self: true },
      ] },
      { name: 'Rangeview Electrical & Contracting', website: 'https://rangeviewelectric.ca/', phone: '403-485-0204', area: 'Calgary, Okotoks and High River', namedBy: [], facts: [
        { text: 'Says its owner is a licensed master electrician and its journeymen are licensed in Alberta. Panel upgrades, aluminum wire remediation and EV chargers.', source: 'https://rangeviewelectric.ca/', self: true },
      ] },
      { name: 'Westland Electric', website: 'https://www.westland-electric.com/', phone: '403-255-5966', namedBy: [], facts: [
        { text: 'Says it has served Calgary since 1997. Residential, commercial and industrial work, including EV chargers and solar.', source: 'https://www.westland-electric.com/', self: true },
      ] },
    ],
  },
};
