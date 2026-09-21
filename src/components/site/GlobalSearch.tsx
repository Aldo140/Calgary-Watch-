import { useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';
import { normalizeSearch } from '../../lib/discovery';

export function GlobalSearch({ initial = '' }: { initial?: string }) {
  const navigate = useNavigate(); const id = useId();
  return <form className="cw-search" role="search" onSubmit={event => {
    event.preventDefault(); const query = normalizeSearch(String(new FormData(event.currentTarget).get('q') ?? ''));
    navigate(`/search${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  }}><Search size={21} aria-hidden="true" /><label className="cw-sr" htmlFor={id}>Search CalgaryWatch</label>
    <input id={id} name="q" defaultValue={initial} key={initial} maxLength={120} placeholder="What are you looking for?" type="search" />
    <button type="submit" aria-label="Search"><ArrowRight size={22} /></button>
  </form>;
}
