import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, X, Layers as LayersIcon, Radio, Video } from 'lucide-react';
import { MAP, CATEGORY } from '@/src/lib/tokens';
import { publicAsset } from '@/src/lib/utils';

export type TourStep = {
  /** matches a [data-tour="…"] attribute; omit for a centered info card */
  target?: string;
  title: string;
  body: string;
  /** small mono eyebrow above the title on centered cards */
  eyebrow?: string;
  /** mini illustration on centered story cards */
  visual?: 'sources' | 'pins' | 'fresh';
  /** Camera viewer needs a viewport-specific card position that leaves the frame visible. */
  placement?: 'camera';
};

// Centered story steps — the "why" of the map, shown on both form factors.
const STORY_STEPS: TourStep[] = [
  {
    eyebrow: 'Why this exists',
    title: 'One map, every source',
    body: 'What\'s happening in Calgary is scattered across a dozen sites. Calgary Watch merges resident reports with official feeds into one live picture — cross-checked and de-duplicated.',
    visual: 'sources',
  },
  {
    eyebrow: 'Reading the pins',
    title: 'The little C means "City"',
    body: 'Pins wearing a blue C badge sync automatically from official City of Calgary data. Pins without it are reports posted by neighbours like you.',
    visual: 'pins',
  },
  {
    eyebrow: 'Always fresh',
    title: "Today's city, not last month's",
    body: 'Pins retire on their own — community posts after 24 hours, official ones when their source expires. Nothing stale, ever. History lives in each neighbourhood\'s Area Intel.',
    visual: 'fresh',
  },
];

// ── Mini illustrations for the story cards ──────────────────────────────────
function StoryVisual({ kind }: { kind: NonNullable<TourStep['visual']> }) {
  if (kind === 'sources') {
    return (
      <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden="true">
        {['You + neighbours', 'YYC Traffic', '311 requests', 'Water mains', 'Weather'].map((s, i) => (
          <span
            key={s}
            className="px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em]"
            style={i === 0
              ? { background: MAP.ink, color: MAP.panel }
              : { background: 'rgba(74,144,217,0.1)', color: MAP.accent, border: '1px solid rgba(74,144,217,0.25)' }}
          >
            {s}
          </span>
        ))}
      </div>
    );
  }
  if (kind === 'pins') {
    const pin = (color: string, withBadge: boolean, label: string) => (
      <div className="flex items-center gap-2.5">
        <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#fff] shadow-md shrink-0" style={{ background: color }}>
          <span className="h-2.5 w-2.5 rounded-full bg-[#fff] opacity-90" />
          {withBadge && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-[#fff] text-[8px] font-black text-[#fff]" style={{ background: MAP.accent }}>
              C
            </span>
          )}
        </span>
        <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.12em]" style={{ color: MAP.muted }}>{label}</span>
      </div>
    );
    return (
      <div className="mt-3 flex items-center gap-6 p-3" style={{ background: MAP.paper, border: `1px solid ${MAP.line}` }} aria-hidden="true">
        {pin(MAP.accent, true, 'City feed')}
        {pin(CATEGORY.crime, false, 'Neighbour')}
      </div>
    );
  }
  // fresh — post lifecycle strip
  return (
    <div className="mt-3 flex items-center gap-2 p-3 font-mono text-[9px] font-bold uppercase tracking-[0.1em]" style={{ background: MAP.paper, border: `1px solid ${MAP.line}`, color: MAP.muted }} aria-hidden="true">
      <span className="px-2 py-1" style={{ background: 'rgba(46,139,122,0.14)', color: MAP.ok }}>Posted</span>
      <span className="h-px flex-1" style={{ background: MAP.line }} />
      <span>24 h on the map</span>
      <span className="h-px flex-1" style={{ background: MAP.line }} />
      <span className="px-2 py-1" style={{ background: 'rgba(90,107,125,0.12)' }}>Auto-removed</span>
    </div>
  );
}

