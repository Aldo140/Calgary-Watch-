import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Play, X } from 'lucide-react';
import { useAuth } from '../FirebaseProvider';
import { opensGame, readNudgeDone, shouldShowRankNudge, writeNudgeDone } from '../../lib/rankNudge';
import '../../styles/rank-nudge.css';

/** A one-time card for signed-in readers announcing Check your community. */
export function RankNudge() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const uid = user?.uid;
  const [done, setDone] = useState(() => (uid ? readNudgeDone(uid) : true));
  const [ready, setReady] = useState(false);

  useEffect(() => { setDone(uid ? readNudgeDone(uid) : true); }, [uid]);
  useEffect(() => {
    if (uid && opensGame(pathname)) { writeNudgeDone(uid); setDone(true); }
  }, [uid, pathname]);
  // A beat after the page settles, so it arrives rather than flashes.
  useEffect(() => { const t = window.setTimeout(() => setReady(true), 1400); return () => clearTimeout(t); }, []);

  if (!uid || !ready || !shouldShowRankNudge({ signedIn: true, pathname, done })) return null;
  const finish = () => { writeNudgeDone(uid); setDone(true); };
  const first = user?.displayName?.split(' ')[0];

  return (
    <aside className="cw-rnudge" role="status" aria-label="New on CalgaryWatch">
      <div className="cw-rnudge-art" aria-hidden="true"><i /><i /><i /></div>
      <div className="cw-rnudge-body">
        <p className="cw-rnudge-eyebrow"><span /> New for you{first ? `, ${first}` : ''}</p>
        <p className="cw-rnudge-title">How does your neighbourhood rank?</p>
        <p className="cw-rnudge-text">Every Calgary community, ranked by 311 calls. Guess yours first.</p>
        <Link to="/check-your-community" className="cw-rnudge-go" onClick={finish}>
          <span aria-hidden="true"><Play size={14} fill="currentColor" /></span> Check yours
        </Link>
      </div>
      <button type="button" className="cw-rnudge-close" onClick={finish} aria-label="Dismiss"><X size={18} /></button>
    </aside>
  );
}
