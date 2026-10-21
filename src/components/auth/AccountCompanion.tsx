import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, BadgeCheck, Building2, Mail, X } from 'lucide-react';
import { useAuth } from '../FirebaseProvider';
import { inboxLink } from '../../lib/auth';
import { useMyClaims } from '../../lib/claimsApi';
import { organizationForEmail } from '../../lib/orgMatch';
import { discoveryRepository } from '../../data/discovery';
import '../../styles/auth.css';

type Card = 'verify' | 'verified' | 'org' | null;

function stored(key: string, session = false): boolean {
  try { return (session ? sessionStorage : localStorage).getItem(key) === '1'; } catch { return false; }
}
function store(key: string, session = false): void {
  try { (session ? sessionStorage : localStorage).setItem(key, '1'); } catch { /* storage off: the card just returns next visit */ }
}

/**
 * One small card, bottom of the screen, for the moment after an account
 * exists: a nudge to finish verifying, a "you're verified" with what it
 * unlocked, and, when the sign-in email's domain matches a listing's own
 * website, "Is this yours? Claim it". Only one shows at a time, each can be
 * dismissed, and none appear while the sign-in dialog is open.
 */
export function AccountCompanion() {
  const { user, isAuthDialogOpen, sendVerificationEmail, openVerification } = useAuth();
  const { pathname } = useLocation();
  const claims = useMyClaims(user?.emailVerified ? user.uid : undefined);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [justVerified, setJustVerified] = useState(false);
  const [ready, setReady] = useState(false);
  const [sent, setSent] = useState(false);
  const seen = useRef<{ uid: string; verified: boolean } | null>(null);

  // Let the page settle before anything slides in.
  useEffect(() => { const id = window.setTimeout(() => setReady(true), 3500); return () => window.clearTimeout(id); }, []);

  // Celebrate the moment an account flips to verified in this tab.
  const verified = Boolean(user?.emailVerified);
  useEffect(() => {
    if (!user) { seen.current = null; return; }
    const before = seen.current;
    if (before?.uid === user.uid && !before.verified && verified) setJustVerified(true);
    seen.current = { uid: user.uid, verified };
  }, [user, verified]);
  useEffect(() => { if (!justVerified) return; const id = window.setTimeout(() => setJustVerified(false), 9000); return () => window.clearTimeout(id); }, [justVerified]);

  const uid = user?.uid ?? '';
  const org = useMemo(() => {
    if (!user?.email || !claims) return null;
    const mine = new Set(claims.map(c => c.entityId));
    return organizationForEmail(user.email, discoveryRepository.list(), mine);
  }, [user?.email, claims]);
  const orgKey = org ? `cw-org-nudge:${uid}:${org.id}` : '';

  const onClaimPage = pathname.startsWith('/claim/') || pathname.startsWith('/org');
  let card: Card = null;
  if (user && !isAuthDialogOpen && ready) {
    if (justVerified && !dismissed.verified) card = 'verified';
    else if (!verified && !dismissed.verify && !stored(`cw-verify-nudge:${uid}`, true)) card = 'verify';
    else if (verified && org && !onClaimPage && !dismissed.org && !stored(orgKey)) card = 'org';
  }
  if (!card) return null;

  const close = (which: Exclude<Card, null>) => {
    setDismissed(d => ({ ...d, [which]: true }));
    if (which === 'verify') store(`cw-verify-nudge:${uid}`, true);
    if (which === 'org' && orgKey) store(orgKey);
  };
  const inbox = user?.email ? inboxLink(user.email) : null;

  return (
    <aside className="cw-companion" data-card={card} role="status" aria-live="polite">
      <button type="button" className="cw-companion-x" aria-label="Dismiss" onClick={() => close(card)}><X size={16} /></button>
      {card === 'verify' ? <>
        <span className="cw-companion-mark"><Mail size={20} aria-hidden="true" /></span>
        <div>
          <strong>One tap left: verify {user!.email}</strong>
          <p>It unlocks claiming your organization, market applications and sharing listings.</p>
          <div className="cw-companion-actions">
            {inbox ? <a href={inbox.href} target="_blank" rel="noreferrer">{inbox.label}</a> : <button type="button" onClick={openVerification}>I’ve verified</button>}
            <button type="button" disabled={sent} onClick={() => void sendVerificationEmail().then(() => setSent(true)).catch(() => setSent(false))}>{sent ? 'Sent. Check junk too' : 'Resend link'}</button>
          </div>
        </div>
      </> : card === 'verified' ? <>
        <span className="cw-companion-mark" data-tone="ok"><BadgeCheck size={20} aria-hidden="true" /></span>
        <div>
          <strong>Email verified. You’re all set.</strong>
          <p>You can now claim your organization, apply to markets and share listings.</p>
          <div className="cw-companion-actions"><Link to="/plans" onClick={() => close('verified')}>Open your dashboard</Link></div>
        </div>
      </> : <>
        <span className="cw-companion-mark" data-tone="brand"><Building2 size={20} aria-hidden="true" /></span>
        <div>
          <strong>Is {org!.title} yours?</strong>
          <p>Your email matches their website. Claim it free to fix details, add dates and show up as verified.</p>
          <div className="cw-companion-actions">
            <Link to={`/claim/${encodeURIComponent(org!.id)}`} onClick={() => close('org')}>Claim it <ArrowUpRight size={15} aria-hidden="true" /></Link>
            <button type="button" onClick={() => close('org')}>Not mine</button>
          </div>
        </div>
      </>}
    </aside>
  );
}
