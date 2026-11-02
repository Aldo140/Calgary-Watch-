import { useId, useMemo, useRef, useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { matchCommunities, quadrantOf } from '@/src/lib/reportNeighbourhood';

/**
 * Type-to-find picker over every Calgary community (~200), used by the report and
 * SOS forms when the pin didn't resolve to one or the reporter wants to change it.
 * A native <select> of 200 rows is a long wheel on a phone; typing "hill" is not.
 */
export const NOT_LISTED = 'Other';

export default function CommunityPicker({ id, value, onChange, invalid, autoFocus }: {
  id: string;
  value: string;
  onChange: (name: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const matches = useMemo(() => matchCommunities(query, 6), [query]);
  const options = query.trim() ? [...matches.map(m => m.name), NOT_LISTED] : [];

  const pick = (name: string) => {
    onChange(name);
    setQuery('');
    setOpen(false);
  };

  if (value && !open) {
    const quadrant = value === NOT_LISTED ? undefined : quadrantOf(value);
    return (
      <div className="lv-cp-chosen">
        <MapPin size={18} aria-hidden="true" />
        <span><b>{value === NOT_LISTED ? 'Outside Calgary or not sure' : value}</b>{quadrant ? <small>{quadrant === 'Centre' ? 'Inner city' : quadrant}</small> : null}</span>
        <button type="button" className="lv-o-btn lv-o-btn-ghost" onClick={() => { setOpen(true); requestAnimationFrame(() => input.current?.focus()); }}>Change</button>
      </div>
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
          onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
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
      {open && options.length ? (
        <ul className="lv-cp-list" id={listId} role="listbox" aria-label="Calgary communities">
          {matches.map((m, i) => (
            <li key={m.name} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(m.name)} onMouseEnter={() => setActive(i)}>
                <span><b>{m.name}</b>{m.via ? <small>Known as {m.via.replace(/\b[a-z]/g, c => c.toUpperCase())}</small> : null}</span>
                <em data-q={m.quadrant}>{m.quadrant === 'Centre' ? 'Inner city' : m.quadrant}</em>
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
