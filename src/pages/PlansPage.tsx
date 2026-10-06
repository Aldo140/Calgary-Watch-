import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, MapPin, Pencil } from 'lucide-react';
import { SiteLayout } from '../components/site/SiteLayout';
import { useAuth } from '../components/FirebaseProvider';
import { BadgeMark } from '../components/plans/BadgeMark';
import { GoingButton } from '../components/plans/GoingButton';
import { discoveryRepository } from '../data/discovery';
import { NEIGHBOURHOOD_COORDS } from '../data/neighbourhoodCoords';
import { computeBadges, orderBadges } from '../lib/badges';
import { fetchCommunityBoundaries, findCommunityAt } from '../lib/communityLookup';
import { buildEventPicks, EVENT_INTERESTS, interestsFor, pickDistance, pickWhen, type EventInterestId, type PickItem } from '../lib/eventPicks';
import { homeAreaOf, readMyReportCount, savePlans, useMyGoing, usePlansProfile, type PlansDraft, type PlansProfile } from '../lib/plans';
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

const EMPTY: PlansDraft = { interests: [], neighborhood: '', address: '', inferredNeighborhood: '', consent: false, eventsDigestOptIn: true };

function draftFrom(profile: PlansProfile | null): PlansDraft {
  if (!profile) return EMPTY;
  return {
    interests: profile.eventInterests,
    neighborhood: profile.neighborhood ?? '',
    address: profile.address ?? '',
    inferredNeighborhood: profile.inferredNeighborhood ?? '',
    consent: Boolean(profile.piiConsentAt),
    // A first visit defaults the box on, visibly, beside what it sends; the
    // reader can untick it before saving. A returning reader sees their choice.
    eventsDigestOptIn: profile.eventInterests.length || profile.eventsDigestOptInAt ? profile.eventsDigestOptIn : true,
  };
}

