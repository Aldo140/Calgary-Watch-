import { useEffect, useRef, useState } from 'react';

/**
 * Returns a ref and a boolean that becomes true once the element enters
 * the viewport. Fires once and disconnects (scroll-in trigger only).
 */
export function useInView(threshold = 0.15): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref    = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

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
