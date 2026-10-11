import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../FirebaseProvider';
import { useCalmPopup } from '../../hooks/useCalmPopup';
import { opensGame, readNudgeDone, shouldShowRankNudge, writeNudgeDone } from '../../lib/rankNudge';
import { Notice } from './Notice';

/** Three dealt cover tiles, each a guess, in the homepage's colours. */
function Deck() {
  return (
    <svg viewBox="0 0 64 64">
      <g stroke="#151515" strokeWidth="2">
        <rect x="4" y="12" width="34" height="40" rx="6" fill="#00c2e0" transform="rotate(-10 21 32)" />
        <rect x="26" y="12" width="34" height="40" rx="6" fill="#1554d1" transform="rotate(9 43 32)" />
        <rect x="15" y="8" width="34" height="44" rx="6" fill="#06162f" />
      </g>
      <text x="32" y="40" textAnchor="middle" fill="#ffdf4f" style={{ font: '800 24px "Bricolage Grotesque", Inter, sans-serif' }}>?</text>
    </svg>
  );
}

/** A one-time card for signed-in readers announcing Check your community. */
export function RankNudge() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const uid = user?.uid;
  const [done, setDone] = useState(() => (uid ? readNudgeDone(uid) : true));

  useEffect(() => { setDone(uid ? readNudgeDone(uid) : true); }, [uid]);
  useEffect(() => {
    if (uid && opensGame(pathname)) { writeNudgeDone(uid); setDone(true); }
  }, [uid, pathname]);

  const eligible = !!uid && shouldShowRankNudge({ signedIn: true, pathname, done });
  const { open, leaving, close } = useCalmPopup('rank', eligible);
  if (!uid || !open || !eligible) return null;

  const first = user?.displayName?.split(' ')[0];

  return (
    <Notice
      tone="sun"
      labelId="cw-rnudge-title"
      eyebrow={`New for you${first ? `, ${first}` : ''}`}
      title={<>How does <em>your area</em> rank?</>}
      text="See what neighbours reported to the City this year and where yours lands. Guess first."
      points={['Takes a minute', 'Every community']}
      art={<Deck />}
      action={{ to: '/check-your-community', label: 'Check yours', onClick: () => { writeNudgeDone(uid); setDone(true); } }}
      onClose={() => { writeNudgeDone(uid); close(); window.setTimeout(() => setDone(true), 230); }}
      leaving={leaving}
    />
  );
}
