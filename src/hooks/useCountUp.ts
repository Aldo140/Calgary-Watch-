import { useEffect, useState } from 'react';

/**
 * Animates from 0 to `target` over `duration` ms using cubic ease-out.
 * Only starts when `active` is true (wire to inView).
 */
export function useCountUp(target: number, duration = 900, active = true): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active || target === 0) {
      setValue(target);
      return;
    }
    setValue(0);
    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const elapsed  = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // cubic ease-out: 1 - (1 - t)^3
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };

    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [target, duration, active]);

  return value;
}
