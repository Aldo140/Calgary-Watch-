import { Eye, Radio, Users } from 'lucide-react';
import {
  GUIDE_COMPARISON,
  GUIDE_FAQS,
  GUIDE_SOURCES,
  GUIDE_UPDATED,
} from '@/src/content/neighbourhoodWatchGuide';
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

export default function NeighbourhoodWatchGuidePage() {
  return (
    <div className="min-h-dvh bg-white text-[#0B1F33]">
      <GuideNav locationLabel="Calgary neighbourhood guide" />
      <main>
        <GuideHero
          label="Independent community safety guide"
          updated={GUIDE_UPDATED}
          title={<>Calgary neighbourhood watch, <span className="text-[#8BC6FF]">without the guesswork.</span></>}
          description="See what has recently been reported near you, understand where the information came from, and choose the right official channel when something needs action."
          primaryAction={{ href: '/map', label: 'Check incidents near me' }}
          secondaryAction={{ href: '/map?report=true', label: 'Sign in to report' }}
          statusTitle="Know what you’re looking at"
          statusBody="Calgary Watch is an independent community map. It is not operated by Calgary Police Service and does not show dispatch calls or officer locations."
          quickActions={[
            { label: 'Immediate danger', value: 'Call 911', href: 'tel:911', tone: 'emergency' },
            { label: 'Police matter, not in progress', value: '403-266-1234', href: 'tel:4032661234' },
            { label: 'Neighbourhood context', value: 'Open the live map', href: '/map' },
          ]}
        />
        <GuideAnchorNav items={[
          { href: '#understand-the-map', label: 'Understand the map' },
          { href: '#choose-a-source', label: 'Choose a source' },
          { href: '#reporting', label: 'Reporting' },
          { href: '#questions', label: 'Questions' },
        ]} />

        <section id="understand-the-map" className="scroll-mt-28 bg-white" aria-labelledby="near-me-heading">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 md:py-24 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:gap-20">
            <div>
              <h2 id="near-me-heading" className="max-w-3xl text-balance font-display text-4xl font-black leading-tight tracking-[-0.03em] md:text-5xl">
                “Current police activity near me” can mean several different things.
              </h2>
              <div className="mt-7 max-w-3xl space-y-5 text-pretty text-lg leading-8 text-slate-600">
                <p>People use that phrase for a siren nearby, a collision-related road closure, a community observation, or official reported-crime statistics. No single public map contains every live police call or officer location.</p>
                <p>Calgary Watch shows recent community observations and selected public-source incidents. It supports awareness, but it cannot confirm that police attended an event.</p>
              </div>
            </div>
            <div className="self-start rounded-2xl bg-[#F5F8FA] p-6 ring-1 ring-slate-200 sm:p-8">
              <div className="flex size-11 items-center justify-center rounded-xl bg-[#DDF4EE] text-[#176A5D]">
                <Eye size={22} aria-hidden="true" />
              </div>
              <h3 className="mt-6 text-2xl font-black tracking-[-0.02em]">Read every marker in context</h3>
              <ul className="mt-6 space-y-5">
                {[
                  ['Time', 'How recently was it reported?'],
                  ['Source', 'Community observation or attributed public source?'],
                  ['Status', 'Is it unverified, corroborated, or official?'],
                ].map(([label, copy]) => (
                  <li key={label} className="grid grid-cols-[5rem_1fr] gap-3 border-t border-slate-200 pt-4 first:border-t-0 first:pt-0">
                    <strong className="text-sm text-[#174A6E]">{label}</strong>
                    <span className="text-sm leading-6 text-slate-600">{copy}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <GuideDecisionList
          title="Choose the source that matches the question."
          intro="A community map, official statistics, and emergency reporting each serve a different purpose. Start with the job you need done."
          rows={GUIDE_COMPARISON}
        />

        <section className="bg-[#0B1F33] text-[#F7FBFF]" aria-labelledby="block-watch-heading">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 md:py-24 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:items-center lg:gap-20">
            <div>
              <div className="flex size-12 items-center justify-center rounded-xl bg-[#2E8B7A] text-[#F7FBFF]">
                <Users size={23} aria-hidden="true" />
              </div>
              <h2 id="block-watch-heading" className="mt-7 max-w-3xl text-balance font-display text-4xl font-black leading-tight tracking-[-0.03em] md:text-5xl">Block Watch Calgary and Calgary Watch are different.</h2>
              <div className="mt-7 max-w-3xl space-y-5 text-pretty text-lg leading-8 text-[#C8D8E8]">
                <p>Block Watch generally means neighbours organizing on their own block to reduce opportunities for crime, share prevention information, and report suspicious activity through the appropriate channels.</p>
                <p>Calgary Watch is an independent public map for recent reports across many communities. It is not a Block Watch chapter or a Calgary Police Service program.</p>
              </div>
            </div>
            <div className="rounded-2xl bg-white p-6 text-[#0B1F33] sm:p-8">
              <div className="flex items-center gap-3 text-[#176A5D]">
                <Radio size={20} aria-hidden="true" />
                <h3 className="text-lg font-black">A useful neighbourhood routine</h3>
              </div>
              <ol className="mt-6 space-y-0">
                {[
                  'Check the time, source, and status.',
                  'Use 911 or police non-emergency when required.',
                  'Share only what you observed; protect people’s privacy.',
                ].map((step, index) => (
                  <li key={step} className="grid grid-cols-[2rem_1fr] gap-4 border-b border-slate-200 py-4 last:border-b-0">
                    <span className="font-black text-[#4A90D9]">{index + 1}</span>
                    <span className="font-semibold leading-6 text-slate-700">{step}</span>
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