const DESKTOP_STEPS: TourStep[] = [
  STORY_STEPS[0],
  { target: 'feed', title: 'Your live feed', body: 'Every current report, newest first — community and official together. Click any card to fly to it on the map.' },
  STORY_STEPS[1],
  STORY_STEPS[2],
  { target: 'report', title: 'Report in under 30 seconds', body: 'Drop a pin, pick a category, write one line. Add a photo if it helps. You can post anonymously.' },
  { target: 'sos', title: 'Emergency SOS', body: 'For active emergencies. Always call 911 first — this alerts neighbours watching the map in parallel.' },
  { target: 'layers', title: 'Open the Layers menu', body: 'This button keeps extra map context close without crowding the main controls. The tutorial will open it for you.' },
  { target: 'traffic-cameras', title: 'Turn on traffic cameras', body: 'Traffic Cameras adds City of Calgary public webcams. Camera pins appear once the map is close enough to a specific intersection.' },
  { target: 'camera-viewer', placement: 'camera', title: 'See the road before you go', body: 'Tap any navy camera pin to open this large live still. Use the arrows to check nearby intersections and Refresh for a newer frame.' },
  { target: 'alerts', title: 'Alerts land here', body: 'New reports appear as they happen — including your neighbourhood report when your profile has a saved area.' },
  { target: 'locate', title: 'Find yourself', body: 'Jump to your GPS position. Reports sort around wherever you are.' },
];

const MOBILE_STEPS: TourStep[] = [
  STORY_STEPS[0],
  { target: 'm-feed', title: 'The city feed', body: 'Tap here to raise the sheet — every live report, newest first. The chips below filter by category in one tap.' },
  STORY_STEPS[1],
  STORY_STEPS[2],
  { target: 'near-me', title: 'Near me', body: 'Scans everything within 3 km of you — nearest first, emergencies on top.' },
  { target: 'report', title: 'Report in under 30 seconds', body: 'Drop a pin, pick a category, write one line. Anonymous if you prefer.' },
  { target: 'sos', title: 'Emergency SOS', body: 'For active emergencies. Always call 911 first — this alerts neighbours in parallel.' },
  { target: 'layers', title: 'Open the Layers menu', body: 'Extra map context lives here, kept separate so the one-handed controls stay clean.' },
  { target: 'traffic-cameras', title: 'Turn on traffic cameras', body: 'Traffic Cameras adds public City of Calgary webcams. The tutorial turns the layer on for you.' },
  { target: 'camera-viewer', placement: 'camera', title: 'Check a live camera image', body: 'Tap a navy camera pin to open this full-width still. Swipe through nearby intersections with the arrow buttons, or load a newer frame.' },
  { target: 'm-alerts', title: 'Alerts land here', body: 'New reports appear as they happen, with an unread badge.' },
];

type Rect = { top: number; left: number; width: number; height: number };

function measure(target: string): Rect | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  const style = window.getComputedStyle(el);
  if (style.visibility === 'hidden' || style.opacity === '0') return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

const DYNAMIC_TARGETS = new Set(['traffic-cameras', 'camera-viewer']);

