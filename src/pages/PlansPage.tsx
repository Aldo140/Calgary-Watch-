import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Check, MapPin, Pencil } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { useAuth } from '../components/FirebaseProvider';
import { BadgeMark } from '../components/plans/BadgeMark';
import { GoingButton } from '../components/plans/GoingButton';
import { celebrateBadge } from '../components/plans/BadgeToast';
import { discoveryRepository } from '../data/discovery';
import { NEIGHBOURHOOD_COORDS } from '../data/neighbourhoodCoords';
import { computeBadges, orderBadges } from '../lib/badges';
import { fetchCommunityBoundaries, findCommunityAt } from '../lib/communityLookup';
import { buildEventPicks, normalizeInterests, EVENT_INTERESTS, interestsFor, pickDistance, pickWhen, type EventInterestId, type PickItem } from '../lib/eventPicks';
import { homeAreaOf, readMyReportCount, readMySubmissionCount, savePlans, setEmailOptIn, useMyGoing, usePlansProfile, type PlansDraft, type PlansProfile } from '../lib/plans';
import { resolveHomeLocation } from '../hooks/useHomeLocation';
import { auth } from '../firebase';
import '../styles/plans.css';

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\b(Nw|Ne|Sw|Se)\b/g, (q) => q.toUpperCase());

