import { useState, useEffect, useRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, ArrowRight, MapPin, ChevronDown, Shield,
  Radio, AlertCircle, Car, Construction,
  CloudRain, Siren, ExternalLink, CheckCircle2,
} from 'lucide-react';
import { cn, publicAsset } from '@/src/lib/utils';
import { Button } from '@/src/components/ui/Button';

// ─── Data ────────────────────────────────────────────────────────────────────
const COMMUNITIES = [
  { name: 'Airdrie',         dist: 30,  dir: 'N',         type: 'City',   pop: '79,000+' },
  { name: 'Cochrane',        dist: 45,  dir: 'NW',        type: 'Town',   pop: '34,000+' },
  { name: 'Chestermere',     dist: 15,  dir: 'E',         type: 'City',   pop: '23,000+' },
  { name: 'Okotoks',         dist: 32,  dir: 'S',         type: 'Town',   pop: '34,000+' },
  { name: 'Strathmore',      dist: 44,  dir: 'E',         type: 'Town',   pop: '17,000+' },
  { name: 'High River',      dist: 60,  dir: 'S',         type: 'Town',   pop: '16,000+' },
  { name: 'Canmore',         dist: 103, dir: 'W',         type: 'Town',   pop: '16,000+' },
  { name: 'Langdon',         dist: 35,  dir: 'SE',        type: 'Village',pop: '7,500+' },
  { name: 'Crossfield',      dist: 52,  dir: 'N',         type: 'Town',   pop: '3,800+' },
  { name: 'Carstairs',       dist: 66,  dir: 'N',         type: 'Town',   pop: '4,600+' },
  { name: 'Didsbury',        dist: 80,  dir: 'N',         type: 'Town',   pop: '7,000+' },
  { name: 'Olds',            dist: 91,  dir: 'N',         type: 'Town',   pop: '9,500+' },
  { name: 'Black Diamond',   dist: 56,  dir: 'SW',        type: 'Town',   pop: '3,200+' },
  { name: 'Turner Valley',   dist: 58,  dir: 'SW',        type: 'Town',   pop: '2,500+' },
  { name: 'Nanton',          dist: 90,  dir: 'S',         type: 'Town',   pop: '2,600+' },
  { name: 'Irricana',        dist: 60,  dir: 'NE',        type: 'Village',pop: '1,500+' },
  { name: 'Beiseker',        dist: 70,  dir: 'NE',        type: 'Village',pop: '1,000+' },
  { name: 'Gleichen',        dist: 80,  dir: 'E',         type: 'Village',pop: '350+' },
  { name: 'Vulcan',          dist: 95,  dir: 'SE',        type: 'Town',   pop: '2,200+' },
  { name: 'Balzac',          dist: 12,  dir: 'N',         type: 'Hamlet', pop: '—' },
  { name: 'Springbank',      dist: 20,  dir: 'W',         type: 'Hamlet', pop: '—' },
  { name: 'Bragg Creek',     dist: 45,  dir: 'SW',        type: 'Hamlet', pop: '—' },
  { name: 'Priddis',         dist: 35,  dir: 'SW',        type: 'Hamlet', pop: '—' },
  { name: 'De Winton',       dist: 30,  dir: 'S',         type: 'Hamlet', pop: '—' },
  { name: 'Millarville',     dist: 45,  dir: 'SW',        type: 'Hamlet', pop: '—' },
  { name: 'Bearspaw',        dist: 15,  dir: 'NW',        type: 'Hamlet', pop: '—' },
  { name: 'Conrich',         dist: 25,  dir: 'E',         type: 'Hamlet', pop: '—' },
  { name: 'Linden',          dist: 75,  dir: 'NE',        type: 'Village',pop: '900+' },
  { name: 'Rocky View County',dist: 0,  dir: 'Surrounding',type: 'County', pop: '43,000+' },
  { name: 'Foothills County', dist: 0,  dir: 'Surrounding',type: 'County', pop: '22,000+' },
];

