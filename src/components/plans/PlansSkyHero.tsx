import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { MapPin } from 'lucide-react';
import { CalgarySky, type SkyVariant } from '../home/CalgarySky';
import { SkyGlyph } from '../home/WeekPlanner';
import { TEAR } from '../home/HomeHero';
import { useCalgaryWeather } from '../../hooks/useCalgaryWeather';
import { describeSky, type SkyIcon } from '../../lib/weatherCodes';
import { moonPhase, skyPalette, sunPosition } from '../../lib/sky';
import { calgaryDateTimeFormat } from '../../lib/calgaryTz';
import { EASE_OUT } from './Motion';
import '../../styles/home.css';

const clock = calgaryDateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: 'numeric', minute: '2-digit' });
const variantFor = (w: number): SkyVariant => (w <= 720 ? 'mobile' : w <= 1024 ? 'tablet' : 'desktop');

/**
 * The member home opens on the homepage's live sky — the sun where it really
 * is over Calgary, today's real weather — framed as a window onto the
 * reader's own part of the city. The glance tiles sit on its sill.
 */
export function PlansSkyHero({ greeting, area, children, after }: { greeting: string; area: string; children?: ReactNode; after?: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const weather = useCalgaryWeather();
  const [now, setNow] = useState(() => Date.now());
  const [variant, setVariant] = useState<SkyVariant>(() => (typeof window === 'undefined' ? 'desktop' : variantFor(window.innerWidth)));
  useEffect(() => {
    const onResize = () => setVariant(variantFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    const tick = window.setInterval(() => setNow(Date.now()), 5 * 60 * 1000);
    return () => { window.removeEventListener('resize', onResize); clearInterval(tick); };
  }, []);

  // Depth on scroll: the sky drifts slower than the words over it.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const skyY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 90]);
  const skyScale = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 1.08]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -30]);

  const current = weather.current;
  const sun = sunPosition(new Date(now));
  const cloudCover = current?.cloudCover ?? 0;
  const palette = skyPalette(sun.altitude, cloudCover);
  const sky = current ? describeSky(current.code, current.isDay) : null;
  const precip: SkyIcon | null = sky && (sky.wet || sky.icon === 'fog') ? sky.icon : null;
  const [hello, rest] = greeting.split('|');

  return (
    <div className="pl-skywrap">
      <section ref={ref} className="cw-home2 pl-sky" data-tone={palette.tone} style={{ background: palette.top }} aria-labelledby="pl-sky-title">
        <motion.div className="pl-sky-layer" style={{ y: skyY, scale: skyScale }}>
          <CalgarySky palette={palette} sun={sun} phase={moonPhase(new Date(now))} cloudCover={cloudCover} windKph={current?.windKph ?? 8} precip={precip} variant={variant} now={Math.floor(now / 300000)} />
        </motion.div>
        <motion.div className="pl-sky-inner" style={{ y: textY }}>
          <motion.p className="pl-sky-line" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE_OUT }}>
            <span className="h-dateline-live"><span className="h-pulse" aria-hidden="true" />Live sky · {clock.format(new Date(now))}</span>
            {area ? <span className="pl-sky-chip"><MapPin size={13} aria-hidden="true" /> {area}</span> : null}
            {current && sky ? <span className="pl-sky-chip"><SkyGlyph icon={sky.icon} size={14} /> {Math.round(current.temp)}° {sky.label.toLowerCase()}</span> : null}
          </motion.p>
          <h1 id="pl-sky-title">
            <motion.span className="pl-sky-h1a" initial={reduce ? false : { opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.08 }}>{hello}</motion.span>
            <motion.em initial={reduce ? false : { opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.18 }}>{rest}</motion.em>
          </h1>
          {after}
        </motion.div>
        <svg className="h-tear" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d={TEAR} transform="translate(0 -5)" className="h-tear-shade" />
          <path d={TEAR} className="h-tear-paper" />
        </svg>
      </section>
      {children ? <div className="pl-sill">{children}</div> : null}
    </div>
  );
}
