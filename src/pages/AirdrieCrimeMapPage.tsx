import { ArrowRight, ExternalLink, MapPin, Phone, Radio, ShieldCheck } from 'lucide-react';
import {
  AIRDRIE_GUIDE_FAQS,
  AIRDRIE_GUIDE_SOURCES,
  AIRDRIE_GUIDE_UPDATED,
  AIRDRIE_MAP_COMPARISON,
} from '@/src/content/airdrieCrimeMapGuide';

export default function AirdrieCrimeMapPage() {
  return (
    <div className="min-h-dvh bg-[#F7F3EA] text-[#1C2B3A]">
      <header className="border-b border-[#D8D2C7] bg-[#FFFDF8]">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8" aria-label="Primary navigation">
          <a href="/" className="font-display text-lg font-black tracking-[-0.02em]">Calgary Watch</a>
          <div className="flex items-center gap-4 text-sm font-bold">
            <a href="/coverage" className="hidden text-[#536273] hover:text-[#1C2B3A] sm:inline">Area coverage</a>
            <a href="/map" className="inline-flex items-center gap-2 rounded-full bg-[#1C2B3A] px-4 py-2.5 text-white hover:bg-[#2E8B7A]">
              <MapPin size={15} aria-hidden="true" />
              View map
            </a>
          </div>
        </nav>
      </header>

      <main>
        <section className="overflow-hidden border-b border-[#D8D2C7]">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 md:py-24 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
            <div>
              <p className="mb-5 flex items-center gap-2 text-sm font-bold text-[#2E8B7A]">
                <Radio size={16} aria-hidden="true" />
                Airdrie community safety guide
              </p>
              <h1 className="max-w-4xl text-balance font-display text-[clamp(2.8rem,7vw,5.6rem)] font-black leading-[0.96] tracking-[-0.035em]">
                Airdrie crime maps: know which map you’re reading.
              </h1>
              <p className="mt-7 max-w-3xl text-pretty text-lg leading-8 text-[#536273] md:text-xl">
                Check recent community reports around Airdrie, compare them with the City’s official RCMP-reported crime map, and use the right reporting channel when something needs action.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="/map" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#1C2B3A] px-6 font-bold text-white hover:bg-[#2E8B7A]">
                  View Airdrie-area reports <ArrowRight size={17} aria-hidden="true" />
                </a>
                <a href={AIRDRIE_GUIDE_SOURCES[0].url} rel="external" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#1C2B3A] px-6 font-bold hover:bg-[#FFFDF8]">
                  Official Airdrie crime map <ExternalLink size={15} aria-hidden="true" />
                </a>
              </div>
            </div>
            <aside className="border-t-2 border-[#1C2B3A] pt-5 text-sm leading-6 text-[#536273] lg:mb-2" aria-label="Guide status">
              <p className="font-bold text-[#1C2B3A]">Independent, not a police service</p>
              <p className="mt-2">Calgary Watch shows community observations and selected public-source incidents. It is not operated by the City of Airdrie or RCMP.</p>
              <p className="mt-4 text-xs">Reviewed {AIRDRIE_GUIDE_UPDATED}. Official sources are linked below.</p>
            </aside>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 md:py-24" aria-labelledby="two-maps-heading">
          <div className="grid gap-10 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <h2 id="two-maps-heading" className="text-balance font-display text-3xl font-black tracking-[-0.025em] md:text-4xl">
              Two maps answer different questions.
            </h2>
            <div className="max-w-3xl space-y-5 text-pretty text-base leading-7 text-[#536273] md:text-lg md:leading-8">
              <p>
                Calgary Watch helps with recent local awareness. Its markers can come from community submissions or attributed public sources, so each one should be read with its time and source.
              </p>
              <p>
                The City of Airdrie’s crime map is the official starting point for crime reported to Airdrie RCMP. Neither map is a public dispatch feed, and neither should be used to follow officers or confirm that a specific response is underway.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-[#1C2B3A] text-white" aria-labelledby="choose-source-heading">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 md:py-24">
            <div className="max-w-3xl">
              <h2 id="choose-source-heading" className="text-balance font-display text-4xl font-black tracking-[-0.03em] md:text-5xl">Start with the source that matches the need.</h2>
              <p className="mt-5 text-pretty text-lg leading-8 text-slate-300">Community awareness, police-reported crime, emergencies, and non-urgent police matters are separate jobs.</p>
            </div>
            <div className="mt-12 overflow-x-auto">
              <table className="w-full min-w-[46rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/30 text-sm text-slate-300">
                    <th className="py-4 pr-6 font-semibold">What you need</th>
                    <th className="py-4 pr-6 font-semibold">Best starting point</th>
                    <th className="py-4 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {AIRDRIE_MAP_COMPARISON.map((row) => (
                    <tr key={row.need} className="border-b border-white/15 align-top">
                      <td className="max-w-md py-6 pr-6 font-bold">{row.need}</td>
                      <td className="py-6 pr-6 text-slate-300">{row.source}</td>
                      <td className="py-6">
                        <a href={row.action} className="inline-flex items-center gap-1.5 font-bold text-[#7DB8F1] hover:text-white">
                          {row.actionLabel}
                          {row.action.startsWith('http') ? <ExternalLink size={14} aria-hidden="true" /> : <ArrowRight size={14} aria-hidden="true" />}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 md:py-24" aria-labelledby="read-map-heading">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="max-w-3xl">
              <h2 id="read-map-heading" className="text-balance font-display text-4xl font-black tracking-[-0.03em] md:text-5xl">Read an incident before drawing a conclusion.</h2>
              <div className="mt-7 space-y-5 text-pretty text-lg leading-8 text-[#536273]">
                <p>Start with the timestamp: a recent marker and an older marker do not describe the same conditions. Then check whether the item was submitted by a community member or attributed to a public source.</p>
                <p>Marker counts are not crime rates. They depend on the selected time window, available sources, and what people choose to report. Use the official Airdrie map when comparing police-reported crime patterns.</p>
              </div>
            </div>
            <div className="border-t-2 border-[#2E8B7A] pt-6">
              <ShieldCheck size={28} className="text-[#2E8B7A]" aria-hidden="true" />
              <h3 className="mt-5 text-xl font-black">Three checks</h3>
              <ol className="mt-4 space-y-3 text-sm leading-6 text-[#536273]">
                <li><strong className="text-[#1C2B3A]">1.</strong> When was it reported?</li>
                <li><strong className="text-[#1C2B3A]">2.</strong> Who or what is the source?</li>
                <li><strong className="text-[#1C2B3A]">3.</strong> Does it need an official report?</li>
              </ol>
            </div>
          </div>
        </section>

        <section className="border-y border-[#D8D2C7] bg-[#FFFDF8]" aria-labelledby="report-heading">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:px-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 id="report-heading" className="font-display text-3xl font-black tracking-[-0.025em]">Report through the right channel first.</h2>
              <p className="mt-3 max-w-2xl text-pretty leading-7 text-[#536273]">Call 911 for immediate danger or a crime in progress. For an Airdrie police matter that is not in progress, call RCMP non-emergency at 403-945-7267. Calgary Watch posts are not police reports.</p>
            </div>
            <a href="tel:4039457267" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#B83A2D] px-6 font-bold text-white hover:bg-[#922F25]">
              <Phone size={16} aria-hidden="true" /> Airdrie RCMP non-emergency
            </a>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 md:py-24" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="max-w-3xl text-balance font-display text-4xl font-black tracking-[-0.03em] md:text-5xl">Airdrie crime-map questions, answered plainly.</h2>
          <div className="mt-10 divide-y divide-[#D8D2C7] border-y border-[#D8D2C7]">
            {AIRDRIE_GUIDE_FAQS.map((faq) => (
              <details key={faq.question} className="group py-5">
                <summary className="cursor-pointer list-none pr-8 text-lg font-black marker:hidden">{faq.question}</summary>
                <p className="mt-4 max-w-3xl text-pretty leading-7 text-[#536273]">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8" aria-labelledby="sources-heading">
          <h2 id="sources-heading" className="text-xl font-black">Official Airdrie references</h2>
          <ul className="mt-5 space-y-3 text-sm">
            {AIRDRIE_GUIDE_SOURCES.map((source) => (
              <li key={source.url}>
                <a href={source.url} rel="external" className="inline-flex items-center gap-2 font-bold text-[#286FAF] underline decoration-[#4A90D9]/40 underline-offset-4 hover:text-[#1C2B3A]">
                  {source.name} <ExternalLink size={13} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-[#D8D2C7] bg-[#FFFDF8]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-[#536273] sm:px-8 md:flex-row md:items-center md:justify-between">
          <p><strong className="text-[#1C2B3A]">Calgary Watch</strong> · Community awareness, not emergency dispatch.</p>
          <nav className="flex flex-wrap gap-5 font-bold" aria-label="Footer navigation">
            <a href="/">Home</a><a href="/map">Live map</a><a href="/calgary-neighbourhood-watch">Calgary guide</a><a href="/coverage">Coverage</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