const FAQS = [
  {
    q: 'Which communities does Calgary Watch cover?',
    a: 'The map is designed to accept and display relevant reports across Calgary and nearby communities including Airdrie, Cochrane, Chestermere, Okotoks, Strathmore, High River, Canmore, and communities in Rocky View and Foothills counties. Coverage does not mean every place has a current report.',
  },
  {
    q: 'Does map coverage mean an area currently has incidents?',
    a: 'No. Coverage describes where the map can accept or display relevant reports. A community may have no markers in the selected time window, and marker count should not be treated as a crime rate.',
  },
  {
    q: 'Is Calgary Watch free to use?',
    a: 'Yes. Anyone can browse the public map without an account. A free account is required only to submit a community report.',
  },
  {
    q: 'How do I report a crime or incident in Calgary?',
    a: 'Call 911 for an emergency or crime in progress. For a Calgary police matter that is not in progress, call Calgary Police non-emergency at 403-266-1234. A Calgary Watch community post can inform neighbours, but it does not create a police report.',
  },
  {
    q: 'Is Airdrie AB safe?',
    a: "A single map cannot fairly label an entire city as safe or dangerous. Check each incident's type, date, and source, and use the City of Airdrie's official crime map for crime reported to RCMP. Calgary Watch provides a separate view of community reports and selected public-source incidents in the Airdrie area.",
  },
  {
    q: 'Are Calgary Watch reports confirmed by police?',
    a: 'Not necessarily. Community reports are user-submitted observations. Selected public-source items show their attribution. Read each marker’s source, timestamp, and status, and use official police data when you need police-reported crime information.',
  },
  {
    q: 'Does Calgary Watch cover Okotoks, High River, and Strathmore?',
    a: "Yes. Calgary Watch covers the full Calgary metropolitan region including Okotoks, High River, Strathmore, Chestermere, Langdon, Crossfield, Carstairs, and all communities within approximately 100 kilometres of Calgary. Community members in these areas can submit reports and see incidents from the same map.",
  },
  {
    q: 'How does Calgary Watch work?',
    a: 'Calgary Watch combines community-submitted observations with selected, attributed public-source information. Residents can browse the map freely and sign in to submit a report. It is an awareness tool, not a police dispatch feed or emergency-reporting service.',
  },
];

