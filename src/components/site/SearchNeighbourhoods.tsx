import { useId, useState } from 'react';
import { ArrowRight, Compass, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BOW, ELBOW } from '../community/CityMap';

const PLACES = [
  { name: 'Kensington', lat: 51.053, lng: -114.091, image: 'kensington', description: 'Start around Hillhurst and Sunnyside. Search for places to visit and recent reports from the area.' },
  { name: 'Beltline', lat: 51.041, lng: -114.073, image: 'beltline', description: 'Start around 17 Avenue SW. Search for local events, places and recent neighbourhood reports.' },
  { name: 'Inglewood', lat: 51.037, lng: -114.025, image: 'inglewood', description: 'Follow the Bow east of downtown. Search for listings and neighbourhood reports around Inglewood.' },
] as const;

const x = (lng: number) => (lng + 114.12) / .12 * 400;
const y = (lat: number) => (51.078 - lat) / .064 * 240;
const path = (points: readonly (readonly [number, number])[]) =>
  points.map(([lat, lng], index) => (index ? 'L' : 'M') + x(lng).toFixed(1) + ',' + y(lat).toFixed(1)).join(' ');

export function SearchNeighbourhoods() {
  const gridId = useId();
  const [active, setActive] = useState(0);
  const place = PLACES[active];

  return (
    <section className="sx-atlas bp-section" aria-labelledby="sx-atlas-title">
      <div className="bp-head"><h2 id="sx-atlas-title">Follow the Bow</h2></div>
      <div className="sx-atlas-board">
        <div className="sx-atlas-map">
          <svg viewBox="0 0 400 240" preserveAspectRatio="none" aria-hidden="true">
            <defs><pattern id={gridId} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)"><path d="M18 0H0V18" fill="none" stroke="#214667" /></pattern></defs>
            <rect width="400" height="240" fill={'url(#' + gridId + ')'} />
            <path d={path(ELBOW)} className="sx-atlas-elbow" />
            <path d={path(BOW)} className="sx-atlas-river" />
            <path key={place.name} d={path([[51.053, -114.091], [51.048, -114.08], [place.lat, place.lng]])} pathLength="1" className="sx-atlas-route" />
            <text x="18" y="30" className="sx-atlas-water-label">BOW RIVER</text>
          </svg>
          <span className="sx-atlas-compass" aria-hidden="true"><Compass size={22} /> N</span>
          <div role="group" aria-label="Choose a neighbourhood">
            {PLACES.map((item, index) => (
              <button key={item.name} type="button" className="sx-atlas-pin" aria-pressed={index === active}
                style={{ left: x(item.lng) / 4 + '%', top: y(item.lat) / 2.4 + '%' }} onClick={() => setActive(index)}>
                <MapPin size={17} aria-hidden="true" /><span>{item.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="sx-atlas-story" aria-live="polite">
          <div className="sx-atlas-photo" key={place.image}>
            <img src={'/images/hero/search-atlas-' + place.image + '.webp'} width={560} height={290} loading="lazy" decoding="async" alt="" />
          </div>
          <div className="sx-atlas-copy">
            <h3>{place.name}</h3>
            <p>{place.description}</p>
            <Link to={'/search?q=' + encodeURIComponent(place.name)}>Search {place.name}<ArrowRight size={17} aria-hidden="true" /></Link>
          </div>
        </div>
      </div>
    </section>
  );
}
