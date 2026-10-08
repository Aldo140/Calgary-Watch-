import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BadgeCheck, ChevronDown, LayoutDashboard, LogOut, Mail, Map as MapIcon, Shield, Ticket } from 'lucide-react';
import { useAuth } from '../FirebaseProvider';
import { useMyClaims } from '../../lib/claimsApi';

/**
 * The header's account control. Signed out it is the "Sign up" button it
 * always was; signed in it becomes the reader's avatar, opening a small menu
 * that leads to everything that's theirs. Claims are read only once the menu
 * is opened, so a page view costs nothing extra.
 */
export function AccountMenu() {
  const { user, logout, isAdmin, isAuthReady } = useAuth();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const claims = useMyClaims(opened ? user?.uid : undefined);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!user) return <Link to="/plans" className="cw-nav-cta" aria-busy={!isAuthReady}>Sign up</Link>;

  const first = (user.displayName || user.email || 'You').split(/[\s@]/)[0];
  const avatar = user.photoURL
    ? <img src={user.photoURL} alt="" width="34" height="34" referrerPolicy="no-referrer" />
    : <span aria-hidden="true">{first.slice(0, 1).toUpperCase()}</span>;

  const items = [
    { to: '/plans', icon: LayoutDashboard, label: 'Your dashboard', note: 'Picks, plans and badges' },
    { to: '/plans#pl-going-title', icon: Ticket, label: 'Your plans', note: 'What you said you’re going to' },
    { to: '/plans?edit=1#emails', icon: Mail, label: 'Emails and area', note: 'What we send, and where home is' },
    ...((claims ?? []).length ? [{ to: `/claim/${encodeURIComponent(claims![0].entityId)}`, icon: BadgeCheck, label: claims!.length > 1 ? 'Your listings' : 'Your listing', note: claims![0].entityTitle }] : []),
    { to: '/map', icon: MapIcon, label: 'Live map', note: 'Alerts and quiet hours live here' },
    ...(isAdmin ? [{ to: '/admin', icon: Shield, label: 'Admin', note: 'The desk' }] : []),
  ];

  return (
    <div className="cw-acct" ref={ref}>
      <button
        type="button" className="cw-acct-btn" aria-haspopup="menu" aria-expanded={open}
        aria-label={`Your account, ${first}`}
        onClick={() => { setOpen((o) => !o); setOpened(true); }}
      >
        <span className="cw-acct-avatar">{avatar}</span>
        <span className="cw-acct-name">{first}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            className="cw-acct-menu" role="menu"
            initial={reduce ? false : { opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            <div className="cw-acct-head">
              <span className="cw-acct-avatar cw-acct-avatar-lg">{avatar}</span>
              <span><strong>{user.displayName || first}</strong><small>{user.email}</small></span>
            </div>
            {items.map((i) => (
              <Link key={i.label} to={i.to} role="menuitem" className="cw-acct-item">
                <i.icon size={17} aria-hidden="true" />
                <span><strong>{i.label}</strong><small>{i.note}</small></span>
              </Link>
            ))}
            <button type="button" role="menuitem" className="cw-acct-item cw-acct-out" onClick={() => { setOpen(false); void logout(); }}>
              <LogOut size={17} aria-hidden="true" /><span><strong>Sign out</strong></span>
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