export default function PlansPage() {
  const { user, signIn, isAuthReady, isFirebaseConfigured } = useAuth();
  const profile = usePlansProfile(user?.uid);
  const mine = useMyGoing(user?.uid);
  const communities = useCommunityNames();
  const [draft, setDraft] = useState<PlansDraft>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [reportCount, setReportCount] = useState<number | undefined>(undefined);
  const pendingSave = useRef(false);
  const hydratedFor = useRef<string | null>(null);

  useEffect(() => { document.title = 'Your Calgary plans | CalgaryWatch'; }, []);

  // Hydrate the form from the profile once per account, keeping anything the
  // reader picked before signing in.
  useEffect(() => {
    if (!user || !profile || hydratedFor.current === user.uid) return;
    hydratedFor.current = user.uid;
    setDraft((local) => {
      const stored = draftFrom(profile);
      return local.interests.length ? { ...stored, interests: local.interests } : stored;
    });
  }, [user, profile]);

  useEffect(() => {
    if (!user) { setReportCount(undefined); return; }
    let live = true;
    void readMyReportCount(user.uid).then((n) => { if (live) setReportCount(n); });
    return () => { live = false; };
  }, [user]);

  const hasPlans = Boolean(profile && profile.eventInterests.length);
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
  }));
  const unlocked = badges.filter((b) => b.unlocked).length;

  const hasArea = Boolean(draft.neighborhood.trim() || draft.address.trim());
  const needsConsent = hasArea && !profile?.piiConsentAt;
  const canSave = draft.interests.length > 0 && hasArea && (!needsConsent || draft.consent);

  const save = async () => {
    const current = auth?.currentUser;
    if (!current) { pendingSave.current = true; await signIn(); if (!auth?.currentUser) pendingSave.current = false; return; }
    if (!canSave) { setError(!draft.interests.length ? 'Pick at least one thing you’re into.' : !hasArea ? 'Add your neighbourhood or address so picks can start near home.' : 'Tick the box so we can store your area.'); return; }
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
          <p className="pl-eyebrow">Your Calgary plans</p>
          <h1>Plans that fit <em>you.</em></h1>
          <p className="pl-lead">Tell us what you’re into and where home is. We’ll pick from every event and market we’ve checked against the organizer, give things near home a head start, and send the best of it on Thursday mornings, in time for the weekend.</p>
          {savedAt ? <p className="pl-saved" role="status"><Check size={16} aria-hidden="true" /> Saved. {profile?.eventsDigestOptIn ? 'Your first picks email arrives Thursday morning.' : 'The Thursday email is off; your picks stay here.'}</p> : null}
        </header>

        <div className="cw-wrap pl-grid">
          <div className="pl-main">
            {showForm ? (
              <form className="pl-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
                <fieldset className="pl-step">
                  <legend><span className="pl-num">01</span> What are you into?</legend>
                  <p className="pl-help">Pick as many as you like. You can change them any time.</p>
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

                <fieldset className="pl-step">
                  <legend><span className="pl-num">02</span> Where’s home?</legend>
                  <p className="pl-help">A neighbourhood is enough. It’s the same setting the live map’s Monday email uses, so you only set it once.</p>
                  {!draft.address ? (
                    <label className="pl-field">
                      <span>Neighbourhood</span>
                      <input
                        value={draft.neighborhood}
                        onChange={(e) => setDraft((d) => ({ ...d, neighborhood: e.target.value, inferredNeighborhood: '' }))}
                        placeholder="Start typing, e.g. Bridgeland"
                        autoComplete="off"
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
                      <span><strong>Store my area.</strong> CalgaryWatch keeps it on your account to choose picks and run your emails. An address is turned into a point only while picks are made and never shown to anyone. <Link to="/privacy">What we keep</Link></span>
                    </label>
                  ) : null}
                </fieldset>

                <fieldset className="pl-step">
                  <legend><span className="pl-num">03</span> The Thursday picks email</legend>
                  <label className="pl-check pl-check-mail">
                    <input type="checkbox" checked={draft.eventsDigestOptIn} onChange={(e) => setDraft((d) => ({ ...d, eventsDigestOptIn: e.target.checked }))} />
                    <span><strong>Email me my picks every Thursday.</strong> Up to eight things for the next ten days that match what you chose, starting near home, plus a reminder for anything you said you’re going to. Free, separate from the Monday safety email, and one click to stop.</span>
                  </label>
                </fieldset>

                {error ? <p className="pl-error" role="alert">{error}</p> : null}
                <div className="pl-actions">
                  <button type="submit" className="pl-btn" disabled={saving || (isAuthReady && !isFirebaseConfigured)}>
                    {saving ? 'Saving…' : user ? (hasPlans ? 'Save changes' : 'Save my plans') : 'Continue with Google'} <ArrowUpRight size={18} aria-hidden="true" />
                  </button>
                  {editing ? <button type="button" className="pl-textbtn" onClick={() => { setEditing(false); setDraft(draftFrom(profile)); }}>Cancel</button> : null}
                  {!user ? <p className="pl-fine">We use Google sign-in so nobody else can change your settings. Your picks above are kept through sign-in.</p> : null}
                </div>
              </form>
            ) : null}

            <section className="pl-picks" aria-labelledby="pl-picks-title">
              <div className="pl-sec-head">
                <h2 id="pl-picks-title">{interests.length ? 'Picked for you' : 'On in Calgary'}<span> · next 10 days</span></h2>
                {!showForm ? <button type="button" className="pl-textbtn" onClick={() => { setDraft(draftFrom(profile)); setEditing(true); }}><Pencil size={14} aria-hidden="true" /> Edit interests & email</button> : null}
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
            ) : (
              <div className="pl-card pl-card-pitch">
                <p className="pl-eyebrow">Free for Calgarians</p>
                <ul>
                  <li><Check size={16} aria-hidden="true" /> Picks for what you’re into, near home</li>
                  <li><Check size={16} aria-hidden="true" /> “I’m going” on any event, saved to your plans</li>
                  <li><Check size={16} aria-hidden="true" /> A short Thursday email for the weekend</li>
                  <li><Check size={16} aria-hidden="true" /> Little badges as you go</li>
                </ul>
              </div>
            )}

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

            <p className="pl-fine pl-side-foot">Looking for safety alerts near home? That’s the <Link to="/map?settings=alerts">Monday email on the live map</Link>.</p>
          </aside>
        </div>
      </div>
    </SiteLayout>
  );
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
