import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Play } from 'lucide-react';
import { useCrimeStats } from '../../hooks/useCrimeStats';
import { buildRankings, searchCommunities } from '../../lib/communityRank';
import { Cover, useShapes } from './Cover';
import { CommunityPicker, PATH, shuffled } from './shared';
import '../../styles/check-community.css';

/**
 * The Check your community game, folded into the Neighbourhoods pages: a dark
 * band with search and a shelf of covers that open the full experience. Given
 * `focus` (a neighbourhood page's title), it leads with that community's cover.
 */
export default function RankStrip({ focus }: { focus?: string }) {
  const { stats, yearlyStats } = useCrimeStats();
  const rankings = useMemo(() => buildRankings(stats, yearlyStats), [stats, yearlyStats]);
  const shapes = useShapes();
  const navigate = useNavigate();
  const mine = focus ? searchCommunities(rankings, focus, 1)[0] : undefined;
  const shelf = useMemo(() => shuffled(rankings).filter((r) => r.key !== mine?.key).slice(0, mine ? 4 : 6), [rankings, mine]);
  if (!rankings.length) return null;
  const go = (slug: string) => navigate(`${PATH}?c=${slug}`);

  return (
    <section className="cyc cyc-strip" aria-labelledby="cyc-strip-title">
      <div className="cyc-strip-text">
        <p className="cyc-head-type"><span className="cyc-live" aria-hidden="true" /> Community awareness · {rankings[0].year}</p>
        <h2 id="cyc-strip-title">{mine ? <>Where does <span>{mine.name}</span> rank?</> : <>How does your neighbourhood <span>rank?</span></>}</h2>
        <p className="cyc-strip-lead">{rankings.length} Calgary communities, ranked by what neighbours reported to the City this year. Guess yours, then see how it compares.</p>
        <CommunityPicker rankings={rankings} onPick={(r) => go(r.slug)} placeholder="Find your community" hint="Guess it" className="is-strip" />
        <Link to={`${PATH}?play=1`} className="cyc-strip-play">
          <span className="cyc-play-btn" aria-hidden="true"><Play size={18} fill="currentColor" /></span>
          Play Higher or Lower <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <ul className="cyc-strip-covers">
        {mine && (
          <li className="is-mine">
            <Link to={`${PATH}?c=${mine.slug}`} className="cyc-card">
              <Cover r={mine} shape={shapes.get(mine.key)} label="?" />
              <b>{mine.name}</b>
              <small>Guess its rank</small>
            </Link>
          </li>
        )}
        {shelf.map((r) => (
          <li key={r.key}>
            <Link to={`${PATH}?c=${r.slug}`} className="cyc-card">
              <Cover r={r} shape={shapes.get(r.key)} label="?" />
              <b>{r.name}</b>
              <small>Guess its rank</small>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