/** Official community names from the City, with the built-in list as a floor. */
function useCommunityNames(): string[] {
  const [names, setNames] = useState<string[]>(() => Object.keys(NEIGHBOURHOOD_COORDS).map(titleCase).sort());
  useEffect(() => {
    let live = true;
    fetch('https://data.calgary.ca/resource/surr-xmvs.json?$select=name&$limit=400')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<{ name?: string }>) => {
        if (!live) return;
        const official = rows.map((r) => r.name ?? '').filter((n) => n && !/^\d/.test(n)).map(titleCase);
        if (official.length) setNames((prev) => [...new Set([...prev, ...official])].sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return names;
}

/** Community containing a saved street address, via the City's own registry and boundaries. */
async function communityForAddress(address: string): Promise<string> {
  const point = await resolveHomeLocation(address);
  if (!point) return '';
  const name = findCommunityAt(point.lat, point.lng, await fetchCommunityBoundaries());
  return name ? titleCase(name) : '';
}

const EMPTY: PlansDraft = { interests: [], neighborhood: '', address: '', inferredNeighborhood: '', consent: false, eventsDigestOptIn: false, weeklyDigestOptIn: false };

function draftFrom(profile: PlansProfile | null): PlansDraft {
  if (!profile) return EMPTY;
  return {
    interests: profile.eventInterests,
    neighborhood: profile.neighborhood ?? '',
    address: profile.address ?? '',
    inferredNeighborhood: profile.inferredNeighborhood ?? '',
    consent: Boolean(profile.piiConsentAt),
    eventsDigestOptIn: profile.eventsDigestOptIn,
    weeklyDigestOptIn: profile.weeklyDigestOptIn === true,
  };
}

/** Which email a link asked for: `?email=monday`, `?email=thursday`, or both by default. */
function requestedEmails(params: URLSearchParams): Pick<PlansDraft, 'weeklyDigestOptIn' | 'eventsDigestOptIn'> {
  const want = params.get('email');
  return { weeklyDigestOptIn: want !== 'thursday', eventsDigestOptIn: want !== 'monday' };
}

export default function PlansPage() {
  const { user, signIn, isAuthReady, isFirebaseConfigured } = useAuth();
  const [params] = useSearchParams();
  const profile = usePlansProfile(user?.uid);
  const mine = useMyGoing(user?.uid);
  const communities = useCommunityNames();
  // A first-time visitor starts with the email(s) the link they followed was about, visibly ticked.
  const [draft, setDraft] = useState<PlansDraft>(() => ({ ...EMPTY, ...requestedEmails(params), interests: normalizeInterests((params.get('interests') ?? '').split(',')) }));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [reportCount, setReportCount] = useState<number | undefined>(undefined);
  const [submissionCount, setSubmissionCount] = useState<number | undefined>(undefined);
  const pendingSave = useRef(false);
  const hydratedFor = useRef<string | null>(null);

  useEffect(() => { document.title = 'Your CalgaryWatch | Emails, plans & badges'; }, []);

  // Hydrate the form from the profile once per account, keeping anything the
  // reader picked before signing in.
  useEffect(() => {
    if (!user || !profile || hydratedFor.current === user.uid) return;
    hydratedFor.current = user.uid;
    setDraft((local) => {
      const stored = draftFrom(profile);
      const fresh = !profile.piiConsentAt && !profile.eventInterests.length;
      // Keep what they chose before signing in; a brand-new account also keeps the ticked emails.
      return {
        ...stored,
        ...(local.interests.length ? { interests: local.interests } : {}),
        ...(fresh ? { weeklyDigestOptIn: local.weeklyDigestOptIn, eventsDigestOptIn: local.eventsDigestOptIn } : {}),
        ...(local.neighborhood || local.address ? { neighborhood: local.neighborhood, address: local.address, inferredNeighborhood: local.inferredNeighborhood, consent: local.consent || stored.consent } : {}),
      };
    });
  }, [user, profile]);

  useEffect(() => {
    if (!user) { setReportCount(undefined); return; }
    let live = true;
    void readMyReportCount(user.uid).then((n) => { if (live) setReportCount(n); });
    void readMySubmissionCount(user.uid).then((n) => { if (live) setSubmissionCount(n); });
    return () => { live = false; };
  }, [user]);

  // Set up = has a home area on file (the one thing every email needs).
  const hasPlans = Boolean(profile && (profile.piiConsentAt || profile.eventInterests.length));
  const showForm = !user || !profile || !hasPlans || editing;
  const area = profile ? homeAreaOf(profile) : '';
  const entities = discoveryRepository.list();
  const occurrences = discoveryRepository.occurrences();
  const interests = (showForm ? draft.interests : profile?.eventInterests) ?? [];
  const picks = useMemo(
    () => buildEventPicks({ entities, occurrences, interests, homeArea: area || draft.neighborhood || draft.inferredNeighborhood, goingIds: mine.ids, days: 10, limit: 8 }),
    [entities, occurrences, interests, area, draft.neighborhood, draft.inferredNeighborhood, mine.ids],
  );

  const goingKinds = useMemo(() => {
    const kinds = new Set<EventInterestId>();
    for (const e of entities) if (mine.ids.has(e.id)) interestsFor(e).filter((i) => i !== 'free').forEach((i) => kinds.add(i));
    return kinds.size;
  }, [entities, mine.ids]);

  const badges = orderBadges(computeBadges({
    createdAt: profile?.createdAt ?? null,
    hasHomeArea: Boolean(area),
    interestCount: profile?.eventInterests.length ?? 0,
    eventsDigestOptIn: profile?.eventsDigestOptIn === true,
    weeklyDigestOptIn: profile?.weeklyDigestOptIn === true,
    goingCount: mine.ids.size,
    goingInterestCount: goingKinds,
    reportCount,
    submissionCount,
  }));
  const unlocked = badges.filter((b) => b.unlocked).length;

  const hasArea = Boolean(draft.neighborhood.trim() || draft.address.trim());
  const needsConsent = hasArea && !profile?.piiConsentAt;
  const problem = !hasArea ? 'Add your neighbourhood or address, so everything starts near home.'
    : needsConsent && !draft.consent ? 'Tick the box so we can store your area.'
    : draft.eventsDigestOptIn && !draft.interests.length ? 'Pick at least one interest for your Thursday picks, or untick that email.'
    : '';

  const save = async () => {
    const current = auth?.currentUser;
    if (!current) { pendingSave.current = true; await signIn(); if (!auth?.currentUser) pendingSave.current = false; return; }
    if (problem) { setError(problem); return; }
    setSaving(true); setError('');
    try {
      let inferred = draft.inferredNeighborhood;
      if (draft.address.trim() && !inferred && !draft.neighborhood.trim()) inferred = await communityForAddress(draft.address).catch(() => '');
      await savePlans(current, profile, { ...draft, inferredNeighborhood: inferred });
      setSavedAt(Date.now());
      setEditing(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('Your plans didn’t save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  // The save that started a sign-in finishes once the account is ready.
  useEffect(() => {
    if (pendingSave.current && user && profile) { pendingSave.current = false; void save(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile]);

  const toggleInterest = (id: EventInterestId) => setDraft((d) => ({ ...d, interests: d.interests.includes(id) ? d.interests.filter((i) => i !== id) : [...d.interests, id] }));

  const q = draft.neighborhood.trim().toLowerCase();
  const suggestions = q.length >= 2 && !communities.some((c) => c.toLowerCase() === q)
    ? communities.filter((c) => c.toLowerCase().includes(q)).sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q))).slice(0, 6)
    : [];

  return (
    <SiteLayout>
      <div className="cw-plans">
        <header className="cw-wrap pl-head">
          <p className="pl-eyebrow">{user && hasPlans ? `Welcome back${user.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}` : 'Your CalgaryWatch · free for Calgarians'}</p>
          <h1>Calgary, <em>your way.</em></h1>
          <p className="pl-lead">One place for everything we send you: what happened near home on Mondays, weekend picks for what you’re into on Thursdays, the events you’re going to, and the badges you pick up along the way.</p>
          {!user ? (
            <ul className="pl-perks" aria-label="What you get">
              <li><Check size={15} aria-hidden="true" /> Monday recap of what happened near home</li>
              <li><Check size={15} aria-hidden="true" /> Thursday picks for what you’re into</li>
              <li><Check size={15} aria-hidden="true" /> “I’m going” on any event</li>
              <li><Check size={15} aria-hidden="true" /> Badges as you go</li>
            </ul>
          ) : null}
          {savedAt ? <p className="pl-saved" role="status"><Check size={16} aria-hidden="true" /> Saved. {savedSummary(profile)}</p> : null}
          {user && profile && hasPlans && !showForm ? <NextSteps profile={profile} goingCount={mine.ids.size} onAdd={async (which) => { await setEmailOptIn(user, profile, which === 'monday' ? { weekly: true } : { events: true }); setSavedAt(Date.now()); celebrateBadge(which === 'monday' ? 'monday-reader' : 'on-the-list'); }} /> : null}
        </header>

        <div className="cw-wrap pl-grid">
          <div className="pl-main">
            {showForm ? (
              <form className="pl-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
                <fieldset className="pl-step">
                  <legend><span className="pl-num">01</span> Where’s home?</legend>
                  <p className="pl-help">A neighbourhood is enough. Both emails and your picks start from here, and the live map uses it too, so you set it once.</p>
                  {!draft.address ? (
                    <label className="pl-field">
                      <span>Neighbourhood</span>
                      <input
                        value={draft.neighborhood}
                        onChange={(e) => setDraft((d) => ({ ...d, neighborhood: e.target.value, inferredNeighborhood: '' }))}
                        placeholder="Start typing, e.g. Bridgeland"
                        autoComplete="off"
                        enterKeyHint="next"
                        aria-describedby="pl-hood-hint"
                      />
                    </label>
                  ) : null}
                  {suggestions.length ? (
                    <div className="pl-suggest" aria-label="Matching neighbourhoods">
                      {suggestions.map((s) => <button key={s} type="button" onClick={() => setDraft((d) => ({ ...d, neighborhood: s, inferredNeighborhood: '', address: '' }))}><MapPin size={14} aria-hidden="true" /> {s}</button>)}
                    </div>
                  ) : <p id="pl-hood-hint" className="pl-hint">{communities.length > 100 ? `All ${communities.length} official Calgary communities are searchable.` : 'Calgary communities only.'}</p>}
                  {!draft.neighborhood ? (
                    <label className="pl-field">
                      <span>Or a street address <small>(optional, more precise)</small></span>
                      <input
                        value={draft.address}
                        onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value, inferredNeighborhood: '' }))}
                        placeholder="e.g. 201 8 Av SW"
                        autoComplete="street-address"
                      />
                    </label>
                  ) : <button type="button" className="pl-textbtn" onClick={() => setDraft((d) => ({ ...d, neighborhood: '', inferredNeighborhood: '' }))}>Use a street address instead</button>}
                  {draft.address ? <button type="button" className="pl-textbtn" onClick={() => setDraft((d) => ({ ...d, address: '', inferredNeighborhood: '' }))}>Use a neighbourhood instead</button> : null}
                  {needsConsent ? (
                    <label className="pl-check">
                      <input type="checkbox" checked={draft.consent} onChange={(e) => setDraft((d) => ({ ...d, consent: e.target.checked }))} />
                      <span><strong>Store my area.</strong> CalgaryWatch keeps it on your account to run your emails and picks. An address is turned into a point only while an email is made and never shown to anyone. <Link to="/privacy">What we keep</Link></span>
                    </label>
                  ) : null}
                </fieldset>

                <fieldset className="pl-step" id="emails">
                  <legend><span className="pl-num">02</span> Your emails</legend>
                  <p className="pl-help">Two short emails, both free, each with its own one-click unsubscribe.</p>
                  <div className="pl-mails">
                    <label className="pl-mail" data-on={draft.weeklyDigestOptIn}>
                      <input type="checkbox" checked={draft.weeklyDigestOptIn} onChange={(e) => setDraft((d) => ({ ...d, weeklyDigestOptIn: e.target.checked }))} />
                      <span className="pl-mail-day">Monday</span>
                      <strong>Your neighbourhood’s week</strong>
                      <small>Public safety reports within a 15-minute walk, 3 km and 10 km of home: police news, 311, outages and what neighbours posted.</small>
                    </label>
                    <label className="pl-mail" data-on={draft.eventsDigestOptIn}>
                      <input type="checkbox" checked={draft.eventsDigestOptIn} onChange={(e) => setDraft((d) => ({ ...d, eventsDigestOptIn: e.target.checked }))} />
                      <span className="pl-mail-day">Thursday</span>
                      <strong>Your weekend picks</strong>
                      <small>Up to eight events for the next ten days that match your interests, near home first, plus reminders for what you’re going to.</small>
                    </label>
                  </div>
                </fieldset>

                <fieldset className="pl-step">
                  <legend><span className="pl-num">03</span> What are you into?</legend>
                  <p className="pl-help">{draft.eventsDigestOptIn ? 'Your Thursday picks come from these. Pick as many as you like.' : 'Optional. These shape the picks on this page and in the Thursday email.'}</p>
                  <div className="pl-chips">
                    {EVENT_INTERESTS.map((i) => {
                      const on = draft.interests.includes(i.id);
                      return (
                        <button key={i.id} type="button" className="pl-chip" aria-pressed={on} onClick={() => toggleInterest(i.id)}>
                          <span className="pl-chip-tick" aria-hidden="true">{on ? <Check size={14} strokeWidth={3} /> : null}</span>
                          <span><strong>{i.label}</strong><small>{i.note}</small></span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {error ? <p className="pl-error" role="alert">{error}</p> : null}
                <div className="pl-actions">
                  <button type="submit" className="pl-btn" disabled={saving || (isAuthReady && !isFirebaseConfigured)}>
                    {saving ? 'Saving…' : user ? (hasPlans ? 'Save changes' : 'Save and finish') : 'Continue with Google'} <ArrowUpRight size={18} aria-hidden="true" />
                  </button>
                  {editing ? <button type="button" className="pl-textbtn" onClick={() => { setEditing(false); setDraft(draftFrom(profile)); setError(''); }}>Cancel</button> : null}
                  {!user ? <p className="pl-fine">Google sign-in keeps your settings yours. Everything you picked above is kept through sign-in.</p> : null}
                </div>
              </form>
            ) : null}

            <section className="pl-picks" aria-labelledby="pl-picks-title">
              <div className="pl-sec-head">
                <h2 id="pl-picks-title">{interests.length ? 'Picked for you' : 'On in Calgary'}<span> · next 10 days</span></h2>
                {!showForm ? <button type="button" className="pl-textbtn" onClick={() => { setDraft(draftFrom(profile)); setEditing(true); }}><Pencil size={14} aria-hidden="true" /> Edit area, emails & interests</button> : null}
              </div>
              {picks.picks.length ? (
                <ol className="pl-list">{picks.picks.map((p) => <PickRow key={p.key} item={p} signedIn={!!user} />)}</ol>
              ) : (
                <p className="pl-empty">{interests.length ? 'Nothing listed yet that matches. We only list events we’ve checked with the organizer, so some weeks are quieter. Try adding an interest.' : 'Pick a few interests above to see what fits.'}</p>
              )}
              <p className="pl-fine">{picks.considered} upcoming events and market dates considered. <Link to="/events">Browse everything</Link></p>
            </section>
          </div>

          <aside className="pl-side" aria-label="Your profile">
            {user ? (
              <div className="pl-card">
                <div className="pl-me">
                  {user.photoURL ? <img src={user.photoURL} alt="" width="52" height="52" referrerPolicy="no-referrer" /> : <span className="pl-avatar" aria-hidden="true">{(user.displayName || 'C').slice(0, 1)}</span>}
                  <div>
                    <strong>{user.displayName || 'Calgary neighbour'}</strong>
                    <span>{area ? <><MapPin size={13} aria-hidden="true" /> {area}</> : 'No home area yet'}</span>
                  </div>
                </div>
                <dl className="pl-stats">
                  <div><dt>Going</dt><dd>{mine.ready ? mine.ids.size : '…'}</dd></div>
                  <div><dt>Badges</dt><dd>{unlocked}<small>/{badges.length}</small></dd></div>
                  <div><dt>Thursday</dt><dd className="pl-stat-word">{profile?.eventsDigestOptIn ? 'On' : 'Off'}</dd></div>
                </dl>
              </div>
            ) : null}

            {picks.going.length ? (
              <section className="pl-card" aria-labelledby="pl-going-title">
                <h2 id="pl-going-title" className="pl-side-title">You’re going</h2>
                <ul className="pl-going-list">
                  {picks.going.map((g) => <li key={g.key}><Link to={g.path}><strong>{g.title}</strong><span>{pickWhen(g.start)}</span></Link></li>)}
                </ul>
              </section>
            ) : null}

            <section className="pl-card" aria-labelledby="pl-badges-title">
              <h2 id="pl-badges-title" className="pl-side-title">Badges <span>{user ? `${unlocked} of ${badges.length}` : `${badges.length} to collect`}</span></h2>
              <ul className="pl-badges">
                {badges.map((b) => (
                  <li key={b.id} data-locked={!b.unlocked || !user}>
                    <BadgeMark badge={{ ...b, unlocked: b.unlocked && !!user }} size={64} />
                    <strong>{b.label}</strong>
                    <small>{b.unlocked && user ? b.earned : b.hint}{b.target && user && !b.unlocked ? ` ${b.progress}/${b.target}` : ''}</small>
                  </li>
                ))}
              </ul>
            </section>

            <p className="pl-fine pl-side-foot">Instant alerts and quiet hours live in the <Link to="/map?settings=alerts">live map’s settings</Link>.</p>
          </aside>
        </div>
      </div>
    </SiteLayout>
  );
}

/**
 * After setup, the one or two things most worth doing next, in order: the
 * email they don't have yet (one tap), then making a first plan. Nothing
 * shows once both are done.
 */
function NextSteps({ profile, goingCount, onAdd }: { profile: PlansProfile; goingCount: number; onAdd: (which: 'monday' | 'thursday') => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const items: React.ReactNode[] = [];
  const add = (which: 'monday' | 'thursday', text: React.ReactNode, label: string) => items.push(
    <div className="pl-next-item" key={which}><p>{text}</p><button type="button" disabled={busy === which} onClick={async () => { setBusy(which); try { await onAdd(which); } finally { setBusy(null); } }}>{busy === which ? 'Adding…' : label}</button></div>,
  );
  if (!profile.weeklyDigestOptIn && (profile.neighborhood || profile.inferredNeighborhood)) add('monday', <><strong>Add the Monday email?</strong> What happened near {profile.neighborhood || profile.inferredNeighborhood} this week, from police news, 311 and neighbours.</>, 'Add Monday');
  if (!profile.eventsDigestOptIn && profile.eventInterests.length) add('thursday', <><strong>Add Thursday picks?</strong> Weekend plans for what you’re into, near home first.</>, 'Add Thursday');
  if (!goingCount) items.push(<div className="pl-next-item" key="going"><p><strong>Make your first plan.</strong> Tap “I’m going” on anything below to earn your first badge and get a reminder.</p><a className="pl-next-go" href="#pl-picks-title">See picks</a></div>);
  return items.length ? <div className="pl-next" aria-label="Next steps">{items.slice(0, 2)}</div> : null;
}

function savedSummary(profile: PlansProfile | null): string {
  const on = [profile?.weeklyDigestOptIn ? 'Monday' : '', profile?.eventsDigestOptIn ? 'Thursday' : ''].filter(Boolean);
  return on.length ? `You’ll get the ${on.join(' and ')} email${on.length > 1 ? 's' : ''}, starting with the next one.` : 'No emails for now; your picks and plans stay here.';
}

function PickRow({ item, signedIn }: { item: PickItem; signedIn: boolean }) {
  const distance = pickDistance(item.distanceM);
  const labels = EVENT_INTERESTS.filter((i) => item.matched.includes(i.id)).map((i) => i.label);
  return (
    <li className="pl-row">
      <time dateTime={item.start}>{pickWhen(item.start)}</time>
      <div>
        <Link to={item.path} className="pl-row-title">{item.title}</Link>
        <p>{[item.venue || item.neighbourhood, distance, item.free ? 'Free' : null].filter(Boolean).join(' · ')}</p>
        {labels.length ? <p className="pl-row-tags">{labels.map((l) => <span key={l}>{l}</span>)}</p> : null}
      </div>
      {item.kind === 'event' && signedIn ? <GoingButton eventId={item.entityId} start={item.start} compact /> : <Link to={item.path} className="pl-row-go" aria-label={`Open ${item.title}`}><ArrowUpRight size={18} /></Link>}
    </li>
  );
}
