import { useEffect, useRef, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { currentCommunity } from '../../lib/currentCommunity';

export function LocationShortcut({ value, disabled = false, onSelect }: { value: string; disabled?: boolean; onSelect: (name: string) => void }) {
  const request = useRef(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // Typing, skipping a step or closing settings cancels any pending suggestion.
  useEffect(() => { request.current++; setBusy(false); return () => { request.current++; }; }, [value, disabled]);
  const locate = async () => {
    const token = ++request.current;
    setBusy(true); setMessage('');
    try {
      const name = await currentCommunity(typeof navigator === 'undefined' ? undefined : navigator.geolocation);
      if (request.current !== token) return;
      onSelect(name);
      setMessage(`Suggested ${name}. Check it before saving; your current location may be different from home.`);
    } catch (error) {
      if (request.current === token) setMessage(error instanceof Error ? error.message : 'Couldn’t find your neighbourhood. You can continue without one.');
    } finally { if (request.current === token) setBusy(false); }
  };
  return <div className="su-location">
    <button type="button" className="su-link" disabled={disabled || busy} onClick={() => void locate()}><LocateFixed size={16} aria-hidden="true" /> {busy ? 'Finding your neighbourhood…' : 'Use my current location'}</button>
    <p className="su-hint">Used once to suggest your neighbourhood. Exact GPS coordinates aren’t saved.</p>
    <p className="su-hint" role="status" aria-live="polite">{message}</p>
  </div>;
}
