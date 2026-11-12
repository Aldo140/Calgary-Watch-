import { useEffect, useState } from 'react';
import { CityMap } from '../safety/CityMap';

/*
 * The night city behind the brand-page hero: the same dot-matrix Calgary as
 * /safety, powering on from downtown, with a few neighbourhoods glowing cyan
 * and one at a time lit yellow. Decoration only (CityMap is aria-hidden);
 * reduced motion keeps it still on the first neighbourhood.
 */

const PLACES = ['Beltline', 'Kensington', 'Inglewood', 'Bridgeland', 'Bowness', 'Seton', 'Mission', 'Forest Lawn', 'Tuscany', 'Chinatown', 'Marlborough', 'Altadore'];

export function CityLights({ places = PLACES, every = 2800, tags = true }: { places?: string[]; every?: number; tags?: boolean }) {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let t = 0;
    // Start cycling after the city has powered on.
    const start = window.setTimeout(() => {
      t = window.setInterval(() => { if (!document.hidden) setK(i => (i + 1) % places.length); }, every);
    }, 1800);
    return () => { window.clearTimeout(start); window.clearInterval(t); };
  }, [places.length, every]);
  return <CityMap lit={places} focus={places[k]} className={`bp-city${tags ? '' : ' is-quiet'}`} />;
}
