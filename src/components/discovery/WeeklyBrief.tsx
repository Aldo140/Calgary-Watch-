import { Link } from 'react-router-dom';
import { ArrowUpRight, Mail } from 'lucide-react';

export function WeeklyBrief() {
  const highlights = [
    '✦ Top Weekend Picks & Shows',
    '✦ Farmers Market Schedules',
    '✦ River Flow & Pathway Closures',
    '✦ Your saved email preferences',
  ];

  return (
    <section className="cw-brief cw-brief-illustrated" aria-labelledby="cw-brief-title">
      <div className="cw-brief-art">
        <img 
          src="/images/illustration/calgarywatch-brief-v1.webp" 
          alt="Calgary skyline unfolding from a vintage paper aerogramme envelope" 
          width="1536" 
          height="1024" 
          loading="lazy" 
        />
        <div className="cw-brief-postmark" aria-hidden="true">
          <span>YYC AIRMAIL</span>
          <b>FREE WEEKLY</b>
        </div>
      </div>
      <div className="cw-brief-content">
        <div className="cw-brief-badge">
          <Mail size={13} />
          <span>CALGARY COMMUNITY DISPATCH</span>
        </div>
        <h2 id="cw-brief-title">
          A little local knowledge<br />
          <em>goes a very long way.</em>
        </h2>
        <p>
          Choose the weekly community brief in your CalgaryWatch email preferences. Weekend picks
          and local discovery coverage can grow as verified inventory becomes available.
        </p>
        <div className="cw-brief-highlights" aria-label="What's included in the brief">
          {highlights.map(h => (
            <span key={h} className="cw-brief-chip">{h}</span>
          ))}
        </div>
        <div className="cw-brief-cta-row">
          <Link className="cw-button cw-button-primary" to="/map?settings=alerts">
            Join the Weekly Brief <ArrowUpRight size={17} />
          </Link>
          <small className="cw-brief-reassurance">
            Free to join · Manage preferences anytime · One-click unsubscribe
          </small>
        </div>
      </div>
    </section>
  );
}
