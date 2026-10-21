import type { CSSProperties } from 'react';
import type { EventThemeId } from '../../lib/eventTheme';

const i = (n: number) => ({ ['--i' as string]: n } as CSSProperties);

/**
 * The moving set behind an event's hero, drawn for what kind of event it is.
 * Decoration only: hidden from screen readers, still under reduced motion
 * (event-detail.css), and clipped by the hero so it never widens the page.
 */
export function EventScene({ theme }: { theme: EventThemeId }) {
  return (
    <div className={`evs evs-${theme}`} aria-hidden="true">
      {theme === 'music' ? <>
        <span className="evs-vinyl" />
        <span className="evs-eq">{Array.from({ length: 14 }, (_, n) => <i key={n} style={i(n)} />)}</span>
        <span className="evs-notes">{['♪', '♫', '♪', '♬'].map((c, n) => <i key={n} style={i(n)}>{c}</i>)}</span>
      </> : theme === 'stage' ? <>
        <span className="evs-spot" />
        <svg className="evs-curtain is-left" viewBox="0 0 200 400" preserveAspectRatio="none"><path d="M0,0H200C170,60 150,120 140,200C130,280 120,340 110,400H0Z" /><path className="evs-fold" d="M40,0C45,120 50,260 46,400M90,0C95,110 98,240 92,380M140,0C138,60 132,120 128,180" /></svg>
        <svg className="evs-curtain is-right" viewBox="0 0 200 400" preserveAspectRatio="none"><path d="M0,0H200C170,60 150,120 140,200C130,280 120,340 110,400H0Z" /><path className="evs-fold" d="M40,0C45,120 50,260 46,400M90,0C95,110 98,240 92,380M140,0C138,60 132,120 128,180" /></svg>
        <svg className="evs-valance" viewBox="0 0 1200 60" preserveAspectRatio="none"><path d={`M0,0H1200V30${Array.from({ length: 12 }, (_, n) => `Q${1150 - n * 100},70 ${1100 - n * 100},30`).join('')}Z`} /></svg>
      </> : theme === 'sports' ? <>
        <span className="evs-turf" />
        <span className="evs-pitch"><i /><i /></span>
        <span className="evs-flood is-left" /><span className="evs-flood is-right" />
      </> : theme === 'family' ? <>
        <span className="evs-balloons">{['#ff8a3d', '#ffdf4f', '#00c2e0', '#ff5aa5', '#3fbf6a'].map((c, n) => <i key={n} style={{ ...i(n), ['--c' as string]: c } as CSSProperties} />)}</span>
        <span className="evs-confetti">{Array.from({ length: 16 }, (_, n) => <i key={n} style={i(n)} />)}</span>
      </> : theme === 'food' ? <>
        <span className="evs-steam">{[0, 1, 2].map(n => <svg key={n} style={i(n)} viewBox="0 0 40 160"><path d="M20,160C0,130 40,110 20,80C0,50 40,30 20,0" /></svg>)}</span>
        <span className="evs-gingham" />
      </> : theme === 'market' ? <>
        <svg className="evs-bunting" viewBox="0 0 1200 90" preserveAspectRatio="none"><path className="evs-line" d="M0,10Q600,70 1200,10" />{Array.from({ length: 16 }, (_, n) => { const x = 40 + n * 72, y = 10 + 60 * (1 - ((x - 600) / 600) ** 2) * 0.55; return <path key={n} style={i(n)} className={`evs-flag f${n % 4}`} d={`M${x - 18},${y}L${x + 18},${y}L${x},${y + 30}Z`} />; })}</svg>
      </> : theme === 'talks' ? <>
        <span className="evs-chalk" />
        <svg className="evs-scribble" viewBox="0 0 300 120"><path d="M10,90C60,20 90,110 140,60S230,10 290,70" /><path d="M30,110H270" /></svg>
      </> : theme === 'gallery' ? <>
        <span className="evs-frames">{[0, 1, 2].map(n => <i key={n} style={i(n)} />)}</span>
        <span className="evs-gallery-light" />
      </> : theme === 'outdoors' ? <>
        <span className="evs-sun" />
        <span className="evs-clouds">{[0, 1, 2].map(n => <i key={n} style={i(n)} />)}</span>
        <svg className="evs-peaks" viewBox="0 0 1440 220" preserveAspectRatio="none"><path className="is-far" d="M0,220L120,120L210,170L340,60L470,150L560,100L700,170L820,70L960,160L1080,90L1210,150L1330,80L1440,140V220Z" /><path className="is-near" d="M0,220L90,170L200,200L320,140L450,190L600,150L760,200L900,160L1040,200L1180,150L1300,190L1440,160V220Z" /></svg>
      </> : theme === 'community' ? <>
        <span className="evs-hearts">{Array.from({ length: 8 }, (_, n) => <i key={n} style={i(n)}>♥</i>)}</span>
      </> : <>
        <span className="evs-sparks">{Array.from({ length: 10 }, (_, n) => <i key={n} style={i(n)} />)}</span>
      </>}
    </div>
  );
}
