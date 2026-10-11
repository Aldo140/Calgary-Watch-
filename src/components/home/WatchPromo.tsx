import type { LivePulse } from '../../hooks/useLivePulse';
import { useCalmPopup } from '../../hooks/useCalmPopup';
import { Notice } from '../site/Notice';

const KEY = 'cw_watch_promo';
/** A closed card stays closed this long; a used one, longer. */
const QUIET_AFTER_CLOSE = 14 * 86_400_000;
const QUIET_AFTER_USE = 60 * 86_400_000;

function quietUntil(): number {
  try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
}
function rememberFor(ms: number) {
  try { localStorage.setItem(KEY, String(Date.now() + ms)); } catch { /* private mode: it just shows again next visit */ }
}

/** The homepage's Community Watch radar, drawn small for the card. */
function Radar() {
  return (
    <svg viewBox="0 0 64 64">
      <rect x="1" y="1" width="62" height="62" rx="14" fill="#0b1f3d" stroke="#151515" strokeWidth="2" />
      <circle cx="32" cy="32" r="22" fill="none" stroke="#00c2e0" strokeWidth="2" />
      <circle cx="32" cy="32" r="13" fill="none" stroke="#00c2e0" strokeOpacity=".45" strokeDasharray="3 3" />
      <path d="M32 10v44M10 32h44" stroke="#fff" strokeOpacity=".2" strokeDasharray="2 3" />
      <path d="M12 26c8-1 14 2 20 6s8 10 6 22" fill="none" stroke="#00c2e0" strokeWidth="3" strokeLinecap="round" />
      <rect x="28.5" y="28.5" width="7" height="7" rx="1" transform="rotate(45 32 32)" fill="#ffdf4f" />
      <circle cx="44" cy="20" r="3.5" fill="#ff5a4e" stroke="#fff" strokeWidth="1.5" />
      <circle cx="21" cy="42" r="3" fill="#ffdf4f" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Community Watch, said once and on the homepage's own terms: the navy
 * "your street" card, shrunk to a notice. It only appears at a calm moment
 * (see useCalmPopup) and stays away for two weeks once closed. The count is
 * the live map's own, read for the Live section; if that read failed it is
 * left out rather than guessed.
 */
export function WatchPromo({ pulse }: { pulse: LivePulse }) {
  const enabled = typeof window !== 'undefined' && quietUntil() <= Date.now();
  // Never while the homepage's own Community Watch card is on screen.
  const { open, leaving, close } = useCalmPopup('promo', enabled, '.h-way-live, .h-strip-live');
  if (!open) return null;

  const { reports } = pulse;
  const points = ['Free', 'Calgary only'];
  if (reports.status === 'ready' && reports.total > 0) points.unshift(`${reports.total}${reports.capped ? '+' : ''} reports in 24h`);

  return (
    <Notice
      tone="live"
      labelId="cw-promo-title"
      eyebrow="Community Watch"
      title={<>Your street, <em>live.</em></>}
      text="What neighbours, Calgary Police and 311 are reporting near you, on one map. Every pin shows where it came from."
      points={points}
      art={<Radar />}
      action={{ to: '/community', label: 'Open Community Watch', onClick: () => rememberFor(QUIET_AFTER_USE) }}
      onClose={() => { rememberFor(QUIET_AFTER_CLOSE); close(); }}
      leaving={leaving}
    />
  );
}
