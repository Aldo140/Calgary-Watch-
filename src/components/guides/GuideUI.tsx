import type { ReactNode } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  CircleDot,
  MapPin,
  Phone,
  ShieldCheck,
} from 'lucide-react';

export interface GuideAction {
  href: string;
  label: string;
  external?: boolean;
}

export interface GuideDecision {
  need: string;
  source: string;
  action: string;
  actionLabel: string;
}

export interface GuideFaq {
  question: string;
  answer: string;
}

export interface GuideSource {
  name: string;
  url: string;
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4A90D9] focus-visible:ring-offset-2';

export function GuideNav({ locationLabel }: { locationLabel: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 supports-[backdrop-filter]:bg-white/90 supports-[backdrop-filter]:backdrop-blur-md">
      <nav className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8" aria-label="Primary navigation">
        <a href="/" className={`flex min-h-11 items-center gap-3 rounded-lg ${focusRing}`}>
          <img src="/icon.svg" alt="" width={32} height={32} className="size-8" />
          <span>
            <span className="block font-display text-base font-black leading-none tracking-[-0.02em] text-[#0B1F33]">Calgary Watch</span>
            <span className="mt-1 block text-[0.68rem] font-bold leading-none text-slate-500">{locationLabel}</span>
          </span>
        </a>
        <div className="flex items-center gap-2 sm:gap-4">
          <a href="/coverage" className={`hidden min-h-11 items-center rounded-lg px-2 text-sm font-bold text-slate-600 transition-colors hover:text-[#0B1F33] sm:inline-flex ${focusRing}`}>
            Coverage
          </a>
          <a href="/map" className={`inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0B1F33] px-4 text-sm font-black text-[#F7FBFF] transition-colors hover:bg-[#174A6E] active:bg-[#092036] ${focusRing}`}>
            <MapPin size={16} aria-hidden="true" />
            Open map
          </a>
        </div>
      </nav>
    </header>
  );
}

