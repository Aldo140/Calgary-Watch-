import { useEffect } from 'react';
import { clickAction, recordSearchClick, searchContext } from '../../lib/searchClicks';

/**
 * One listener for every "did this search reach a business?" click
 * (src/lib/searchClicks.ts). It reads markup, not handlers:
 * - `data-cw-q` on the search results (and typeahead) holds the words;
 * - `data-cw-entity` on a result row, or on a profile page's root, names the listing;
 * - `data-cw-profile` marks a profile page, where only Call, Website,
 *   Directions, Email and Claim count, credited to the search that opened it.
 */
export function SearchClickTracker() {
  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      if (ev.button > 1) return;
      const a = (ev.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      const holder = a.closest('[data-cw-entity]') as HTMLElement | null;
      if (!holder) return;
      const onProfile = holder.hasAttribute('data-cw-profile');
      const act = clickAction(a.getAttribute('href') ?? '', window.location.origin, onProfile);
      if (!act) return;
      const id = holder.dataset.cwEntity ?? '';
      if (onProfile) {
        const path = window.location.pathname.replace(/\/$/, '');
        recordSearchClick({ q: searchContext([id, path]), keys: [id, path], act, from: 'profile' });
        return;
      }
      const q = (a.closest('[data-cw-q]') as HTMLElement | null)?.dataset.cwQ ?? '';
      if (!q) return;
      const path = act === 'open' ? new URL(a.href, window.location.origin).pathname.replace(/\/$/, '') : '';
      recordSearchClick({ q, keys: [id, path].filter(Boolean), act, from: holder.dataset.cwFrom === 'typeahead' ? 'typeahead' : 'search' });
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('auxclick', onClick, true);
    return () => { document.removeEventListener('click', onClick, true); document.removeEventListener('auxclick', onClick, true); };
  }, []);
  return null;
}
