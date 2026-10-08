import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Download, Link2, LoaderCircle, LocateFixed, MapPin, Share2 } from 'lucide-react';
import { fetchCommunityBoundaries, findCommunityAt } from '../../lib/communityLookup';
import { searchCommunities, shareText, type CommunityRank } from '../../lib/communityRank';
import { drawShareCard } from '../../lib/shareCard';
import { BAND_DUOTONE } from '../../lib/coverArt';

export const PATH = '/check-your-community';
export const fmt = (n: number) => n.toLocaleString('en-CA');
export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function pageLink(r?: CommunityRank, extra = ''): string {
  return `${window.location.origin}${PATH}${r ? `?c=${r.slug}` : ''}${extra}`;
}

/** Each band's lead colour, from its cover duotone. */
export const BAND_COLOUR: Record<CommunityRank['band'], string> = {
  Hot: BAND_DUOTONE.Hot.from,
  High: BAND_DUOTONE.High.from,
  Elevated: BAND_DUOTONE.Elevated.from,
  Calm: BAND_DUOTONE.Calm.to,
};

/** Stable pseudo-shuffle so the cover shelf isn't alphabetical or ranked. */
export function shuffled<T extends { key: string }>(items: T[]): T[] {
  const h = (s: string) => { let n = 2166136261; for (let i = 0; i < s.length; i++) n = Math.imul(n ^ s.charCodeAt(i), 16777619); return n >>> 0; };
  return [...items].sort((a, b) => h(a.key) - h(b.key));
}

export function useMedia(query: string): boolean {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches;
  const [match, setMatch] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** Counts from `from` to `to`, easing out, restarting whenever either changes. */
export function useCountTo(to: number, from: number, ms = 1100): number {
  const [value, setValue] = useState(reducedMotion() ? to : from);
  useEffect(() => {
    if (reducedMotion()) { setValue(to); return; }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 4))));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, from, ms]);
  return value;
}

/** Stops the page behind a full-screen layer from scrolling. */
export function useScrollLock(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [on]);
}

export function readBest(): number {
  try { return Number(localStorage.getItem('cyc_hl_best') ?? 0) || 0; } catch { return 0; }
}
export function writeBest(n: number) {
  try { localStorage.setItem('cyc_hl_best', String(n)); } catch { /* private mode */ }
}

export function CommunityPicker({ rankings, onPick, placeholder, autoFocus, className = '', hint = 'Play' }: {
  rankings: CommunityRank[];
  onPick: (r: CommunityRank) => void;
  placeholder: string;
  autoFocus?: boolean;
  className?: string;
  hint?: string;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const matches = useMemo(() => searchCommunities(rankings, query), [rankings, query]);
  const [listId] = useState(() => `cyc-list-${Math.random().toString(36).slice(2, 8)}`);
  const pick = (r: CommunityRank) => { setQuery(''); onPick(r); };
  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState('');

  // One tap: browser location → the community boundary it falls in → that community's ranking.
  const locate = () => {
    if (!navigator.geolocation) { setLocNote('Your browser can\'t share location. Type your community instead.'); return; }
    setLocating(true);
    setLocNote('');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const name = findCommunityAt(coords.latitude, coords.longitude, await fetchCommunityBoundaries());
          const r = name ? rankings.find((x) => x.key === name) : undefined;
          if (r) onPick(r);
          else setLocNote(name ? `No reports on file for ${name} yet. Try a community nearby.` : 'You look to be outside Calgary. Type a community instead.');
        } catch {
          setLocNote('Couldn\'t look up your community. Type it instead.');
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        setLocNote(err.code === err.PERMISSION_DENIED ? 'Location is blocked. Allow it in your browser, or type your community.' : 'Couldn\'t get your location. Type your community instead.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  return (
    <div className={`cyc-picker ${className}`}>
      <MapPin className="cyc-picker-icon" size={20} aria-hidden="true" />
      <input
        className="cyc-input"
        type="search"
        enterKeyHint="go"
        value={query}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-controls={listId}
        disabled={rankings.length === 0}
        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter' && matches[active]) { e.preventDefault(); pick(matches[active]); }
        }}
      />
      <button type="button" className="cyc-locate" onClick={locate} disabled={locating || rankings.length === 0} aria-label="Use my location">
        {locating ? <LoaderCircle size={16} className="cyc-spin" aria-hidden="true" /> : <LocateFixed size={16} aria-hidden="true" />}
        <span>{locating ? 'Finding…' : 'Near me'}</span>
      </button>
      {locNote && <p className="cyc-locate-note" role="status">{locNote}</p>}
      {matches.length > 0 && (
        <ul className="cyc-matches" id={listId} role="listbox">
          {matches.map((r, i) => (
            <li key={r.key} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'is-active' : ''} onClick={() => pick(r)}>
                <span>{r.name}</span>
                <small>{hint} <ArrowRight size={13} aria-hidden="true" /></small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ShareActions({ r, rankings, shape, compact }: { r: CommunityRank; rankings: CommunityRank[]; shape?: string; compact?: boolean }) {
  const [state, setState] = useState<'' | 'copied' | 'saving' | 'saved'>('');
  const flash = (s: typeof state) => { setState(s); setTimeout(() => setState(''), 2200); };
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const shareLink = async () => {
    const text = shareText(r);
    const url = pageLink(r);
    if (canShare) {
      try { await navigator.share({ title: `${r.name}: #${r.rank} of ${r.count}`, text, url }); return; } catch { /* dismissed */ }
    }
    try { await navigator.clipboard.writeText(`${text} ${url}`); flash('copied'); } catch { /* clipboard blocked */ }
  };

  const saveCard = async () => {
    setState('saving');
    const blob = await drawShareCard(r, rankings, shape);
    if (!blob) { setState(''); return; }
    const file = new File([blob], `${r.slug}-calgary-rank.png`, { type: 'image/png' });
    if (canShare && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], text: `${shareText(r)} ${pageLink(r)}` }); setState(''); return; } catch { /* dismissed: download instead */ }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    flash('saved');
  };

  return (
    <div className={`cyc-share ${compact ? 'is-compact' : ''}`}>
      <button type="button" className="cyc-btn cyc-btn-hot" onClick={saveCard} disabled={state === 'saving'}>
        {state === 'saved' ? <Check size={18} aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
        {state === 'saving' ? 'Making your card…' : state === 'saved' ? 'Card saved' : 'Get the card'}
      </button>
      <button type="button" className="cyc-btn cyc-btn-line" onClick={shareLink}>
        {state === 'copied' ? <Check size={18} aria-hidden="true" /> : canShare ? <Share2 size={18} aria-hidden="true" /> : <Link2 size={18} aria-hidden="true" />}
        {state === 'copied' ? 'Link copied' : 'Share link'}
      </button>
    </div>
  );
}
