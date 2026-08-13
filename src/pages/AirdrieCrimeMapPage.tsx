import { Eye, MapPinned, Route } from 'lucide-react';
import {
  AIRDRIE_GUIDE_FAQS,
  AIRDRIE_GUIDE_SOURCES,
  AIRDRIE_GUIDE_UPDATED,
  AIRDRIE_MAP_COMPARISON,
} from '@/src/content/airdrieCrimeMapGuide';
import {
  GuideAnchorNav,
  GuideDecisionList,
  GuideFaqs,
  GuideFinalCta,
  GuideFooter,
  GuideHero,
  GuideNav,
  GuideReportingBand,
  GuideSources,
} from '@/src/components/guides/GuideUI';

export default function AirdrieCrimeMapPage() {
  return (
    <div className="min-h-dvh bg-white text-[#0B1F33]">
      <GuideNav locationLabel="Airdrie crime map guide" />
      <main>
        <GuideHero
          label="Airdrie community safety guide"
          updated={AIRDRIE_GUIDE_UPDATED}
          title={<>Airdrie crime maps: <span className="text-[#8BC6FF]">know which map you’re reading.</span></>}
          description="Check recent community reports around Airdrie, compare them with the City’s official RCMP-reported crime map, and use the right reporting channel when something needs action."
          primaryAction={{ href: '/map', label: 'View Airdrie-area reports' }}
          secondaryAction={{ href: AIRDRIE_GUIDE_SOURCES[0].url, label: 'Official Airdrie crime map', external: true }}
          statusTitle="Two maps, two different sources"
          statusBody="Calgary Watch is an independent community map. The City of Airdrie publishes the official map for crime reported to Airdrie RCMP."
          quickActions={[
            { label: 'Immediate danger', value: 'Call 911', href: 'tel:911', tone: 'emergency' },
            { label: 'RCMP matter, not in progress', value: '403-945-7267', href: 'tel:4039457267' },
            { label: 'Municipal service concern', value: 'Airdrie 311', href: 'tel:311' },
          ]}
        />
        <GuideAnchorNav items={[
          { href: '#understand-the-map', label: 'Compare the maps' },
          { href: '#choose-a-source', label: 'Choose a source' },
          { href: '#reporting', label: 'Reporting' },
          { href: '#questions', label: 'Questions' },
        ]} />

        <section id="understand-the-map" className="scroll-mt-28 bg-white" aria-labelledby="two-maps-heading">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 md:py-24">
            <div className="max-w-4xl">
              <h2 id="two-maps-heading" className="text-balance font-display text-4xl font-black leading-tight tracking-[-0.03em] md:text-5xl">Two maps answer different questions.</h2>
              <p className="mt-6 max-w-3xl text-pretty text-lg leading-8 text-slate-600">Use Calgary Watch for recent local awareness. Use the City of Airdrie map when the question specifically concerns crime reported to Airdrie RCMP.</p>
            </div>
            <div className="mt-12 grid gap-4 lg:grid-cols-2">
              <article className="rounded-2xl bg-[#0B1F33] p-6 text-[#F7FBFF] sm:p-8">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-[#4A90D9] text-[#071727]"><MapPinned size={22} aria-hidden="true" /></div>
                  <span className="rounded-full bg-[rgba(255,255,255,0.1)] px-3 py-1 text-xs font-bold text-white/75">Community awareness</span>
                </div>
                <h3 className="mt-8 text-2xl font-black tracking-[-0.02em]">Calgary Watch map</h3>
                <p className="mt-4 text-pretty leading-7 text-[#C8D8E8]">Recent community observations and selected public-source incidents. Read each marker’s timestamp, source, and status.</p>
                <a href="/map" className="mt-7 inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-black text-[#0B1F33] transition-colors hover:bg-[#E8F3FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8BC6FF]">View community reports</a>
              </article>
              <article className="rounded-2xl bg-[#E8F3FC] p-6 ring-1 ring-[#B9D5EA] sm:p-8">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-white text-[#174A6E]"><Route size={22} aria-hidden="true" /></div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#40566B]">Police-reported crime</span>
                </div>
                <h3 className="mt-8 text-2xl font-black tracking-[-0.02em]">City of Airdrie crime map</h3>
                <p className="mt-4 text-pretty leading-7 text-[#40566B]">The official starting point for crime reported to Airdrie RCMP. It is separate from Calgary Watch.</p>
                <a href={AIRDRIE_GUIDE_SOURCES[0].url} rel="external" className="mt-7 inline-flex min-h-11 items-center rounded-lg bg-[#174A6E] px-4 text-sm font-black text-[#F7FBFF] transition-colors hover:bg-[#0B1F33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4A90D9]">Open the official map</a>
              </article>
            </div>
            <div className="mt-8 flex max-w-4xl items-start gap-4 rounded-xl bg-[#F5F8FA] p-5 ring-1 ring-slate-200">
              <Eye size={21} className="mt-0.5 shrink-0 text-[#176A5D]" aria-hidden="true" />
              <p className="text-pretty leading-7 text-slate-600">Neither map is a public dispatch feed. Neither shows officer locations or confirms that a specific police response is underway.</p>
            </div>
          </div>
        </section>

        <GuideDecisionList
          title="Start with the source that matches the need."
          intro="Community awareness, police-reported crime, emergencies, and non-urgent RCMP matters are separate jobs."
          rows={AIRDRIE_MAP_COMPARISON}
        />

        <section className="bg-[#0B1F33] text-[#F7FBFF]" aria-labelledby="read-map-heading">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 md:py-24 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-center lg:gap-20">
            <div>
              <h2 id="read-map-heading" className="max-w-3xl text-balance font-display text-4xl font-black leading-tight tracking-[-0.03em] md:text-5xl">Read an incident before drawing a conclusion.</h2>
              <div className="mt-7 max-w-3xl space-y-5 text-pretty text-lg leading-8 text-[#C8D8E8]">
                <p>Start with the timestamp. A recent marker and an older marker do not describe the same conditions. Then check whether the item came from a community member or an attributed public source.</p>
                <p>Marker counts are not crime rates. They depend on the selected time window, available sources, and what people choose to report.</p>
              </div>
            </div>
            <ol className="overflow-hidden rounded-2xl bg-white text-[#0B1F33]">
              {[
                ['When', 'When was it reported?'],
                ['Source', 'Who or what supplied it?'],
                ['Action', 'Does it need an official report?'],
              ].map(([label, copy], index) => (
                <li key={label} className="grid grid-cols-[2rem_1fr] gap-4 border-b border-slate-200 p-5 last:border-b-0">
                  <span className="font-black text-[#4A90D9]">{index + 1}</span>
                  <span><strong className="block">{label}</strong><span className="mt-1 block text-sm leading-6 text-slate-600">{copy}</span></span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <GuideReportingBand
          title="Report through the right channel first."
          body="Call 911 for immediate danger or a crime in progress. For an Airdrie police matter that is not in progress, call RCMP non-emergency at 403-945-7267. Calgary Watch posts are not police reports."
          phoneHref="tel:4039457267"
          phoneLabel="Airdrie RCMP non-emergency"
        />
        <GuideFaqs title="Airdrie crime-map questions, answered plainly." faqs={AIRDRIE_GUIDE_FAQS} />
        <GuideSources title="Official Airdrie references" sources={AIRDRIE_GUIDE_SOURCES} />
        <GuideFinalCta title="Check the Airdrie area with the source in view." body="Browse the community map for free, then use the City or RCMP source whenever official confirmation matters." />
      </main>
      <GuideFooter extraLink={{ href: '/calgary-neighbourhood-watch', label: 'Calgary guide' }} />
    </div>
  );
}
