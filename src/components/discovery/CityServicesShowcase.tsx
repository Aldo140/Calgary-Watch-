import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Compass, Mail, Radio, Users } from 'lucide-react';

const SERVICES = [
  { id: 'explore', label: 'Make a day of it', icon: Compass, eyebrow: 'A little curiosity goes a long way', title: 'Your next favourite thing is out there.', description: 'Markets, neighbourhood walks and something good to eat. Follow your curiosity around Calgary.', image: '/images/hero/calgarywatch-city-guide-v1.webp', alt: 'Paper collage of Calgary, the river, a market and a cyclist', to: '/neighbourhoods', action: 'Explore your city', note: 'Take the scenic route', chips: ['Markets', 'Local places', 'Neighbourhoods'] },
  { id: 'watch', label: 'Check your surroundings', icon: Radio, eyebrow: 'Before you head out', title: 'A little heads-up. A smoother day.', description: 'See community reports, traffic, weather and outages on the live map. Check the source and time for the full picture.', image: '/images/hero/calgarywatch-live-watch-v1.webp', alt: 'Illustrated Calgary at night with map markers and radar rings', to: '/map', action: 'Open the live map', note: 'Know before you go', chips: ['Traffic', 'Weather', 'Outages'] },
  { id: 'community', label: 'Meet your community', icon: Users, eyebrow: 'The people make the place', title: 'Good neighbours make a great city.', description: 'Notice something nearby? Learn how to share a report, add useful context and help your neighbours stay informed.', image: '/images/illustration/calgarywatch-community-v1.webp', alt: 'Neighbours gathering on a sunny Calgary street with gardens and bicycles', to: '/community', action: 'Meet Community Watch', note: 'A little closer to home', chips: ['See it', 'Share it', 'Stay connected'] },
  { id: 'brief', label: 'Stay in the loop', icon: Mail, eyebrow: 'Your city. A little closer.', title: 'Local knowledge, delivered.', description: 'Choose the weekly community brief in your email preferences. Weekend picks and local discoveries are coming next.', image: '/images/illustration/calgarywatch-brief-v1.webp', alt: 'A miniature paper Calgary emerging from an open envelope', to: '/map?settings=alerts', action: 'Choose your email preferences', note: 'A little local knowledge', chips: ['Community brief', 'Free to join', 'Your preferences'] },
] as const;

export function CityServicesShowcase() {
  const [active, setActive] = useState(0);
  const service = SERVICES[active];
  return <section className="cw-fieldguide" aria-labelledby="cw-fieldguide-title">
    <div className="cw-wrap">
      <div className="cw-fieldguide-heading"><div><p className="cw-eyebrow">Your everyday Calgary companion</p><h2 id="cw-fieldguide-title">More city.<br /><em>Less searching.</em></h2></div><p>For the plans you make.<br /> And the things you didn’t see coming.</p></div>
      <div className="cw-fieldguide-select" role="group" aria-label="Explore CalgaryWatch services">
        {SERVICES.map((item, i) => <button type="button" key={item.id} aria-pressed={active === i} aria-controls="cw-service-story" onClick={() => setActive(i)}><item.icon size={18} /><span>{item.label}</span><small>0{i + 1}</small></button>)}
      </div>
      <div className={`cw-fieldguide-story cw-fieldguide-${service.id}`} id="cw-service-story">
        <div className="cw-fieldguide-art" key={service.image}>
          <img src={service.image} alt={service.alt} width="1536" height="1024" loading="lazy" />
          <span className="cw-fieldguide-sticker" aria-hidden="true">Made for<br /><b>YOUR<br />CALGARY</b><span>✦</span></span>
          <div className="cw-fieldguide-postmark" aria-hidden="true"><service.icon size={18} />{service.note}</div>
          <span className="cw-fieldguide-orbit" aria-hidden="true" />
        </div>
        <div className="cw-fieldguide-copy" aria-live="polite" aria-atomic="true"><span className="cw-fieldguide-number" aria-hidden="true">0{active + 1}</span><p className="cw-eyebrow">{service.eyebrow}</p><h3>{service.title}</h3><p>{service.description}</p><div className="cw-fieldguide-chips">{service.chips.map(chip => <span key={chip}>{chip}</span>)}</div><Link className="cw-button" to={service.to}>{service.action}<ArrowUpRight size={18} /></Link></div>
      </div>
    </div>
  </section>;
}
