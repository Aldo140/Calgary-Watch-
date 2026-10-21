import { useEffect, useRef, useState } from 'react';

/**
 * Returns a ref and a boolean that becomes true once the element enters
 * the viewport. Fires once and disconnects (scroll-in trigger only).
 *
 * Falls back to true after a short delay: an element that mounts late (inside
 * a drawer, or a panel opened from a deep link mid-load) can miss the observer
 * entirely, and content gated on this must never stay invisible.
 */
export function useInView(threshold = 0.15): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref    = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const fallback = window.setTimeout(() => setInView(true), 1200);
    return () => window.clearTimeout(fallback);
  }, [inView]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (inView) return; // already triggered

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, inView]);

  return [ref, inView];
}
