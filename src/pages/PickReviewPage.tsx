import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { discoveryRepository } from '../data/discovery';
import { buildReview, pickDeskPath, placeFromLink, PICK_REVIEWS, REVIEW_TEXT_MAX, type Hired } from '../lib/cwPicks';
import '../styles/picks.css';

/**
 * /review?f=&k=&l=&p=: the one page a CalgaryWatch Pick follow-up email links
 * to. Signed out by design. The Firestore rule checks the key against the
 * follow-up, so only the person who got the email can answer, once.
 */
export default function PickReviewPage() {
  const [params] = useSearchParams();
  const followup = params.get('f') ?? '';
  const key = params.get('k') ?? '';
  const found = placeFromLink(params.get('l') ?? '', params.get('p') ?? '', discoveryRepository.list());
  const [hired, setHired] = useState<Hired | null>(null);
  const [stars, setStars] = useState<number | null>(null);
  const [again, setAgain] = useState<boolean | null>(null);
  const [onTime, setOnTime] = useState<boolean | null>(null);
  const [onPrice, setOnPrice] = useState<boolean | null>(null);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState('');

  if (!found || !followup || !key) {
    return (
      <SiteLayout>
        <main className="pr">
          <p className="pr-kicker">CalgaryWatch Picks</p>
          <h1>This link didn’t open properly.</h1>
          <p className="pr-lead">Open it again from the email, or reply to that email and tell us how it went. We read every reply.</p>
          <Link to="/picks">How CalgaryWatch Picks work</Link>
        </main>
      </SiteLayout>
    );
  }
  const { shelf, contender: place } = found;
  const service = shelf.service;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!hired) { setError('Did you hire them?'); return; }
    const review = buildReview({ followup, key, list: service.id, place: params.get('p') ?? '', hired, stars, again, onTime, onPrice, text });
    if (typeof review === 'string') { setError(review); return; }
    setState('sending');
    try {
      const [{ db }, { doc, setDoc }] = await Promise.all([import('../firebase'), import('firebase/firestore')]);
      if (!db) throw new Error('offline');
      await setDoc(doc(db, PICK_REVIEWS, followup), review);
      setState('done');
    } catch {
      setState('idle');
      setError('That didn’t send. If you already answered, we have it. Otherwise, reply to the email and we’ll add it by hand.');
    }
  };

  const yesNo = (name: string, value: boolean | null, set: (v: boolean) => void) => (
    <div className="pr-choices">
      {[true, false].map(v => (
        <label key={String(v)} className="pr-choice"><input type="radio" name={name} checked={value === v} onChange={() => set(v)} /><span>{v ? 'Yes' : 'No'}</span></label>
      ))}
    </div>
  );

  return (
    <SiteLayout>
      <main className="pr">
        <p className="pr-kicker">CalgaryWatch Picks · {service.label}</p>
        <h1>How did {place.name} do?</h1>
        <p className="pr-lead">You contacted them from CalgaryWatch about a week ago. Your answer goes to us first; we never publish your name or email, and we don’t pass it to {place.name}.</p>
        {state === 'done' ? (
          <div className="pr-done" role="status">
            <p><CheckCircle2 size={18} aria-hidden="true" /> <b>Thank you.</b> That’s it: no more emails about this, and we’ve scheduled your address for deletion.</p>
            <p><Link to={pickDeskPath(service.id)}>Back to {service.label.toLowerCase()} in Calgary</Link></p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <fieldset>
              <legend>Did you hire them?</legend>
              <div className="pr-choices">
                {([['yes', 'Yes'], ['no', 'No, I went with someone else'], ['not-yet', 'Not yet']] as Array<[Hired, string]>).map(([v, label]) => (
                  <label key={v} className="pr-choice"><input type="radio" name="hired" checked={hired === v} onChange={() => setHired(v)} /><span>{label}</span></label>
                ))}
              </div>
            </fieldset>
            {hired === 'yes' ? (
              <>
                <fieldset>
                  <legend>How was the work?</legend>
                  <div className="pr-choices pr-stars">
                    {[1, 2, 3, 4, 5].map(n => (
                      <label key={n} className="pr-choice"><input type="radio" name="stars" checked={stars === n} onChange={() => setStars(n)} aria-label={`${n} of 5`} /><span>{'★'.repeat(n)}</span></label>
                    ))}
                  </div>
                </fieldset>
                <fieldset><legend>Did they show up when they said?</legend>{yesNo('onTime', onTime, setOnTime)}</fieldset>
                <fieldset><legend>Did the final bill match the quote?</legend>{yesNo('onPrice', onPrice, setOnPrice)}</fieldset>
                <fieldset><legend>Would you hire them again?</legend>{yesNo('again', again, setAgain)}</fieldset>
              </>
            ) : null}
            <fieldset>
              <legend>{hired === 'no' ? 'What made you choose someone else? (optional)' : 'Anything neighbours should know? (optional)'}</legend>
              <textarea value={text} maxLength={REVIEW_TEXT_MAX} onChange={e => setText(e.target.value)} placeholder="What they did, how it went. Please leave out names, emails and phone numbers." />
              <p className="pr-count">{text.length}/{REVIEW_TEXT_MAX}</p>
            </fieldset>
            {error ? <p className="pr-error" role="alert">{error}</p> : null}
            <button className="pr-submit" type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send'}</button>
            <p className="pr-fine">We read every answer before anything is used. Answers decide whether a company keeps the CalgaryWatch Pick. <Link to="/picks">How Picks work</Link></p>
          </form>
        )}
      </main>
    </SiteLayout>
  );
}
