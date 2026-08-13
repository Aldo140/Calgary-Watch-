/**
 * Admin console shell.
 *
 * Desktop gets a fixed dark rail: navigation is a persistent place you glance
 * at, not something you open. Mobile gets a bottom tab bar instead — an admin
 * moderating from a phone is holding it one-handed, and the top of a 6" screen
 * is the worst place to put the controls they use most.
 *
 * The rail carries live counts. If something needs attention, the number is on
 * screen before you decide where to click.
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { T, display, mono, toneColor, type Tone } from './ui';

export type NavItem = {
  id: string;
  label: string;
  short?: string;
  icon: React.ElementType;
  /** Rendered beside the label. Omit when zero — a badge reading 0 is noise. */
  count?: number;
  /** Colours the badge. Use attention/critical only when a human is needed. */
  tone?: Tone;
  /** Navigates instead of switching the in-page section. */
  href?: string;
};

export function AdminShell({
  items,
  activeId,
  onSelect,
  title,
  subtitle,
  actions,
  children,
  onSignOut,
}: {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  onSignOut?: () => void;
}) {
  const navigate = useNavigate();
  // Every section stays reachable on a phone. A hidden tab is a function an
  // admin cannot perform on the device they actually carry, so the bar adapts
  // its columns instead of truncating the list.
  const mobileItems = items.slice(0, 6);

  const go = (item: NavItem) => (item.href ? navigate(item.href) : onSelect(item.id));

  return (
    <div className="min-h-screen" style={{ background: T.surface }}>
      {/* ── Desktop rail ── */}
      <aside
        className="hidden lg:flex fixed inset-y-0 left-0 w-[15.5rem] flex-col z-30"
        style={{ background: T.rail }}
      >
        <div className="px-4 pt-5 pb-4">
          <Link
            to="/map"
            className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold mb-4 transition-colors hover:text-white"
            style={{ color: T.railText }}
          >
            <ArrowLeft size={13} /> Back to map
          </Link>
          <p
            className="text-[0.6rem] font-semibold uppercase tracking-[0.18em]"
            style={{ color: T.railText }}
          >
            Calgary Watch
          </p>
          <h1 className="text-[1.1rem] font-bold text-white" style={{ fontFamily: display }}>
            Watch desk
          </h1>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 pb-4 space-y-0.5">
          {items.map((item) => {
            const active = item.id === activeId;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => go(item)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'w-full flex items-center gap-2.5 h-10 px-3 rounded-lg text-[0.82rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
                )}
                style={{
                  background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
                  color: active ? '#fff' : T.railText,
                  outlineColor: T.signal,
                }}
              >
                <Icon size={16} className="shrink-0" />
                <span className="flex-1 text-left truncate">{item.label}</span>
                {!!item.count && (
                  <span
                    className="tabular-nums text-[0.68rem] font-bold px-1.5 py-0.5 rounded"
                    style={{
                      fontFamily: mono,
                      color: item.tone ? toneColor[item.tone] : '#fff',
                      background: item.tone ? `${toneColor[item.tone]}26` : 'rgba(255,255,255,0.12)',
                    }}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {onSignOut && (
          <div className="px-2.5 pb-4 border-t pt-3" style={{ borderColor: T.railLine }}>
            <button
              onClick={onSignOut}
              className="w-full flex items-center gap-2.5 h-9 px-3 rounded-lg text-[0.8rem] font-semibold transition-colors hover:text-white"
              style={{ color: T.railText }}
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        )}
      </aside>

      {/* ── Workspace ── */}
      <div className="lg:pl-[15.5rem]">
        <header
          className="sticky top-0 z-20 border-b backdrop-blur"
          style={{ background: 'rgba(247,246,243,0.92)', borderColor: T.line }}
        >
          <div className="px-4 lg:px-7 py-3 flex items-center gap-3">
            <Link
              to="/map"
              className="lg:hidden shrink-0 h-9 w-9 grid place-items-center rounded-lg border"
              style={{ borderColor: T.line, color: T.muted, background: T.card }}
              aria-label="Back to map"
            >
              <ArrowLeft size={16} />
            </Link>
            <div className="min-w-0 flex-1">
              <h1
                className="text-[1.05rem] lg:text-[1.3rem] font-bold leading-tight truncate"
                style={{ fontFamily: display, color: T.ink }}
              >
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs truncate" style={{ color: T.muted }}>
                  {subtitle}
                </p>
              )}
            </div>
            {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
          </div>
        </header>

        <main className="px-4 lg:px-7 py-4 lg:py-6 pb-24 lg:pb-10 space-y-4 max-w-[1400px]">
          {children}
        </main>
      </div>

      {/* ── Mobile tab bar ── */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t"
        style={{
          background: T.rail,
          borderColor: T.railLine,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }}
        >
          {mobileItems.map((item) => {
            const active = item.id === activeId;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => go(item)}
                aria-current={active ? 'page' : undefined}
                className="relative flex flex-col items-center justify-center gap-1 h-16 focus-visible:outline-2 focus-visible:-outline-offset-2"
                style={{ color: active ? '#fff' : T.railText, outlineColor: T.signal }}
              >
                <span className="relative">
                  <Icon size={19} />
                  {!!item.count && (
                    <span
                      className="absolute -top-1.5 -right-2.5 min-w-[1.05rem] h-[1.05rem] px-1 grid place-items-center rounded-full text-[0.6rem] font-bold tabular-nums"
                      style={{
                        fontFamily: mono,
                        background: toneColor[item.tone ?? 'signal'],
                        color: '#fff',
                      }}
                    >
                      {item.count > 99 ? '99+' : item.count}
                    </span>
                  )}
                </span>
                <span className="text-[0.62rem] font-semibold leading-none">
                  {item.short ?? item.label}
                </span>
                {active && (
                  <span
                    className="absolute top-0 inset-x-4 h-0.5 rounded-full"
                    style={{ background: T.signal }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