export default function MapTour({
  open,
  onFinish,
  onStepChange,
}: {
  open: boolean;
  onFinish: () => void;
  onStepChange?: (target?: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const reduceMotion = useReducedMotion();

  // Pick the step set for the current form factor. Targeted steps whose anchor
  // is missing/invisible right now are dropped; centered steps always survive.
  const steps = useMemo(() => {
    if (!open || typeof window === 'undefined') return [];
    const base = window.innerWidth >= 1024 ? DESKTOP_STEPS : MOBILE_STEPS;
    return base.filter((s) => !s.target || DYNAMIC_TARGETS.has(s.target) || measure(s.target) !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const step = steps[index];

  const remeasure = useCallback(() => {
    if (!step?.target) { setRect(null); return; }
    setRect(measure(step.target));
  }, [step]);

  useEffect(() => {
    if (!open) { setIndex(0); return; }
    remeasure();
    window.addEventListener('resize', remeasure);
    window.addEventListener('orientationchange', remeasure);
    return () => {
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('orientationchange', remeasure);
    };
  }, [open, remeasure]);

  // Some steps intentionally reveal their own target: the layer row is hidden
  // until Layers opens, and the viewer does not exist until a camera loads.
  // Tell the map which stage is active, then observe the portal/menu until its
  // real geometry exists instead of falling back to a fake illustration.
  useEffect(() => {
    if (!open || !step) return;
    onStepChange?.(step.target);
    remeasure();
    const observer = new MutationObserver(remeasure);
    observer.observe(document.body, { childList: true, subtree: true });
    const settle = window.setTimeout(remeasure, 350);
    return () => {
      observer.disconnect();
      window.clearTimeout(settle);
    };
  }, [open, step, onStepChange, remeasure]);

  if (!open || steps.length === 0 || !step) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 8;
  const cardW = Math.min(360, vw - 32);
  const isLast = index === steps.length - 1;
  const centered = !step.target || !rect;

  // ── Anchored-tooltip placement, always clamped on-screen ───────────────────
  // Centered cards are positioned by a flex wrapper instead of CSS transforms:
  // Motion animates `transform` for y/scale, which would clobber translate(-50%).
  // Huge anchors (e.g. the full-height sidebar) get a side placement.
  let cardStyle: React.CSSProperties = {};
  if (!centered) {
    const r = rect!;
    if (step.placement === 'camera') {
      if (vw < 1024) {
        // The viewer is a bottom sheet on phones; keep instructions in the
        // open map area above it so neither the image nor its arrows are hidden.
        cardStyle = { top: 12 + (window.visualViewport?.offsetTop ?? 0), left: 12, width: cardW };
      } else {
        const rightSpace = vw - (r.left + r.width);
        const left = rightSpace >= cardW + 16
          ? r.left + r.width + 16
          : Math.max(12, r.left - cardW - 16);
        cardStyle = { top: Math.max(16, Math.min(r.top, vh - 260)), left, width: cardW };
      }
    } else {
      const huge = r.height > vh * 0.55 || r.width > vw * 0.8;
      if (huge && r.width < vw * 0.6) {
        const rightSpace = vw - (r.left + r.width);
        const left = rightSpace > cardW + 24 ? r.left + r.width + 16 : Math.max(12, r.left - cardW - 16);
        cardStyle = { top: Math.max(16, Math.round(vh * 0.32)), left, width: cardW };
      } else {
        const spaceBelow = vh - (r.top + r.height) > 240;
        const spaceAbove = r.top > 240;
        const left = Math.max(12, Math.min(r.left + r.width / 2 - cardW / 2, vw - cardW - 12));
        if (spaceBelow) {
          cardStyle = { top: Math.min(r.top + r.height + pad + 12, vh - 260), left, width: cardW };
        } else if (spaceAbove) {
          cardStyle = { bottom: Math.max(16, Math.min(vh - r.top + pad + 12, vh - 120)), left, width: cardW };
        } else {
          cardStyle = { top: Math.max(16, Math.round(vh / 2 - 150)), left, width: cardW };
        }
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[220]" role="dialog" aria-modal="true" aria-label="Map tour">
      {/* dim / spotlight */}
      {centered ? (
        <motion.div
          key={`dim-${index}`}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0"
          style={{ background: 'rgba(8, 18, 30, 0.72)' }}
        />
      ) : (
        <motion.div
          key={`spot-${step.target}`}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.25 }}
          className="absolute pointer-events-none"
          style={{
            top: rect!.top - pad,
            left: rect!.left - pad,
            width: rect!.width + pad * 2,
            height: rect!.height + pad * 2,
            borderRadius: 4,
            boxShadow: '0 0 0 9999px rgba(8, 18, 30, 0.72)',
            border: `2px solid ${MAP.accent}`,
          }}
        >
          <span className="absolute -inset-1.5 border-2 opacity-40 motion-safe:animate-pulse" style={{ borderColor: MAP.accent, borderRadius: 6 }} aria-hidden="true" />
        </motion.div>
      )}

      {/* card */}
      {(() => {
        const cardInner = (
          <>
            <div className="flex items-start justify-between gap-3">
              <p className="relative font-mono text-[9px] font-bold uppercase tracking-[0.24em]" style={{ color: MAP.ok }}>
                {step.eyebrow ?? 'Tour'} · {index + 1}/{steps.length}
              </p>
              <button
                type="button"
                onClick={onFinish}
                className="relative -mt-1 -mr-1 flex h-7 w-7 items-center justify-center hover:bg-black/5"
                style={{ color: MAP.muted }}
                aria-label="Skip tour"
              >
                <X size={13} />
              </button>
            </div>

            {centered && (
              <div className="relative mt-3 flex h-10 w-10 items-center justify-center" style={{ background: 'rgba(74,144,217,0.12)' }} aria-hidden="true">
                {step.target === 'camera-viewer' ? <Video size={18} style={{ color: MAP.accent }} /> : index === 0 ? <Radio size={18} style={{ color: MAP.accent }} /> : <LayersIcon size={18} style={{ color: MAP.accent }} />}
              </div>
            )}

            <h3 className="relative mt-2 font-display text-lg font-bold" style={{ color: MAP.ink }}>{step.title}</h3>
            <p className="relative mt-1.5 text-[13px] leading-relaxed" style={{ color: MAP.muted }}>{step.body}</p>
            {step.visual && <StoryVisual kind={step.visual} />}

            <div className="relative mt-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5" aria-hidden="true">
                {steps.map((s, i) => (
                  <span
                    key={`${s.title}-${i}`}
                    className="h-1.5 transition-all duration-300"
                    style={{ width: i === index ? 16 : 5, background: i === index ? MAP.accent : MAP.line }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => setIndex(index - 1)}
                    className="flex h-9 w-9 items-center justify-center hover:bg-black/5"
                    style={{ color: MAP.ink }}
                    aria-label="Previous step"
                  >
                    <ArrowLeft size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (isLast ? onFinish() : setIndex(index + 1))}
                  className="flex h-9 items-center gap-1.5 px-4 text-[13px] font-bold transition-transform hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-none"
                  style={{ background: MAP.ink, color: MAP.panel, boxShadow: `4px 4px 0 ${MAP.accent}` }}
                >
                  {isLast ? 'Got it' : 'Next'}
                  {!isLast && <ArrowRight size={13} />}
                </button>
              </div>
            </div>
          </>
        );

        return centered ? (
          // Flex wrapper does the centering — no CSS transform for Motion to clobber.
          <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
            <AnimatePresence mode="wait">
              <motion.div
                key={`card-${index}`}
                initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="pointer-events-auto relative w-full overflow-hidden p-5 shadow-[0_4px_8px_rgba(6,22,47,0.28)] sm:p-6"
                style={{ maxWidth: 400, background: MAP.panel, border: `1.5px solid ${MAP.ink}` }}
              >
                {/* Decoration only: the city in one frame, behind the story
                    cards that explain what the map is for. */}
                <img
                  src={publicAsset('images/illustration/calgary-bow-emblem.webp')}
                  alt=""
                  width={800} height={800} loading="lazy" aria-hidden="true"
                  className="pointer-events-none absolute -right-10 -top-10 w-40 opacity-[0.05] select-none"
                />
                {cardInner}
              </motion.div>
            </AnimatePresence>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`card-${index}`}
              initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="absolute p-5 shadow-[0_4px_8px_rgba(6,22,47,0.28)]"
              style={{ ...cardStyle, background: MAP.panel, border: `1.5px solid ${MAP.ink}` }}
            >
              {cardInner}
            </motion.div>
          </AnimatePresence>
        );
      })()}
    </div>
  );
}
