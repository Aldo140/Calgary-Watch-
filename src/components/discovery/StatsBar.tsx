/**
 * Every number here has to be true, not just plausible — PRODUCT.md rules out invented
 * activity/popularity signals, which is exactly what sank the old "Trending in Calgary"
 * section. Page views are the real, current site total; the rest are directly countable
 * from this codebase (scripts/ingest/sources/ + power-outages.ts + traffic-flow.ts = 7
 * live pipelines, DISCOVERY_SECTIONS + Live = 6 ways in, QUADRANTS.length = 4). Update
 * the page-view figure here as it grows — never let it go stale in the other direction.
 */
const STATS: { value: string; label: string; color: 'cyan' | 'green' | 'purple' | 'orange' }[] = [
  { value: '100K+', label: 'Page views and counting', color: 'cyan' },
  { value: '7', label: 'Live city data sources tracked', color: 'green' },
  { value: '6', label: 'Ways to know your city, one site', color: 'purple' },
  { value: '24/7', label: 'Community reporting, always on', color: 'orange' },
];

export function StatsBar() {
  return (
    <section className="cw-stats" aria-label="CalgaryWatch by the numbers">
      <div className="cw-wrap cw-stats-lead">
        <p className="cw-eyebrow">CalgaryWatch, by the numbers</p>
        <h2>Real Calgary. Real numbers.</h2>
      </div>
      <div className="cw-stats-grid">
        {STATS.map(s => (
          <div className={`cw-stat cw-stat-${s.color}`} key={s.label}>
            <b>{s.value}</b>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
