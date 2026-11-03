import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { CALGARY_COMMUNITIES, type CalgaryCommunity, type Quadrant } from '@/src/data/calgaryCommunities';
import { matchCommunities, quadrantOf } from '@/src/lib/reportNeighbourhood';

/**
 * Type-to-find picker over every Calgary community (~200), used by the report and
 * SOS forms when the pin didn't resolve to one or the reporter wants to change it.
 * A native <select> of 200 rows is a long wheel on a phone; typing "hill" is not.
 * Someone who doesn't know the official name can browse by quadrant instead.
 */
export const NOT_LISTED = 'Other';

const QUADRANTS: Quadrant[] = ['NW', 'NE', 'SW', 'SE', 'Centre'];
const quadLabel = (q: Quadrant) => (q === 'Centre' ? 'Inner city' : q);

/** The chosen community as a stamp: name, quadrant, and where the name came from. */
export function CommunityStamp({ name, source, action }: { name: string; source?: string; action?: ReactNode }) {
  const quadrant = name === NOT_LISTED ? undefined : quadrantOf(name);
  return (
    <div className="lv-cp-stamp" data-q={quadrant}>
      <span className="lv-cp-stamp-pin" aria-hidden="true"><MapPin size={20} strokeWidth={2.4} /></span>
      <span className="lv-cp-stamp-copy">
        {source ? <small>{source}</small> : null}
        <b>{name === NOT_LISTED ? 'Outside Calgary or not sure' : name}</b>
      </span>
      {quadrant ? <em data-q={quadrant}>{quadLabel(quadrant)}</em> : null}
      {action}
    </div>
  );
}

export default function CommunityPicker({ id, value, onChange, invalid, autoFocus }: {
  id: string;
  value: string;
  onChange: (name: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [quad, setQuad] = useState<Quadrant | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const typing = query.trim().length > 0;
  const matches = useMemo((): Array<CalgaryCommunity & { via?: string }> => {
    if (typing) return matchCommunities(query, 6);
    if (!quad) return [];
    return CALGARY_COMMUNITIES.filter(c => c.quadrant === quad).sort((a, b) => a.name.localeCompare(b.name));
  }, [query, quad, typing]);
  const options = typing || quad ? [...matches.map(m => m.name), NOT_LISTED] : [];

  const pick = (name: string) => {
    onChange(name);
    setQuery('');
    setQuad(null);
    setOpen(false);
  };

  if (value && !open) {
    return (
      <CommunityStamp
        name={value}
        source="Your pick"
        action={<button type="button" className="lv-cp-stamp-change" onClick={() => { setOpen(true); requestAnimationFrame(() => input.current?.focus()); }}>Change</button>}
      />
    );
  }

  return (
    <div className="lv-cp" data-open={open && options.length ? 'true' : undefined}>
      <div className="lv-cp-field">
        <Search size={18} aria-hidden="true" />
        <input
          ref={input}
          id={id}
          className="lv-o-input"
          type="text"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options.length ? `${listId}-${active}` : undefined}
          aria-invalid={invalid ? 'true' : undefined}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="done"
          placeholder="Type a community, e.g. Hillhurst"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => { setQuery(e.target.value); setQuad(null); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!options.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % options.length); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + options.length) % options.length); }
            else if (e.key === 'Enter') { e.preventDefault(); pick(options[active]); }
            else if (e.key === 'Escape') { setOpen(false); }
          }}
        />
        {query ? <button type="button" className="lv-cp-clear" aria-label="Clear" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQuery(''); input.current?.focus(); }}><X size={16} /></button> : null}
      </div>
      {!typing ? (
        <div className="lv-cp-quads" role="group" aria-label="Or browse by quadrant">
          <span>Or browse</span>
          {QUADRANTS.map(q => (
            <button
              key={q}
              type="button"
              data-q={q}
              aria-pressed={quad === q}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setQuad(quad === q ? null : q); setActive(0); setOpen(true); input.current?.focus(); }}
            >
              {quadLabel(q)}
            </button>
          ))}
        </div>
      ) : null}
      {open && options.length ? (
        <ul className="lv-cp-list" data-browse={quad && !typing ? 'true' : undefined} id={listId} role="listbox" aria-label={quad && !typing ? `${quadLabel(quad)} communities` : 'Calgary communities'}>
          {matches.map((m, i) => (
            <li key={m.name} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(m.name)} onMouseEnter={() => setActive(i)}>
                <span><b>{m.name}</b>{m.via ? <small>Known as {m.via.replace(/\b[a-z]/g, c => c.toUpperCase())}</small> : null}</span>
                {typing ? <em data-q={m.quadrant}>{quadLabel(m.quadrant)}</em> : null}
              </button>
            </li>
          ))}
          <li id={`${listId}-${matches.length}`} role="option" aria-selected={active === matches.length} className="lv-cp-other">
            <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(NOT_LISTED)} onMouseEnter={() => setActive(matches.length)}>
              <span><b>{matches.length ? 'Not one of these' : 'No Calgary community by that name'}</b><small>Outside Calgary or not sure</small></span>
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
