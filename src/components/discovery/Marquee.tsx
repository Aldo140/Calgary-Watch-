/** A continuously scrolling ticker. Decorative and repeated content, so it's hidden
 * from assistive tech; the same information exists elsewhere as real nav/copy. Respects
 * prefers-reduced-motion via CSS (the animation is simply disabled, not slowed). */
export function Marquee({ items, variant = 'light' }: { items: string[]; variant?: 'light' | 'dark' }) {
  const loop = [...items, ...items];
  return (
    <div className={`cw-marquee cw-marquee-${variant}`} aria-hidden="true">
      <div className="cw-marquee-track">
        {loop.map((item, i) => <span key={i}>{item}</span>)}
      </div>
    </div>
  );
}
