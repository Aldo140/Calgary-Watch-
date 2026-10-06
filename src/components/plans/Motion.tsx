import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';

/**
 * Small motion pieces for /plans, all off under prefers-reduced-motion.
 * The rule for motion here: it explains something (a number arriving, a
 * badge being earned, a card answering the pointer), never decorates.
 */

export const EASE_OUT = [0.2, 0.9, 0.3, 1] as const;

/** A number that counts up the first time it scrolls into view, then follows changes. */
export function CountUp({ value, format = (n) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, margin: '-40px' });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (!seen) return;
    if (reduce) { setShown(value); return; }
    const controls = animate(from.current, value, { duration: 0.9, ease: EASE_OUT, onUpdate: (n) => setShown(n) });
    from.current = value;
    return () => controls.stop();
  }, [seen, value, reduce]);
  return <span ref={ref}>{format(shown)}</span>;
}

/** Fades and lifts children in as they enter the viewport. */
export function Reveal({ children, delay = 0, y = 18, className, as = 'div' }: { children: ReactNode; delay?: number; y?: number; className?: string; as?: 'div' | 'section' | 'li' }) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, ease: EASE_OUT, delay }}
    >
      {children}
    </Tag>
  );
}

/** A card that tilts toward the pointer, with a soft light following it. */
export function Tilt({ children, className, max = 8 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);
  const sx = useSpring(x, { stiffness: 160, damping: 18 });
  const sy = useSpring(y, { stiffness: 160, damping: 18 });
  const rotateY = useTransform(sx, [0, 1], [-max, max]);
  const rotateX = useTransform(sy, [0, 1], [max * 0.8, -max * 0.8]);
  const glare = useTransform([sx, sy], ([gx, gy]: number[]) => `radial-gradient(420px circle at ${gx * 100}% ${gy * 100}%, rgba(255,255,255,.16), transparent 55%)`);
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      style={{ rotateX, rotateY, transformPerspective: 1100 }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left) / r.width);
        y.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => { x.set(0.5); y.set(0.5); }}
    >
      {children}
      <motion.span className="pl-glare" style={{ background: glare }} aria-hidden="true" />
    </motion.div>
  );
}