export function GuideHero({
  label,
  updated,
  title,
  description,
  primaryAction,
  secondaryAction,
  statusTitle,
  statusBody,
  quickActions,
}: {
  label: string;
  updated: string;
  title: ReactNode;
  description: string;
  primaryAction: GuideAction;
  secondaryAction: GuideAction;
  statusTitle: string;
  statusBody: string;
  quickActions: { label: string; value: string; href: string; tone?: 'emergency' | 'default' }[];
}) {
  return (
    <section className="relative overflow-hidden bg-[#0B1F33] text-[#F7FBFF]">
      <div className="absolute inset-x-0 top-0 h-1 bg-[#4A90D9]" aria-hidden="true" />
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end lg:py-24">
        <div className="max-w-4xl">
          <div className="mb-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-2 font-black text-[#8BC6FF]">
              <CircleDot size={15} aria-hidden="true" /> {label}
            </span>
            <span className="text-white/35" aria-hidden="true">/</span>
            <span className="font-semibold text-white/70">Reviewed {updated}</span>
          </div>
          <h1 className="max-w-4xl text-balance font-display text-[clamp(2.75rem,7vw,5.8rem)] font-black leading-[0.94] tracking-[-0.035em]">
            {title}
          </h1>
          <p className="mt-7 max-w-3xl text-pretty text-lg leading-8 text-[#C8D8E8] sm:text-xl sm:leading-9">
            {description}
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a href={primaryAction.href} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#4A90D9] px-6 font-black text-[#071727] transition-colors hover:bg-[#8BC6FF] active:bg-white ${focusRing}`}>
              {primaryAction.label} <ArrowRight size={17} aria-hidden="true" />
            </a>
            <a
              href={secondaryAction.href}
              rel={secondaryAction.external ? 'external' : undefined}
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/35 px-6 font-black text-[#F7FBFF] transition-colors hover:border-white hover:bg-[rgba(255,255,255,0.1)] active:bg-[rgba(255,255,255,0.15)] ${focusRing}`}
            >
              {secondaryAction.label}
              {secondaryAction.external ? <ArrowUpRight size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
            </a>
          </div>
        </div>

        <aside className="overflow-hidden rounded-2xl bg-white text-[#0B1F33]" aria-label="Quick reporting guide">
          <div className="border-b border-slate-200 px-5 py-5">
            <p className="text-sm font-black">{statusTitle}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{statusBody}</p>
          </div>
          <div className="divide-y divide-slate-200">
            {quickActions.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={`flex min-h-16 items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-slate-50 ${focusRing}`}
              >
                <span>
                  <span className="block text-xs font-bold text-slate-500">{item.label}</span>
                  <span className={`mt-0.5 block font-black ${item.tone === 'emergency' ? 'text-[#B42318]' : 'text-[#0B1F33]'}`}>{item.value}</span>
                </span>
                <ArrowRight size={17} className="shrink-0 text-[#4A90D9]" aria-hidden="true" />
              </a>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

export function GuideAnchorNav({ items }: { items: { href: string; label: string }[] }) {
  return (
    <nav className="border-b border-slate-200 bg-white" aria-label="On this page">
      <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-5 py-3 sm:px-8">
        <span className="mr-3 shrink-0 text-xs font-black text-slate-500">On this page</span>
        {items.map((item) => (
          <a key={item.href} href={item.href} className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-bold text-slate-700 transition-colors hover:bg-[#E8F3FC] hover:text-[#174A6E] ${focusRing}`}>
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

export function GuideDecisionList({
  title,
  intro,
  rows,
}: {
  title: string;
  intro: string;
  rows: readonly GuideDecision[];
}) {
  return (
    <section id="choose-a-source" className="scroll-mt-28 bg-[#E8F3FC]" aria-labelledby="source-heading">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 md:py-24">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(30rem,1.3fr)] lg:gap-16">
          <div>
            <h2 id="source-heading" className="max-w-xl text-balance font-display text-4xl font-black leading-tight tracking-[-0.03em] text-[#0B1F33] md:text-5xl">{title}</h2>
            <p className="mt-5 max-w-xl text-pretty text-lg leading-8 text-[#40566B]">{intro}</p>
          </div>
          <ul className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#B9D5EA]">
            {rows.map((row) => (
              <li key={row.need} className="grid gap-4 border-b border-slate-200 p-5 last:border-b-0 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center sm:p-6">
                <span className="flex size-8 items-center justify-center rounded-full bg-[#0B1F33] text-[#8BC6FF]" aria-hidden="true"><CircleDot size={14} /></span>
                <div>
                  <p className="font-black leading-6 text-[#0B1F33]">{row.need}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{row.source}</p>
                </div>
                <a
                  href={row.action}
                  rel={row.action.startsWith('http') ? 'external' : undefined}
                  className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#E8F3FC] px-4 text-sm font-black text-[#174A6E] transition-colors hover:bg-[#D4EAF9] sm:justify-start ${focusRing}`}
                >
                  {row.actionLabel}
                  {row.action.startsWith('http') ? <ArrowUpRight size={15} aria-hidden="true" /> : <ArrowRight size={15} aria-hidden="true" />}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function GuideReportingBand({
  title,
  body,
  phoneHref,
  phoneLabel,
}: {
  title: string;
  body: string;
  phoneHref: string;
  phoneLabel: string;
}) {
  return (
    <section id="reporting" className="scroll-mt-28 bg-[#FFF4F1]" aria-labelledby="report-heading">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:py-14">
        <div className="flex size-12 items-center justify-center rounded-xl bg-[#B42318] text-[#F7FBFF]">
          <Phone size={22} aria-hidden="true" />
        </div>
        <div>
          <h2 id="report-heading" className="text-balance font-display text-3xl font-black tracking-[-0.025em] text-[#4A1712]">{title}</h2>
          <p className="mt-3 max-w-3xl text-pretty leading-7 text-[#71352F]">{body}</p>
        </div>
        <a href={phoneHref} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#B42318] px-5 font-black text-[#F7FBFF] transition-colors hover:bg-[#8F1D14] active:bg-[#76170F] ${focusRing}`}>
          <Phone size={16} aria-hidden="true" /> {phoneLabel}
        </a>
      </div>
    </section>
  );
}

export function GuideFaqs({ title, faqs }: { title: string; faqs: readonly GuideFaq[] }) {
  return (
    <section id="questions" className="scroll-mt-28 bg-white" aria-labelledby="faq-heading">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 md:py-24 lg:grid-cols-[minmax(0,0.7fr)_minmax(30rem,1.3fr)] lg:gap-16">
        <div>
          <div className="flex size-11 items-center justify-center rounded-xl bg-[#DDF4EE] text-[#176A5D]">
            <ShieldCheck size={22} aria-hidden="true" />
          </div>
          <h2 id="faq-heading" className="mt-6 max-w-xl text-balance font-display text-4xl font-black leading-tight tracking-[-0.03em] text-[#0B1F33] md:text-5xl">{title}</h2>
          <p className="mt-5 max-w-md text-pretty leading-7 text-slate-600">Straight answers about what the map can show, what it cannot confirm, and when to use an official service.</p>
        </div>
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {faqs.map((faq) => (
            <details key={faq.question} className="group">
              <summary className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-5 text-left text-lg font-black leading-7 text-[#0B1F33] marker:hidden ${focusRing}`}>
                {faq.question}
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[#174A6E] transition-transform duration-200 ease-out group-open:rotate-180" aria-hidden="true">
                  <ChevronDown size={17} />
                </span>
              </summary>
              <p className="max-w-3xl pb-6 pr-10 text-pretty leading-7 text-slate-600">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function GuideSources({ title, sources }: { title: string; sources: readonly GuideSource[] }) {
  return (
    <section className="border-t border-slate-200 bg-[#F5F8FA]" aria-labelledby="sources-heading">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 md:py-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="sources-heading" className="font-display text-2xl font-black tracking-[-0.02em] text-[#0B1F33]">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Use these links when official confirmation or reporting is required.</p>
          </div>
          <span className="text-xs font-bold text-slate-500">Links open the original source</span>
        </div>
        <ul className="mt-7 grid gap-3 md:grid-cols-2">
          {sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} rel="external" className={`group flex min-h-14 items-center justify-between gap-4 rounded-xl bg-white px-4 py-3 font-bold text-[#174A6E] ring-1 ring-slate-200 transition-colors hover:bg-[#E8F3FC] hover:ring-[#8DBBDB] ${focusRing}`}>
                <span>{source.name}</span>
                <ArrowUpRight size={16} className="shrink-0 transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function GuideFinalCta({ title, body }: { title: string; body: string }) {
  return (
    <section className="bg-[#4A90D9] text-[#071727]">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-center md:justify-between md:py-14">
        <div>
          <h2 className="text-balance font-display text-3xl font-black tracking-[-0.025em] md:text-4xl">{title}</h2>
          <p className="mt-3 max-w-2xl text-pretty leading-7 text-[#0B1F33]">{body}</p>
        </div>
        <a href="/map" className={`inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#0B1F33] px-6 font-black text-[#F7FBFF] transition-colors hover:bg-[#153C5B] ${focusRing}`}>
          Explore the map <ArrowRight size={17} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

export function GuideFooter({ extraLink }: { extraLink: GuideAction }) {
  return (
    <footer className="bg-[#071727] text-[#F7FBFF]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 text-sm sm:px-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" width={28} height={28} className="size-7" />
          <p><strong>Calgary Watch</strong><span className="text-white/55"> · Community awareness, not emergency dispatch.</span></p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-3 font-bold text-white/75" aria-label="Footer navigation">
          <a className={`inline-flex min-h-11 items-center rounded hover:text-[#F7FBFF] ${focusRing}`} href="/">Home</a>
          <a className={`inline-flex min-h-11 items-center rounded hover:text-[#F7FBFF] ${focusRing}`} href="/map">Live map</a>
          <a className={`inline-flex min-h-11 items-center rounded hover:text-[#F7FBFF] ${focusRing}`} href={extraLink.href}>{extraLink.label}</a>
          <a className={`inline-flex min-h-11 items-center rounded hover:text-[#F7FBFF] ${focusRing}`} href="/coverage">Coverage</a>
        </nav>
      </div>
    </footer>
  );
}
