/**
 * Admin console primitives.
 *
 * The public site is a warm, welcoming map. This is the opposite job: a watch
 * desk for one or two volunteers who need to see what needs action and act on
 * it, often one-handed on a phone. So the console runs a dark navigation rail
 * against a light working surface — the way real operations tooling separates
 * "where am I" from "what am I looking at" — and every figure is set in mono so
 * numbers read as instrument readings and columns align without effort.
 *
 * Palette is "chinook arch": the dark foothills and the bright band of sky
 * Calgary gets in a chinook. Colour is never decorative here — amber and red
 * mean something needs a human, and nothing else is allowed to use them.
 */

import React from 'react';
import { cn } from '@/src/lib/utils';

// ── Tokens ────────────────────────────────────────────────────────────────────

export const T = {
  rail: '#12161C',
  railSoft: '#1B212B',
  railLine: 'rgba(255,255,255,0.09)',
  railText: '#9AA4B2',
  surface: '#F7F6F3',
  card: '#FFFFFF',
  line: '#E4E2DC',
  ink: '#161A20',
  muted: '#6B7280',
  signal: '#2C6FB5',
  attention: '#C77F18',
  critical: '#C0392B',
  ok: '#2F855A',
} as const;

export const display = "'Bricolage Grotesque', system-ui, sans-serif";
export const mono = "'IBM Plex Mono', ui-monospace, monospace";

export type Tone = 'neutral' | 'signal' | 'attention' | 'critical' | 'ok';

/**
 * One colour per incident category, for every chart, chip and legend.
 *
 * A category must read as the same colour everywhere or the legend actively
 * misleads. These hues are also spaced further apart than the map's palette,
 * whose emergency and crime reds are near-identical — fine on a map where an
 * icon carries the meaning, useless in a pie or a chip.
 */
export const CATEGORY_COLOR: Record<string, string> = {
  emergency: '#C0392B',
  crime: '#2C6FB5',
  traffic: '#C77F18',
  infrastructure: '#2F855A',
  weather: '#7C5CBF',
  gas: '#0F8B8D',
};

/** Chip coloured by the shared category palette. */
export function CategoryChip({ category }: { category: string }) {
  const c = CATEGORY_COLOR[category] ?? T.muted;
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[0.68rem] font-semibold border whitespace-nowrap"
      style={{ color: c, borderColor: `${c}33`, background: `${c}0F` }}
    >
      {category}
    </span>
  );
}

export const toneColor: Record<Tone, string> = {
  neutral: T.ink,
  signal: T.signal,
  attention: T.attention,
  critical: T.critical,
  ok: T.ok,
};

// ── Numbers ───────────────────────────────────────────────────────────────────

/**
 * Every number on this screen goes through here.
 *
 * Consistent grouping and a fixed tabular font are what let an admin compare two
 * figures at a glance instead of re-reading them.
 */
export function Figure({
  value,
  unit,
  size = 'md',
  tone = 'neutral',
  className,
}: {
  value: number | string | null | undefined;
  unit?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: Tone;
  className?: string;
}) {
  const sizes = { sm: 'text-sm', md: 'text-lg', lg: 'text-[1.75rem]', xl: 'text-[2.5rem]' };
  const shown =
    value === null || value === undefined
      ? '—'
      : typeof value === 'number'
        ? value.toLocaleString('en-CA')
        : value;
  return (
    <span
      className={cn('font-semibold tabular-nums leading-none tracking-tight', sizes[size], className)}
      style={{ fontFamily: mono, color: toneColor[tone] }}
    >
      {shown}
      {unit && (
        <span className="ml-0.5 text-[0.6em] font-medium" style={{ color: T.muted }}>
          {unit}
        </span>
      )}
    </span>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
  padded = true,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={cn('rounded-2xl border overflow-hidden', className)}
      style={{ background: T.card, borderColor: T.line }}
    >
      {(title || action) && (
        <header
          className="flex items-start justify-between gap-3 px-4 py-3 border-b"
          style={{ borderColor: T.line }}
        >
          <div className="min-w-0">
            {title && (
              <h2
                className="text-[0.95rem] font-bold leading-tight truncate"
                style={{ fontFamily: display, color: T.ink }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs mt-0.5 leading-snug" style={{ color: T.muted }}>
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={padded ? 'p-4' : undefined}>{children}</div>
    </section>
  );
}

/**
 * A single measured value.
 *
 * `hint` explains what the number means rather than restating it — an admin who
 * has to guess whether "412" is all-time or this week cannot act on it.
 */
export function StatTile({
  label,
  value,
  unit,
  hint,
  tone = 'neutral',
  onClick,
}: {
  label: string;
  value: number | string | null | undefined;
  unit?: string;
  hint?: string;
  tone?: Tone;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'text-left rounded-xl border p-3 flex flex-col gap-1.5 min-w-0 w-full',
        onClick && 'transition-colors hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2',
      )}
      style={{ background: T.card, borderColor: T.line, outlineColor: T.signal }}
    >
      <span
        className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] truncate"
        style={{ color: T.muted }}
      >
        {label}
      </span>
      <Figure value={value} unit={unit} size="lg" tone={tone} />
      {hint && (
        <span className="text-[0.7rem] leading-tight" style={{ color: T.muted }}>
          {hint}
        </span>
      )}
    </Tag>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2.5 grid-cols-2 lg:grid-cols-4">{children}</div>;
}

// ── Status ────────────────────────────────────────────────────────────────────

export function StatusDot({ tone, pulse = false }: { tone: Tone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {pulse && (
        <span
          className="absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping"
          style={{ background: toneColor[tone] }}
        />
      )}
      <span
        className="relative inline-flex h-2 w-2 rounded-full"
        style={{ background: toneColor[tone] }}
      />
    </span>
  );
}

export function Chip({
  children,
  tone = 'neutral',
  mono: useMono = false,
}: {
  children: React.ReactNode;
  tone?: Tone;
  mono?: boolean;
}) {
  const c = toneColor[tone];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.68rem] font-semibold border whitespace-nowrap"
      style={{
        color: c,
        borderColor: `${c}33`,
        background: `${c}0F`,
        fontFamily: useMono ? mono : undefined,
      }}
    >
      {children}
    </span>
  );
}

// ── Controls ──────────────────────────────────────────────────────────────────

export function AdminButton({
  children,
  onClick,
  tone = 'neutral',
  variant = 'solid',
  size = 'md',
  disabled,
  type = 'button',
  title,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: Tone;
  variant?: 'solid' | 'outline' | 'ghost';
  size?: 'sm' | 'md';
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
  className?: string;
}) {
  const c = toneColor[tone];
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2';
  const sizes = { sm: 'h-8 px-2.5 text-xs', md: 'h-10 px-3.5 text-[0.82rem]' };
  const styles: Record<string, React.CSSProperties> = {
    solid: { background: c, color: '#fff', borderColor: c },
    outline: { background: 'transparent', color: c, border: `1px solid ${c}55` },
    ghost: { background: 'transparent', color: T.muted },
  };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(base, sizes[size], className)}
      style={{ ...styles[variant], outlineColor: c }}
    >
      {children}
    </button>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="relative flex-1 min-w-0">
      {icon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: T.muted }}>
          {icon}
        </span>
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full h-10 rounded-lg border text-sm outline-none transition-colors focus:border-slate-500',
          icon ? 'pl-9 pr-3' : 'px-3',
        )}
        style={{ background: T.card, borderColor: T.line, color: T.ink }}
      />
    </div>
  );
}

