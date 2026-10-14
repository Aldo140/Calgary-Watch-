import { useEffect, useSyncExternalStore } from 'react';

/**
 * Pages other than the homepage that open on the live sky (the Local board and
 * place pages) register here so the site header floats over the sky on them too.
 */
let mounted = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export function useSkyOverlayRegistration() {
  useEffect(() => {
    mounted += 1; emit();
    return () => { mounted -= 1; emit(); };
  }, []);
}

export function useSkyOverlay(): boolean {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => mounted > 0,
    () => false,
  );
}
