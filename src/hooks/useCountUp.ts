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
    // `step` re-schedules itself, so the id to cancel is the one from the most
    // recent frame — not the one returned below. Cancelling only that first id
    // left the loop running after the effect was torn down, still holding the
    // old target in its closure and still calling setValue. When the target
    // changed mid-animation the stale loop overwrote the new value: the
    // briefing showed a community rank of 212 under the words "things reported
    // near you", because that rank was the target one render earlier.
    let frame = 0;

    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const elapsed  = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // cubic ease-out: 1 - (1 - t)^3
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, active]);

  return value;
}