export function FilterRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        background: active ? T.ink : T.card,
        color: active ? '#fff' : T.muted,
        borderColor: active ? T.ink : T.line,
        outlineColor: T.signal,
      }}
    >
      {children}
      {count !== undefined && (
        <span className="tabular-nums opacity-70" style={{ fontFamily: mono }}>
          {count}
        </span>
      )}
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span
        className="block text-[0.65rem] font-semibold uppercase tracking-[0.08em] mb-1"
        style={{ color: T.muted }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  'w-full h-10 rounded-lg border px-3 text-sm outline-none transition-colors focus:border-slate-500';

export const inputStyle: React.CSSProperties = {
  background: T.card,
  borderColor: T.line,
  color: T.ink,
};

// ── Empty + loading ───────────────────────────────────────────────────────────

/** An empty screen is an invitation to act, not a shrug. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-10 px-4">
      {icon && <div style={{ color: T.muted }}>{icon}</div>}
      <p className="text-sm font-semibold" style={{ color: T.ink }}>
        {title}
      </p>
      {body && (
        <p className="text-xs max-w-xs leading-relaxed" style={{ color: T.muted }}>
          {body}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 rounded-lg motion-safe:animate-pulse"
          style={{ background: T.surface }}
        />
      ))}
    </div>
  );
}

/**
 * Responsive record list.
 *
 * The same records render as a table on desktop and as stacked cards on mobile.
 * Keeping one component means a column added for desktop cannot silently go
 * missing on a phone, which is how the previous screens drifted apart.
 */
export function RecordList<Row>({
  rows,
  columns,
  card,
  keyOf,
  empty,
}: {
  rows: Row[];
  columns: { header: string; width?: string; cell: (row: Row) => React.ReactNode }[];
  card: (row: Row) => React.ReactNode;
  keyOf: (row: Row) => string;
  empty: React.ReactNode;
}) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left">
              {columns.map((c) => (
                <th
                  key={c.header}
                  className="py-2 px-2 text-[0.65rem] font-semibold uppercase tracking-[0.08em] border-b"
                  style={{ color: T.muted, borderColor: T.line, width: c.width }}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={keyOf(row)} className="border-b last:border-0" style={{ borderColor: T.line }}>
                {columns.map((c) => (
                  <td key={c.header} className="py-2.5 px-2 align-top">
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile */}
      <div className="md:hidden space-y-2">
        {rows.map((row) => (
          <div key={keyOf(row)}>{card(row)}</div>
        ))}
      </div>
    </>
  );
}

/** Relative time, and the exact stamp on hover — both matter when moderating. */
export function TimeAgo({ ts }: { ts?: number }) {
  if (!ts) return <span style={{ color: T.muted }}>—</span>;
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const label =
    mins < 1 ? 'just now'
      : mins < 60 ? `${mins}m ago`
        : mins < 1440 ? `${Math.floor(mins / 60)}h ago`
          : `${Math.floor(mins / 1440)}d ago`;
  return (
    <time
      dateTime={new Date(ts).toISOString()}
      title={new Date(ts).toLocaleString('en-CA')}
      className="tabular-nums text-xs whitespace-nowrap"
      style={{ fontFamily: mono, color: T.muted }}
    >
      {label}
    </time>
  );
}
