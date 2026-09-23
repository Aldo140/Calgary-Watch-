import { Link } from 'react-router-dom';
import { ArrowUpRight, Compass, Radio } from 'lucide-react';

/** Shared visual bridge between discovery and the existing community experience. */
export function CommunityWelcome() {
  return <section className="cw-community-welcome" aria-labelledby="cw-community-welcome-title">
    <div className="cw-community-picture"><img src="/images/illustration/calgarywatch-community-v1.webp" alt="Neighbours, gardens and bicycles on a sunny Calgary street" width="1536" height="1024" loading="lazy" /><span aria-hidden="true">HELLO, NEIGHBOUR ✦</span></div>
    <div className="cw-community-welcome-copy"><p className="cw-eyebrow">Same city. A little more connected.</p><h2 id="cw-community-welcome-title">The neighbourhood<br />looks good on you.</h2><p>Welcome to the community side of CalgaryWatch. See what’s changing nearby, share what you notice, and get to know the city a little better.</p><div><Link to="/map" className="cw-button"><Radio size={17} />Open the live map<ArrowUpRight size={17} /></Link><Link to="/" className="cw-text-link"><Compass size={17} />Back to city discoveries</Link></div></div>
  </section>;
}
