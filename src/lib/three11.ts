import type { IncidentCategory } from '../types';

/**
 * Map category for a Calgary 311 service_name seen by the map's live 311 read,
 * or null to leave it off the map.
 *
 * A 311 row proves only that a resident filed a service request. Real
 * emergencies go to 911, so nothing from 311 is ever classed as `emergency`:
 * "CFD - Fire Code and General Inquiries" contains "fire", and loose matching
 * used to put questions about the fire code on the map as emergencies.
 */
const SKIP = [
  'tree', 'shrub', 'waste', 'recycling', 'grass', 'weeds', 'license', 'licence', 'tax', 'cart', 'backlane',
  'contact us', 'feedback', 'compliment', 'missed collection', 'water main', 'watermain', 'water break',
  // Questions, not incidents — "inquir" covers inquiry, inquiries and inquire.
  'inquir', 'enquir', 'general information', 'fire code', 'permit',
];

export function classify311Service(serviceName: string | undefined): IncidentCategory | null {
  const name = (serviceName || '').toLowerCase();
  if (!name || SKIP.some(word => name.includes(word))) return null;

  let category: IncidentCategory = 'infrastructure';
  if (/road|traffic|pothole|pavement|sidewalk|signal/.test(name)) category = 'traffic';
  if (/snow|\bice\b|drain|spill|water|flood/.test(name)) category = 'weather';
  if (/bylaw|disturbance|noise|graffiti/.test(name)) category = 'crime';
  // Hazards are still worth showing, but as conditions to know about, not emergencies.
  if (/hazard|danger|fire/.test(name)) category = 'infrastructure';

  // Traffic comes from the dedicated traffic and 511 feeds instead.
  return category === 'traffic' ? null : category;
}