const CATEGORIES = [
  { icon: AlertCircle, label: 'Crime',          color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20',    desc: 'Break-ins, vehicle theft, assault, vandalism, suspicious activity, theft from vehicle, robbery' },
  { icon: Car,         label: 'Traffic',        color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20',desc: 'Collisions, road closures, Deerfoot Trail incidents, Stoney Trail congestion, highway accidents' },
  { icon: Construction,label: 'Infrastructure', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20',desc: 'Water main breaks, flooding, utility outages, road washouts, construction hazards' },
  { icon: CloudRain,   label: 'Weather',        color: 'text-[#7A6BA8]',  bg: 'bg-[#7A6BA8]/10 border-[#7A6BA8]/25',    desc: 'Severe weather warnings, icy roads, flash flooding, hail alerts, whiteout conditions, fog' },
  { icon: Siren,       label: 'Emergency',      color: 'text-emerald-400',bg: 'bg-emerald-500/10 border-emerald-500/20',desc: 'Active fires, EMS activity, evacuation notices, Amber Alerts, shelter-in-place orders' },
];

const OFFICIAL_LINKS = [
  { label: 'Calgary Police Service',      url: 'https://www.calgarypolice.ca',              desc: 'Non-emergency: 403-266-1234' },
  { label: 'City of Calgary Open Data',   url: 'https://data.calgary.ca',                   desc: 'Official incident & crime statistics' },
  { label: 'Alberta Emergency Alert',     url: 'https://www.alberta.ca/emergency-alerts',   desc: 'Province-wide emergency notifications' },
  { label: '511 Alberta Traffic',         url: 'https://511.alberta.ca',                    desc: 'Highway conditions & closures' },
  { label: 'Environment Canada Alerts',   url: 'https://weather.gc.ca/warnings/index_e.html?prov=ab', desc: 'Severe weather warnings for AB' },
  { label: 'Airdrie RCMP',               url: 'https://www.rcmp-grc.gc.ca/detach/en/d/437?wbdisable=true', desc: 'Non-emergency: 403-945-7267' },
];

// ─── FAQ Item ─────────────────────────────────────────────────────────────
function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div className={cn(
      'border rounded-2xl overflow-hidden transition-colors duration-200',
      open
        ? 'border-[#E52C20]/40 bg-[#E52C20]/5 light:bg-[#E52C20]/4'
        : 'border-white/8 light:border-stone-200 bg-white/[0.02] light:bg-white',
    )}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start justify-between gap-4 px-6 py-5 text-left"
        aria-expanded={open}
      >
        <span className={cn(
          'text-sm font-bold leading-snug transition-colors',
          open ? 'text-[#E52C20]' : 'text-white light:text-stone-900',
        )}>
          {q}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            'shrink-0 mt-0.5 transition-transform duration-300 text-stone-400',
            open && 'rotate-180 text-[#E52C20]',
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="px-6 pb-5 text-sm text-stone-400 light:text-stone-600 leading-relaxed border-t border-white/6 light:border-stone-100 pt-4">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Community Card ───────────────────────────────────────────────────────
const typeColor: Record<string, string> = {
  City:    'text-[#E52C20] bg-[#E52C20]/10 border-[#E52C20]/25',
  Town:    'text-[#2E8B7A] bg-[#2E8B7A]/10 border-[#2E8B7A]/25',
  Village: 'text-[#B0793C] bg-[#B0793C]/10 border-[#B0793C]/25',
  Hamlet:  'text-stone-400 bg-white/5 border-white/10',
  County:  'text-[#7A6BA8] bg-[#7A6BA8]/10 border-[#7A6BA8]/25',
};
const typeColorLight: Record<string, string> = {
  City:    'text-[#B8241A] bg-[#E52C20]/8 border-[#E52C20]/25',
  Town:    'text-[#1F6154] bg-[#2E8B7A]/10 border-[#2E8B7A]/25',
  Village: 'text-[#8A5710] bg-[#B0793C]/10 border-[#B0793C]/25',
  Hamlet:  'text-stone-500 bg-stone-50 border-stone-200',
  County:  'text-[#584C7E] bg-[#7A6BA8]/10 border-[#7A6BA8]/25',
};

function CommunityCard({ c, index, navigate }: { c: typeof COMMUNITIES[0]; index: number; navigate: ReturnType<typeof useNavigate> }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 18 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, delay: (index % 5) * 0.06, ease: 'easeOut' }}
      className={cn(
        'group relative rounded-2xl border p-4 cursor-pointer transition-all duration-200',
        'border-white/8 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/15',
        'light:border-stone-200 light:bg-white light:hover:border-stone-300 light:hover:bg-stone-50/80',
      )}
      onClick={() => navigate('/map')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate('/map')}
      aria-label={`View ${c.name} on the live map`}
    >
      {/* Type badge */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className={cn(
          'text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border',
          typeColor[c.type],
          'light:hidden',
        )}>
          {c.type}
        </span>
        <span className={cn(
          'text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border hidden',
          typeColorLight[c.type],
          'light:inline-block',
        )}>
          {c.type}
        </span>

        {c.dist > 0 && (
          <span className="font-mono text-[10px] text-stone-500 shrink-0">
            {c.dist} km {c.dir}
          </span>
        )}
        {c.dist === 0 && (
          <span className="font-mono text-[10px] text-stone-500 shrink-0">{c.dir}</span>
        )}
      </div>

      <p className="text-sm font-black text-white light:text-stone-900 leading-tight mb-1">{c.name}</p>
      {c.pop !== '—' && (
        <p className="text-[10px] text-stone-500 font-medium">{c.pop}</p>
      )}

      {/* Hover arrow */}
      <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <ArrowRight size={13} className="text-[#E52C20]" />
      </div>
    </motion.div>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────
const Section = memo(function Section({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
});

// ─── Main Page ────────────────────────────────────────────────────────────
export default function CoveragePage() {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // ── Inject page-specific JSON-LD schemas ─────────────────────────────────
  useEffect(() => {
    const inject = (id: string, data: object) => {
      let el = document.head.querySelector<HTMLScriptElement>(`script[data-ld="${id}"]`);
      if (!el) {
        el = document.createElement('script');
        el.setAttribute('type', 'application/ld+json');
        el.setAttribute('data-ld', id);
        document.head.appendChild(el);
      }
      el.textContent = JSON.stringify(data);
    };

    // ItemList — all 30 communities as structured data for rich results
    inject('coverage-itemlist', {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Calgary Area Communities Covered by Calgary Watch',
      description: 'Communities across the Calgary metropolitan region where Calgary Watch is designed to accept or display relevant community safety reports.',
      numberOfItems: COMMUNITIES.length,
      itemListElement: COMMUNITIES.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: `${c.name}, Alberta`,
        item: {
          '@type': 'City',
          name: c.name,
          addressRegion: 'AB',
          addressCountry: 'CA',
          url: 'https://calgarywatch.ca/map',
        },
      })),
    });

    // FAQPage — generated from the questions visible on this page so search
    // engines and visitors receive the same answers.
    inject('coverage-faq', {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.a,
        },
      })),
    });

    return () => {
      document.head.querySelector('script[data-ld="coverage-itemlist"]')?.remove();
      document.head.querySelector('script[data-ld="coverage-faq"]')?.remove();
    };
  }, []);

  return (
    <div className="relative min-h-dvh bg-stone-950 light:bg-[#F5EFE4] text-white light:text-stone-900 font-sans overflow-x-hidden isolate">

      {/* Subtle background texture */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-0 opacity-[0.03] light:opacity-[0.06]"
          style={{ backgroundImage: 'radial-gradient(circle, rgba(74,144,217,0.6) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_at_top_left,rgba(74,144,217,0.08),transparent_55%)]" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-[radial-gradient(ellipse_at_bottom_right,rgba(46,139,122,0.06),transparent_55%)]" />
      </div>

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 border-b border-white/8 light:border-stone-200/80 bg-stone-950/80 light:bg-[#F5EFE4]/85 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm font-bold text-stone-400 light:text-stone-600 hover:text-white light:hover:text-stone-900 transition-colors"
          >
            <ArrowLeft size={15} />
            Calgary Watch
          </button>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-8 px-4 rounded-full text-xs font-bold bg-[#E52C20] hover:bg-[#3a7fc8]"
              onClick={() => navigate('/map')}
            >
              Open Map
            </Button>
          </div>
        </div>
      </nav>

      <div className="relative z-10">

        {/* ── HERO ────────────────────────────────────────────────────────── */}
        <header className="max-w-6xl mx-auto px-5 sm:px-8 pt-16 pb-14 md:pt-24 md:pb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
          >
            {/* Eyebrow */}
            <div className="flex items-center gap-3 mb-6">
              <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.28em] uppercase text-[#2E8B7A]">
                <span className="inline-block w-1.5 h-3 bg-[#2E8B7A] animate-pulse" aria-hidden="true" />
                Coverage · Alberta · {new Date().getFullYear()}
              </span>
              <span className="h-px flex-1 max-w-16 bg-[#2E8B7A]/30" aria-hidden="true" />
            </div>

            <div className="mb-6 flex items-start gap-6">
              <h1 className="text-[clamp(2.6rem,8vw,6rem)] font-black leading-[0.92] tracking-tight max-w-4xl">
                Calgary Area
                <span className="block text-[#E52C20]">Safety Guide.</span>
              </h1>
              {/* The reach, drawn: a province with a heart in it says what
                  "30+ communities, 100 km" says, before the number is read. */}
              <img
                src={publicAsset('images/alberta-heart.webp')}
                alt=""
                width={800} height={800} loading="lazy"
                className="hidden w-28 shrink-0 self-center opacity-90 lg:block xl:w-36"
                aria-hidden="true"
              />
            </div>

            <p className="text-base sm:text-lg text-stone-400 light:text-stone-600 max-w-2xl leading-relaxed mb-10 border-l-2 border-[#E52C20]/40 pl-4">
              Community reports and selected public-source incident information for Calgary
              and nearby places — from Airdrie and Cochrane to Okotoks, Strathmore, and High River.
            </p>

            <nav className="mb-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap" aria-label="Local safety guides">
              <a
                href="/calgary-neighbourhood-watch"
                className="group inline-flex min-h-12 items-center justify-between gap-4 rounded-xl bg-[#EAE3D5] px-4 py-3 text-sm font-black text-[#06162F] ring-1 ring-[#D8CEBC] transition-colors hover:bg-[#EFE6D6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E52C20] focus-visible:ring-offset-2 focus-visible:ring-offset-[#06162F]"
              >
                Calgary neighbourhood watch guide
                <ArrowRight size={16} className="shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </a>
              <a
                href="/airdrie-crime-map"
                className="group inline-flex min-h-12 items-center justify-between gap-4 rounded-xl border border-[rgba(255,255,255,0.2)] px-4 py-3 text-sm font-black text-[#B9DCF9] transition-colors hover:border-[#E52C20] hover:bg-[rgba(74,144,217,0.1)] hover:text-[#F2EFE8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E52C20] focus-visible:ring-offset-2 focus-visible:ring-offset-[#06162F] light:border-stone-300 light:text-[#B8241A] light:hover:bg-[#EAE3D5] light:hover:text-[#06162F]"
              >
                Airdrie crime map source guide
                <ArrowRight size={16} className="shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </a>
            </nav>

            {/* Stats strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { value: '100 km',  label: 'Coverage radius',   color: 'text-[#E52C20]' },
                { value: '30+',     label: 'Communities',       color: 'text-[#2E8B7A]' },
                { value: '5',       label: 'Incident categories', color: 'text-[#B0793C]' },
                { value: 'Free',    label: 'Always open',       color: 'text-emerald-400' },
              ].map(({ value, label, color }) => (
                <div key={label} className="rounded-2xl border border-white/8 light:border-stone-200 bg-white/[0.03] light:bg-white px-4 py-3">
                  <p className={cn('text-2xl font-black font-mono', color)}>{value}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </header>

        {/* ── COMMUNITIES GRID ────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-10 md:py-16 border-t border-white/5 light:border-stone-200/80">
          <Section>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
              <div>
                <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#E52C20] mb-2">Coverage Map</p>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                  30+ Communities Covered
                </h2>
              </div>
              <p className="text-xs text-stone-500 light:text-stone-500 max-w-xs leading-relaxed">
                Click any community to view current incidents on the live map.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
              {COMMUNITIES.map((c, i) => (
                <CommunityCard key={c.name} c={c} index={i} navigate={navigate} />
              ))}
            </div>

            {/* Legend */}
            <div className="mt-5 flex flex-wrap gap-3">
              {Object.entries(typeColor).map(([type]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <span className={cn('w-2 h-2 rounded-full', {
                    'bg-[#E52C20]': type === 'City',
                    'bg-[#2E8B7A]': type === 'Town',
                    'bg-[#B0793C]': type === 'Village',
                    'bg-stone-500': type === 'Hamlet',
                    'bg-[#7A6BA8]': type === 'County',
                  })} />
                  <span className="text-[10px] text-stone-500">{type}</span>
                </div>
              ))}
            </div>
          </Section>
        </section>

        {/* ── INCIDENT CATEGORIES ─────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-10 md:py-16 border-t border-white/5 light:border-stone-200/80">
          <Section>
            <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#2E8B7A] mb-2">What We Track</p>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-8">
              5 Incident Categories
            </h2>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {CATEGORIES.map(({ icon: Icon, label, color, bg, desc }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-30px' }}
                  transition={{ duration: 0.4, delay: i * 0.07 }}
                  className={cn('rounded-2xl border p-5', bg)}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Icon size={18} className={color} />
                    <span className={cn('text-sm font-black', color)}>{label}</span>
                  </div>
                  <p className="text-xs text-stone-400 light:text-stone-600 leading-relaxed">{desc}</p>
                </motion.div>
              ))}

              {/* Bonus card */}
              <motion.div
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.4, delay: 0.35 }}
                className="rounded-2xl border border-white/6 light:border-stone-200 bg-white/[0.02] light:bg-white p-5 flex flex-col justify-between"
              >
                <div>
                  <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-3">Every marker</p>
                  <p className="text-3xl font-black text-white light:text-stone-900">Source</p>
                  <p className="text-xs text-stone-400 light:text-stone-600 mt-1">shown on incident details</p>
                </div>
                <div className="mt-4 h-px bg-gradient-to-r from-[#E52C20]/40 to-transparent" />
              </motion.div>
            </div>
          </Section>
        </section>

        {/* ── CALGARY QUADRANTS ────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-10 md:py-16 border-t border-white/5 light:border-stone-200/80">
          <Section>
            <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#B0793C] mb-2">City Zones</p>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">Calgary Quadrant Coverage</h2>
            <p className="text-sm text-stone-400 light:text-stone-600 mb-8 max-w-2xl">
              Calgary is divided into four quadrants plus the downtown core. Calgary Watch monitors community-reported incidents across all zones, with particular density data for high-traffic corridors.
            </p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { zone: 'NW Calgary',       desc: 'Tuscany, Rocky Ridge, Nolan Hill, Evanston, Panorama Hills, Hamptons',                     accent: 'border-[#E52C20]/30 bg-[#E52C20]/5' },
                { zone: 'NE Calgary',       desc: 'Saddle Ridge, Skyview Ranch, Redstone, Cornerstone, Martindale, Temple, Falconridge',       accent: 'border-[#2E8B7A]/30 bg-[#2E8B7A]/5' },
                { zone: 'SW Calgary',       desc: 'Signal Hill, Cougar Ridge, Discovery Ridge, Aspen Woods, West Springs, Lakeview, Richmond', accent: 'border-[#B0793C]/30 bg-[#B0793C]/5' },
                { zone: 'SE Calgary',       desc: 'Auburn Bay, Mahogany, Cranston, New Brighton, McKenzie Towne, Legacy, Copperfield',         accent: 'border-[#7A6BA8]/30 bg-[#7A6BA8]/5' },
                { zone: 'Downtown Core',    desc: 'Beltline, East Village, Chinatown, Mission, Inglewood, Kensington, Hillhurst, Bridgeland',  accent: 'border-red-500/30 bg-red-500/5' },
                { zone: 'Key Corridors',    desc: 'Deerfoot Trail, Stoney Trail, Glenmore Trail, Crowchild Trail, Memorial Drive, 16 Ave',     accent: 'border-stone-500/30 bg-white/3' },
              ].map(({ zone, desc, accent }) => (
                <div key={zone} className={cn('rounded-2xl border p-4 light:border-stone-200 light:bg-white', accent)}>
                  <p className="text-sm font-black text-white light:text-stone-900 mb-1.5">{zone}</p>
                  <p className="text-[11px] text-stone-400 light:text-stone-600 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </Section>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-10 md:py-16 border-t border-white/5 light:border-stone-200/80">
          <Section>
            <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-[#E52C20] mb-2">Common Questions</p>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-8">
              Calgary Area Safety FAQ
            </h2>

            <div className="space-y-2.5 max-w-3xl">
              {FAQS.map((faq, i) => (
                <FaqItem
                  key={i}
                  q={faq.q}
                  a={faq.a}
                  open={openFaq === i}
                  onToggle={() => setOpenFaq(openFaq === i ? null : i)}
                />
              ))}
            </div>
          </Section>
        </section>

        {/* ── SEO CONTENT BLOCK ────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-10 md:py-16 border-t border-white/5 light:border-stone-200/80">
          <Section>
            <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-stone-500 mb-6">About This Service</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 text-sm text-stone-400 light:text-stone-600 leading-relaxed">
              <div>
                <h3 className="text-sm font-black text-white light:text-stone-900 mb-2">Crime mapping for Calgary</h3>
                <p>Calgary Watch displays recent community observations and selected public-source information across Calgary. Read every marker with its timestamp, source, and status; the map is not a complete record of police-reported crime.</p>
              </div>
              <div>
                <h3 className="text-sm font-black text-white light:text-stone-900 mb-2">Airdrie &amp; Cochrane coverage</h3>
                <p>Calgary Watch accepts community reports across Airdrie, Cochrane, and surrounding Rocky View County. For Airdrie crime reported to police, use the City of Airdrie's official RCMP-reported crime map; Calgary Watch is a separate community-awareness source.</p>
              </div>
              <div>
                <h3 className="text-sm font-black text-white light:text-stone-900 mb-2">Southern Alberta communities</h3>
                <p>The map is designed to accept relevant community reports around Okotoks, High River, and Strathmore. Public-source coverage varies, so an empty map does not establish that an area has no incidents.</p>
              </div>
              <div>
                <h3 className="text-sm font-black text-white light:text-stone-900 mb-2">Rural communities &amp; hamlets</h3>
                <p>Residents around Bragg Creek, Springbank, Priddis, Millarville, De Winton, and Bearspaw can use the same map and community-report flow. Availability and recency still depend on the reports and sources present.</p>
              </div>
              <div>
                <h3 className="text-sm font-black text-white light:text-stone-900 mb-2">Anonymous community reporting</h3>
                <p>Every Calgary Watch report can be submitted anonymously. Your name and contact information are never displayed publicly. This encourages reporting in situations where witnesses may be reluctant to identify themselves — particularly important for crime in progress or ongoing suspicious activity.</p>
              </div>
              <div>
                <h3 className="text-sm font-black text-white light:text-stone-900 mb-2">Official data integration</h3>
                <p>Alongside community reports, Calgary Watch displays selected attributed public-source items, including weather and highway information. It does not promise a complete picture; always follow the source link when official confirmation matters.</p>
              </div>
            </div>
          </Section>
        </section>

        {/* ── OFFICIAL RESOURCES ───────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-10 md:py-16 border-t border-white/5 light:border-stone-200/80">
          <Section>
            <p className="font-mono text-[10px] tracking-[0.24em] uppercase text-stone-500 mb-2">External Resources</p>
            <h2 className="text-xl font-black tracking-tight mb-6">Official Safety Resources</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {OFFICIAL_LINKS.map(({ label, url, desc }) => (
                <a
                  key={label}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'group flex items-start justify-between gap-3 rounded-2xl border p-4 transition-all duration-200',
                    'border-white/8 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/15',
                    'light:border-stone-200 light:bg-white light:hover:border-stone-300 light:hover:bg-stone-50',
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white light:text-stone-900 truncate">{label}</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">{desc}</p>
                  </div>
                  <ExternalLink size={13} className="shrink-0 mt-0.5 text-stone-600 group-hover:text-[#E52C20] transition-colors" />
                </a>
              ))}
            </div>
          </Section>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-10 md:py-16 border-t border-white/5 light:border-stone-200/80">
          <Section>
            <div className="relative overflow-hidden rounded-2xl md:rounded-[2rem] border border-white/10 light:border-stone-200 bg-gradient-to-br from-[#0d1929] to-stone-950 light:from-white light:to-stone-50 p-8 md:p-12">
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(circle at 15% 50%, rgba(74,144,217,0.14), transparent 45%), radial-gradient(circle at 85% 50%, rgba(46,139,122,0.1), transparent 45%)' }}
                aria-hidden="true"
              />
              <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-mono text-[10px] tracking-[0.24em] uppercase text-emerald-400">Live now</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white light:text-stone-900 mb-2">
                    See Calgary in real time.
                  </h2>
                  <p className="text-sm text-stone-400 light:text-stone-600">
                    Open the live map to monitor incidents across Calgary and surrounding communities.
                  </p>
                </div>
                <div className="flex flex-col gap-2.5 sm:min-w-44">
                  <Button
                    size="lg"
                    className="h-12 px-7 rounded-2xl font-black text-sm"
                    style={{ background: 'linear-gradient(135deg,#E52C20,#2E8B7A)', boxShadow: '0 8px 28px -12px rgba(74,144,217,0.7)' }}
                    onClick={() => navigate('/map')}
                  >
                    Open Live Map
                    <ArrowRight className="ml-2" size={15} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="h-12 px-7 rounded-2xl font-black text-sm bg-white/8 light:bg-white border border-white/15 light:border-stone-300 text-white light:text-stone-900 hover:bg-white/12 light:hover:bg-stone-100"
                    onClick={() => navigate('/map?report=true')}
                  >
                    Submit a Report
                  </Button>
                </div>
              </div>
            </div>
          </Section>
        </section>

        {/* ── FOOTER ───────────────────────────────────────────────────────── */}
        <footer className="max-w-6xl mx-auto px-5 sm:px-8 py-8 border-t border-white/5 light:border-stone-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={publicAsset('icon.svg')} alt="" width={18} height={18} className="w-[18px] h-[18px] opacity-70" />
            <span className="text-sm font-bold text-stone-500">Calgary Watch</span>
          </div>
          <p className="text-xs text-stone-600 text-center">
            Community safety data for Calgary, AB and surrounding region · Always verify with official sources.
          </p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs text-stone-500 hover:text-white light:hover:text-stone-900 transition-colors"
          >
            ← Back to home
          </button>
        </footer>

      </div>
    </div>
  );
}
