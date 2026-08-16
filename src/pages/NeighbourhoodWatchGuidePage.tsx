import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleDot,
  Eye,
  MapPin,
  Radio,
  Users,
} from 'lucide-react';
import {
  GUIDE_COMPARISON,
  GUIDE_FAQS,
  GUIDE_SOURCES,
  GUIDE_UPDATED,
} from '@/src/content/neighbourhoodWatchGuide';
import {
  GuideAnchorNav,
  GuideFaqs,
  GuideFinalCta,
  GuideFooter,
  GuideNav,
  GuideReportingBand,
  GuideSources,
} from '@/src/components/guides/GuideUI';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E52C20] focus-visible:ring-offset-2';

const markerChecks = [
  { label: 'Time', copy: 'How recently was it reported?', color: '#E52C20' },
  { label: 'Source', copy: 'Community observation or attributed public source?', color: '#2E8B7A' },
  { label: 'Status', copy: 'Is it unverified, corroborated, or official?', color: '#B0793C' },
];

export default function NeighbourhoodWatchGuidePage() {
  return (
    <div className="min-h-dvh bg-[#F7F3EA] text-[#06162F]">
      <GuideNav locationLabel="Calgary neighbourhood guide" />
      <main>
        <section className="relative overflow-hidden border-b border-[#DCD2C0] bg-[#EAE3D5]" aria-labelledby="guide-title">
          <div className="absolute inset-y-0 right-0 hidden w-[38%] bg-[#E52C20] lg:block" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,1.04fr)_minmax(24rem,0.96fr)] lg:items-center lg:gap-16 lg:py-20">
            <div className="max-w-3xl">
              <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span className="inline-flex items-center gap-2 font-black text-[#2E8B7A]">
                  <CircleDot size={15} aria-hidden="true" /> Independent Calgary guide
                </span>
                <span className="text-[#8A8073]" aria-hidden="true">/</span>
                <span className="font-semibold text-[#6E6357]">Reviewed {GUIDE_UPDATED}</span>
              </div>

              <h1 id="guide-title" className="max-w-3xl text-balance font-display text-[clamp(3rem,7vw,5.75rem)] font-black leading-[0.93] tracking-[-0.035em] text-[#06162F]">
                Know what’s happening <span className="text-[#B8241A]">around your block.</span>
              </h1>
              <p className="mt-7 max-w-2xl text-pretty text-lg leading-8 text-[#5A5247] sm:text-xl sm:leading-9">
                Calgary neighbourhood watch starts with clear local context. See recent reports, understand their source, and know which official channel to use when something needs action.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a href="/map" className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#06162F] px-6 font-black text-[#F2EFE8] transition-colors hover:bg-[#06162F] active:bg-[#0B1B14] ${focusRing}`}>
                  <MapPin size={17} aria-hidden="true" /> Check incidents near me
                </a>
                <a href="/map?report=true" className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border-2 border-[#D8CEBC] bg-[#F7F3EA] px-6 font-black text-[#06162F] transition-colors hover:border-[#E52C20] hover:bg-[#EFE6D6] ${focusRing}`}>
                  Sign in to report <ArrowRight size={17} aria-hidden="true" />
                </a>
              </div>

              <p className="mt-7 flex max-w-2xl items-start gap-3 border-y border-[#B0793C] py-4 text-sm font-semibold leading-6 text-[#5A5247]">
                <Eye className="mt-0.5 shrink-0 text-[#9A7318]" size={18} aria-hidden="true" />
                Calgary Watch is an independent community map—not a Calgary Police Service dispatch feed or officer tracker.
              </p>
            </div>

            <div className="relative lg:py-5">
              <div className="absolute -bottom-4 -left-4 top-10 w-20 bg-[#2E8B7A] sm:-left-6" aria-hidden="true" />
              <figure className="relative overflow-hidden rounded-2xl bg-[#06162F] shadow-[0_24px_60px_rgba(11,31,51,0.22)]">
                <img
                  src="/images/photo/calgary5.webp"
                  alt="Three Calgary residents looking at a phone together downtown"
                  width={1200}
                  height={677}
                  fetchPriority="high"
                  className="aspect-[4/3] w-full object-cover object-center sm:aspect-[16/10] lg:aspect-[4/5]"
                />
                <figcaption className="absolute inset-x-0 bottom-0 bg-[linear-gradient(transparent,rgba(7,23,39,0.94))] px-5 pb-5 pt-20 text-[#F2EFE8] sm:px-6 sm:pb-6">
                  <span className="block text-xs font-black uppercase tracking-[0.16em] text-[#E52C20]">Community awareness</span>
                  <span className="mt-1 block max-w-sm text-lg font-black leading-6">Useful context, without speculation or alarm.</span>
                </figcaption>
              </figure>
              <div className="relative -mt-px grid grid-cols-2 overflow-hidden rounded-b-2xl border-x border-b border-[#DCD2C0] bg-[#F7F3EA] sm:absolute sm:-bottom-5 sm:-right-5 sm:w-[21rem] sm:rounded-xl sm:border sm:shadow-lg">
                <a href="tel:911" className={`min-h-16 border-r border-[#E52C20] bg-[#FFF4F1] px-4 py-3 transition-colors hover:bg-[#FFE7E2] ${focusRing}`}>
                  <span className="block text-[0.68rem] font-black uppercase tracking-wider text-[#8F1D14]">Immediate danger</span>
                  <span className="mt-1 block font-black text-[#B42318]">Call 911</span>
                </a>
                <a href="tel:4032661234" className={`min-h-16 px-4 py-3 transition-colors hover:bg-[#EAE3D5] ${focusRing}`}>
                  <span className="block text-[0.68rem] font-black uppercase tracking-wider text-[#6E6357]">Not in progress</span>
                  <span className="mt-1 block font-black text-[#06162F]">403-266-1234</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        <GuideAnchorNav items={[
          { href: '#understand-the-map', label: 'Understand the map' },
          { href: '#choose-a-source', label: 'Choose a source' },
          { href: '#reporting', label: 'Reporting' },
          { href: '#questions', label: 'Questions' },
        ]} />

        <section id="understand-the-map" className="scroll-mt-28 bg-[#F7F3EA]" aria-labelledby="near-me-heading">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 md:py-24">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:gap-20">
              <div>
                <span className="font-mono text-sm font-black text-[#B8241A]">01 / READ THE MAP</span>
                <h2 id="near-me-heading" className="mt-4 max-w-3xl text-balance font-display text-4xl font-black leading-tight tracking-[-0.03em] md:text-5xl">
                  “Current police activity near me” can mean several different things.
                </h2>
                <div className="mt-7 max-w-3xl space-y-5 text-pretty text-lg leading-8 text-[#6E6357]">
                  <p>People use that phrase for a siren nearby, a collision-related road closure, a community observation, or official reported-crime statistics. No single public map contains every live police call or officer location.</p>
                  <p>Calgary Watch shows recent community observations and selected public-source incidents. It supports awareness, but it cannot confirm that police attended an event.</p>
                </div>
              </div>

              <aside className="self-start border-t-4 border-[#E52C20] bg-[#EAE3D5] px-6 py-7 sm:px-8 sm:py-9" aria-label="How to read a map marker">
                <div className="flex items-center gap-3">
                  <Eye className="text-[#B8241A]" size={23} aria-hidden="true" />
                  <h3 className="text-xl font-black tracking-[-0.02em]">Read every marker in context</h3>
                </div>
                <ul className="mt-7">
                  {markerChecks.map((item) => (
                    <li key={item.label} className="grid grid-cols-[4px_5rem_1fr] gap-4 border-t border-[#DCD2C0] py-5 first:border-t-0 first:pt-0 last:pb-0">
                      <span className="h-full min-h-10" style={{ backgroundColor: item.color }} aria-hidden="true" />
                      <strong className="text-sm text-[#06162F]">{item.label}</strong>
                      <span className="text-sm leading-6 text-[#6E6357]">{item.copy}</span>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </div>
        </section>

        <section id="choose-a-source" className="scroll-mt-28 bg-[#06162F] text-[#F2EFE8]" aria-labelledby="source-heading">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 md:py-24">
            <div className="max-w-3xl">
              <span className="font-mono text-sm font-black text-[#E52C20]">02 / CHOOSE THE RIGHT SOURCE</span>
              <h2 id="source-heading" className="mt-4 text-balance font-display text-4xl font-black leading-tight tracking-[-0.03em] md:text-5xl">One question. Four different routes.</h2>
              <p className="mt-5 max-w-2xl text-pretty text-lg leading-8 text-[#D8CEBC]">A community map, official statistics, and emergency reporting each do a different job. Start with what you actually need to know.</p>
            </div>

            <ol className="mt-10 border-y border-[rgba(255,255,255,0.18)]">
              {GUIDE_COMPARISON.map((row, index) => (
                <li key={row.need} className="grid gap-4 border-b border-[rgba(255,255,255,0.18)] py-6 last:border-b-0 sm:grid-cols-[3rem_minmax(0,1fr)_minmax(12rem,0.55fr)_auto] sm:items-center sm:gap-6 md:py-7">
                  <span className="font-mono text-xl font-black text-[#E52C20]" aria-hidden="true">0{index + 1}</span>
                  <p className="max-w-xl text-lg font-black leading-7 text-[#F2EFE8]">{row.need}</p>
                  <p className="text-sm font-semibold leading-6 text-[#C6BCA9]">{row.source}</p>
                  <a
                    href={row.action}
                    rel={row.action.startsWith('http') ? 'external' : undefined}
                    className={`group inline-flex min-h-11 items-center gap-2 font-black text-[#E52C20] transition-colors hover:text-[#F2EFE8] ${focusRing}`}
                  >
                    {row.actionLabel}
                    {row.action.startsWith('http') ? <ArrowUpRight size={16} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" /> : <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-[#DDF4EE]" aria-labelledby="block-watch-heading">
          <div className="mx-auto grid max-w-7xl lg:grid-cols-2">
            <div className="px-5 py-16 sm:px-8 md:py-24 lg:pr-16">
              <span className="font-mono text-sm font-black text-[#2E8B7A]">03 / KNOW THE DIFFERENCE</span>
              <h2 id="block-watch-heading" className="mt-4 max-w-2xl text-balance font-display text-4xl font-black leading-tight tracking-[-0.03em] md:text-5xl">Block Watch and Calgary Watch are different.</h2>
              <div className="mt-7 max-w-2xl space-y-5 text-pretty text-lg leading-8 text-[#345E57]">
                <p><strong className="text-[#06162F]">Block Watch</strong> generally means neighbours organizing on their own block to reduce opportunities for crime, share prevention information, and report suspicious activity through the appropriate channels.</p>
                <p><strong className="text-[#06162F]">Calgary Watch</strong> is an independent public map for recent reports across many communities. It is not a Block Watch chapter or a Calgary Police Service program.</p>
              </div>
            </div>

            <div className="bg-[#2E8B7A] px-5 py-16 text-[#F2EFE8] sm:px-8 md:py-24 lg:px-16">
              <div className="flex size-12 items-center justify-center rounded-xl bg-[#06162F] text-[#E52C20]">
                <Users size={23} aria-hidden="true" />
              </div>
              <div className="mt-7 flex items-center gap-3">
                <Radio size={20} aria-hidden="true" />
                <h3 className="text-2xl font-black">A useful neighbourhood routine</h3>
              </div>
              <ol className="mt-7 border-y border-[rgba(255,255,255,0.28)]">
                {[
                  'Check the time, source, and status.',
                  'Use 911 or police non-emergency when required.',
                  'Share only what you observed; protect people’s privacy.',
                ].map((step) => (
                  <li key={step} className="grid grid-cols-[2rem_1fr] gap-4 border-b border-[rgba(255,255,255,0.28)] py-5 last:border-b-0">
                    <Check className="mt-0.5 text-[#F2EFE8]" size={20} strokeWidth={3} aria-hidden="true" />
                    <span className="font-bold leading-6 text-[#F2EFE8]">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <GuideReportingBand
          title="Report through the right channel first."
          body="Call 911 for an emergency or crime in progress. For a Calgary police matter that is not in progress, call 403-266-1234. Posting to Calgary Watch does not create a police report."
          phoneHref="tel:4032661234"
          phoneLabel="Police non-emergency"
        />
        <GuideFaqs title="Questions people ask before opening the map." faqs={GUIDE_FAQS} />
        <GuideSources title="Official Calgary references" sources={GUIDE_SOURCES} />
        <GuideFinalCta title="Start with what is near you." body="Browse recent reports for free. Check the timestamp and source on every marker before deciding what it means." />
      </main>
      <GuideFooter extraLink={{ href: '/airdrie-crime-map', label: 'Airdrie guide' }} />
    </div>
  );
}
