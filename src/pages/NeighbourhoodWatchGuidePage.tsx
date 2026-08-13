import { ArrowRight, ExternalLink, MapPin, Phone, Radio, ShieldCheck } from 'lucide-react';
import {
  GUIDE_COMPARISON,
  GUIDE_FAQS,
  GUIDE_SOURCES,
  GUIDE_UPDATED,
} from '@/src/content/neighbourhoodWatchGuide';

export default function NeighbourhoodWatchGuidePage() {
  return (
    <div className="min-h-dvh bg-[#F7F3EA] text-[#1C2B3A]">
      <header className="border-b border-[#D8D2C7] bg-[#FFFDF8]">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8" aria-label="Primary navigation">
          <a href="/" className="font-display text-lg font-black tracking-[-0.02em]">Calgary Watch</a>
          <div className="flex items-center gap-4 text-sm font-bold">
            <a href="/coverage" className="hidden text-[#536273] hover:text-[#1C2B3A] sm:inline">Area coverage</a>
            <a href="/map" className="inline-flex items-center gap-2 rounded-full bg-[#1C2B3A] px-4 py-2.5 text-white hover:bg-[#2E8B7A]">
              <MapPin size={15} aria-hidden="true" />
              Live map
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
                Independent community safety guide
              </p>
              <h1 className="max-w-4xl text-balance font-display text-[clamp(2.8rem,7vw,5.6rem)] font-black leading-[0.96] tracking-[-0.035em]">
                Calgary neighbourhood watch, without the guesswork.
              </h1>
              <p className="mt-7 max-w-3xl text-pretty text-lg leading-8 text-[#536273] md:text-xl">
                See what has recently been reported near you, understand where the information came from, and choose the right official channel when something needs action.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="/map" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#1C2B3A] px-6 font-bold text-white hover:bg-[#2E8B7A]">
                  Check incidents near me <ArrowRight size={17} aria-hidden="true" />
                </a>
                <a href="/map?report=true" className="inline-flex min-h-12 items-center rounded-full border border-[#1C2B3A] px-6 font-bold hover:bg-[#FFFDF8]">
                  Sign in to report
                </a>
              </div>
            </div>
            <aside className="border-t-2 border-[#1C2B3A] pt-5 text-sm leading-6 text-[#536273] lg:mb-2" aria-label="Guide status">
              <p className="font-bold text-[#1C2B3A]">What this guide covers</p>
              <p className="mt-2">Neighbourhood watch, Calgary crime maps, current activity near you, Block Watch, and official reporting options.</p>
              <p className="mt-4 text-xs">Reviewed {GUIDE_UPDATED}. Sources are linked below.</p>
            </aside>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 md:py-24" aria-labelledby="near-me-heading">
          <div className="grid gap-10 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <h2 id="near-me-heading" className="text-balance font-display text-3xl font-black tracking-[-0.025em] md:text-4xl">
              “Current police activity near me” is not one kind of data.
            </h2>
            <div className="max-w-3xl space-y-5 text-pretty text-base leading-7 text-[#536273] md:text-lg md:leading-8">
              <p>
                People use that search to mean different things: a siren nearby, a road closed after a collision, a community report, or official crime statistics. No single public map contains every live police call or officer location.
              </p>
              <p>
                Calgary Watch shows recent community observations and selected public-source incidents. Every marker should be read with its timestamp and source. It is useful for awareness, but it is not a dispatch feed and it cannot confirm that police attended an event.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-[#1C2B3A] text-white" aria-labelledby="source-heading">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 md:py-24">
            <div className="max-w-3xl">
              <h2 id="source-heading" className="text-balance font-display text-4xl font-black tracking-[-0.03em] md:text-5xl">Choose the source that matches the question.</h2>
              <p className="mt-5 text-pretty text-lg leading-8 text-slate-300">A live community map, official statistics, and emergency reporting serve different purposes.</p>
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
                  {GUIDE_COMPARISON.map((row) => (
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

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 md:py-24" aria-labelledby="block-watch-heading">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="max-w-3xl">
              <h2 id="block-watch-heading" className="text-balance font-display text-4xl font-black tracking-[-0.03em] md:text-5xl">Block Watch Calgary and Calgary Watch are different.</h2>
              <div className="mt-7 space-y-5 text-pretty text-lg leading-8 text-[#536273]">
                <p>
                  Block Watch generally means neighbours organizing on their own block to reduce opportunities for crime, share prevention information, and report suspicious activity through the appropriate channels.
                </p>
                <p>
                  Calgary Watch is an independent public map. It helps people see recent reports across many communities and share an observation after signing in. It is not a Block Watch chapter and is not operated by Calgary Police Service.
                </p>
              </div>
            </div>
            <div className="border-t-2 border-[#2E8B7A] pt-6">
              <ShieldCheck size={28} className="text-[#2E8B7A]" aria-hidden="true" />
              <h3 className="mt-5 text-xl font-black">A useful neighbourhood routine</h3>
              <ol className="mt-4 space-y-3 text-sm leading-6 text-[#536273]">
                <li><strong className="text-[#1C2B3A]">1.</strong> Check the time and source.</li>
                <li><strong className="text-[#1C2B3A]">2.</strong> Use 911 or police non-emergency when required.</li>
                <li><strong className="text-[#1C2B3A]">3.</strong> Share only what you observed; avoid identifying private people.</li>
              </ol>
            </div>
          </div>
        </section>

        <section className="border-y border-[#D8D2C7] bg-[#FFFDF8]" aria-labelledby="report-heading">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:px-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 id="report-heading" className="font-display text-3xl font-black tracking-[-0.025em]">Report through the right channel first.</h2>
              <p className="mt-3 max-w-2xl text-pretty leading-7 text-[#536273]">Call 911 for an emergency or crime in progress. For Calgary police matters not in progress, call 403-266-1234. Posting to Calgary Watch does not create a police report.</p>
            </div>
            <a href="tel:4032661234" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#B83A2D] px-6 font-bold text-white hover:bg-[#922F25]">
              <Phone size={16} aria-hidden="true" /> Police non-emergency
            </a>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 md:py-24" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="max-w-3xl text-balance font-display text-4xl font-black tracking-[-0.03em] md:text-5xl">Questions people ask before opening the map.</h2>
          <div className="mt-10 divide-y divide-[#D8D2C7] border-y border-[#D8D2C7]">
            {GUIDE_FAQS.map((faq) => (
              <details key={faq.question} className="group py-5">
                <summary className="cursor-pointer list-none pr-8 text-lg font-black marker:hidden">{faq.question}</summary>
                <p className="mt-4 max-w-3xl text-pretty leading-7 text-[#536273]">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8" aria-labelledby="sources-heading">
          <h2 id="sources-heading" className="text-xl font-black">Official references</h2>
          <ul className="mt-5 space-y-3 text-sm">
            {GUIDE_SOURCES.map((source) => (
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
            <a href="/">Home</a><a href="/map">Live map</a><a href="/about">About</a><a href="/coverage">Coverage</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
