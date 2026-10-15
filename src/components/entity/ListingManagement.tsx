import { listingUpdateProblem } from '../../lib/listingUpdates';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Sparkles } from 'lucide-react';
import { useAuth } from '../FirebaseProvider';
import { UPDATE_FIELDS, type UpdateField } from '../../lib/claims';
import { readMyUpdates, submitUpdate } from '../../lib/claimsApi';
import { LISTING_CONTACT_EMAIL } from '../../config/contact';

/** After approval: the organizer's direct line, with a history of what they've asked for. */
export function ListingManagement({ claim, previewUid }: { claim: { entityId: string; entityTitle: string }; previewUid?: string }) {
  const { user, isAdmin } = useAuth();
  const readOnly = Boolean(previewUid);
  const subjectUid = previewUid ? (isAdmin ? previewUid : undefined) : user?.uid;
  const [field, setField] = useState<UpdateField>('dates');
  const [details, setDetails] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Array<{ field: UpdateField; details: string; status: string; createdAt: number }>>([]);
  useEffect(() => { let active = true; setHistory([]);
    if (subjectUid) void readMyUpdates(subjectUid, claim.entityId, true).then(rows => { if (active) setHistory(rows); }).catch(() => { if (active) setError('Could not load this member’s requests. Try again later.'); });
    return () => { active = false; };
  }, [subjectUid, claim.entityId, sent]);
  const meta = UPDATE_FIELDS.find((f) => f.id === field)!;
  const needsUrl = field === 'link';
  return (
    <section className="pl-form cl-form" aria-labelledby="cl-manage">
      <div className="cl-owner"><Sparkles size={18} aria-hidden="true" /> <span><strong>You manage this listing.</strong> Send a change to CalgaryWatch for review. Your public listing changes only after we apply the update.</span></div>
      <fieldset className="pl-step">
        <legend id="cl-manage"><span className="pl-num">✎</span> What should change?</legend>
        <div className="pl-chips cl-fields">
          {UPDATE_FIELDS.map((f) => (
            <button key={f.id} type="button" className="pl-chip" aria-pressed={field === f.id} onClick={() => setField(f.id)}>
              <span className="pl-chip-tick" aria-hidden="true">{field === f.id ? <Check size={14} strokeWidth={3} /> : null}</span>
              <span><strong>{f.label}</strong><small>{f.hint}</small></span>
            </button>
          ))}
        </div>
        <label className="pl-field"><span>Details</span><textarea className="cl-textarea" rows={4} readOnly={readOnly} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={meta.hint} /></label>
        {needsUrl || field === 'photo' || field === 'dates' || field === 'other' ? (
          <label className="pl-field"><span>{field === 'photo' ? 'Image/source URL' : 'Link'} {needsUrl ? '' : <small>(optional)</small>}</span><input type="url" readOnly={readOnly} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></label>
        ) : null}
        {field === 'photo' ? <p className="pl-hint">For original artwork or photos, email the exact files you want us to use to <a href={`mailto:${LISTING_CONTACT_EMAIL}?subject=${encodeURIComponent(`Photos for ${claim.entityTitle}`)}`}>{LISTING_CONTACT_EMAIL}</a>. Include the listing name and only send images you own or have permission to share. Include the artist’s name and requested credit. This form sends a request and optional source URL; it does not upload image files.</p> : null}
      </fieldset>
      {url.trim() && listingUpdateProblem(field, details, url) ? <p className="pl-hint">{listingUpdateProblem(field, details, url)}</p> : null}
      {error ? <p className="pl-error" role="alert">{error}</p> : null}
      <div className="pl-actions">
        <button
          type="button" className="pl-btn" disabled={readOnly || busy || Boolean(listingUpdateProblem(field, details, url))}
          onClick={async () => {
            if (!user || readOnly) return;
            setBusy(true); setError('');
            try { await submitUpdate(user, claim, field, details, url); setDetails(''); setUrl(''); setSent((n) => n + 1); }
            catch { setError('That didn’t send. Try again in a moment.'); }
            finally { setBusy(false); }
          }}
        >
          {readOnly ? 'Read-only preview' : busy ? 'Sending…' : 'Send this change'} <ArrowUpRight size={18} aria-hidden="true" />
        </button>
        {sent ? <p className="pl-goal" data-done="true" role="status"><Check size={14} strokeWidth={3} aria-hidden="true" /> Request sent for review. Your public listing has not changed yet. Track the decision under Your requests.</p> : null}
      </div>
      {history.length ? (
        <div className="cl-history">
          <h3>Your requests</h3>
          <ul>{history.map((h, i) => <li key={i} data-status={h.status}><strong>{UPDATE_FIELDS.find((f) => f.id === h.field)?.label}</strong><span>{h.details}</span><em>{h.status === 'applied' ? 'Applied' : h.status === 'declined' ? 'Not changed' : 'Waiting for review'}</em></li>)}</ul>
        </div>
      ) : null}
    </section>
  );
}

