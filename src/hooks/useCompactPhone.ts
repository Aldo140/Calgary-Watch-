import { useEffect, useState } from 'react';

/**
 * Small phones: 380px wide or less (iPhone SE, Galaxy S8/A-series, Fold cover
 * screens) or 700px tall or less. There the full phone bar took over a third
 * of the screen, so the map switches to a compact frame.
 */
export const COMPACT_PHONE_QUERY = '(max-width: 1023px) and ((max-width: 380px) or (max-height: 700px))';

export function useCompactPhone(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.(COMPACT_PHONE_QUERY).matches === true);
  useEffect(() => {
    const mq = window.matchMedia?.(COMPACT_PHONE_QUERY);
    if (!mq) return;
    const update = () => setCompact(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return compact;
}
