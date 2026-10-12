import { useId, useRef, useEffect, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';
import { normalizeSearch } from '../../lib/discovery';

export interface Suggestion { label: string; note?: string; to: string }

/**
 * The site search box. With `suggest`, it becomes a combobox that offers
 * communities, sections and listings as you type (arrow keys, Enter, Escape).
 */
export function GlobalSearch({ initial = '', suggest }: { initial?: string; suggest?: (q: string) => Suggestion[] }) {
  const navigate = useNavigate();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [options, setOptions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const open = !!suggest && options.length > 0;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        !(document.activeElement as HTMLElement)?.isContentEditable
      ) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => { setOptions([]); setActive(-1); }, [initial]);

  const close = () => { setOptions([]); setActive(-1); };
  const go = (s: Suggestion) => { close(); inputRef.current?.blur(); navigate(s.to); };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      // -1 is the typed text itself, so the list wraps through it.
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive(i => ((i + 1 + step + options.length + 1) % (options.length + 1)) - 1);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault(); go(options[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault(); close();
    }
  };

  return (
    <form
      className="cw-search"
      role="search"
      data-open={open || undefined}
      onSubmit={event => {
        event.preventDefault();
        close();
        const query = normalizeSearch(String(new FormData(event.currentTarget).get('q') ?? ''));
        navigate(`/search${query ? `?q=${encodeURIComponent(query)}` : ''}`);
      }}
    >
      <Search size={21} aria-hidden="true" />
      <label className="cw-sr" htmlFor={id}>Search CalgaryWatch</label>
      <input
        ref={inputRef}
        id={id}
        name="q"
        defaultValue={initial}
        key={initial}
        maxLength={120}
        placeholder="Neighbourhood, street, event…"
        type="search"
        autoComplete="off"
        {...(suggest ? {
          role: 'combobox',
          'aria-autocomplete': 'list' as const,
          'aria-expanded': open,
          'aria-controls': `${id}-list`,
          'aria-activedescendant': active >= 0 ? `${id}-opt-${active}` : undefined,
          onChange: (e: ChangeEvent<HTMLInputElement>) => { setOptions(suggest(e.target.value)); setActive(-1); },
          onKeyDown,
          onBlur: () => window.setTimeout(close, 120),
        } : {})}
      />
      <button type="submit" aria-label="Search">
        <ArrowRight size={22} />
      </button>
      {suggest ? (
        <ul className="cw-suggest" id={`${id}-list`} role="listbox" aria-label="Suggestions" hidden={!open}>
          {options.map((s, i) => (
            <li key={`${s.to}-${i}`} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}
              onMouseDown={e => e.preventDefault()} onClick={() => go(s)} onMouseEnter={() => setActive(i)}>
              <span>{s.label}</span>{s.note ? <small>{s.note}</small> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
