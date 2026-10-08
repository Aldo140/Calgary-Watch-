import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Check, MapPin, Pencil, Shield, Sparkles } from 'lucide-react';
import type { User } from 'firebase/auth';
import { SiteLayout } from '../components/site/SiteLayout';
import { useAuth } from '../components/FirebaseProvider';
import { BadgeMark } from '../components/plans/BadgeMark';
import { BadgesCard, EmailsCard, Glance, GoingTimeline, ListingsCard, NearHomeCard, SetupCard } from '../components/plans/MemberHome';
import { useMyClaims } from '../lib/claimsApi';
import { SignupPreview } from '../components/plans/SignupPreview';
import { SignupForm, SignupHero } from '../components/plans/SignupFlow';
import { PlansSkyHero } from '../components/plans/PlansSkyHero';
import { Reveal } from '../components/plans/Motion';
import { GoingButton } from '../components/plans/GoingButton';
import { celebrateBadge } from '../components/plans/BadgeToast';
import { discoveryRepository } from '../data/discovery';
import { NEIGHBOURHOOD_COORDS } from '../data/neighbourhoodCoords';
import { BADGES, computeBadges, orderBadges, type BadgeId } from '../lib/badges';
import { emailPlan, nearHome, partOfDay, setupPercent, setupSteps, type SetupStepId } from '../lib/memberHome';
import { useLivePulse } from '../hooks/useLivePulse';
import { fetchCommunityBoundaries, findCommunityAt } from '../lib/communityLookup';
import { buildEventPicks, normalizeInterests, neighbourhoodPoint, EVENT_INTERESTS, interestsFor, pickDistance, pickWhen, type EventInterestId, type PickItem } from '../lib/eventPicks';
import { homeAreaOf, readMyReportCount, readMySubmissionCount, savePlans, setEmailOptIn, usePendingOptOuts, type PendingOptOuts, useMyGoing, usePlansProfile, type PlansDraft, type PlansProfile } from '../lib/plans';
import { resolveHomeLocation, useHomeLocation } from '../hooks/useHomeLocation';
import { auth } from '../firebase';
import '../styles/plans.css';
import '../styles/signup.css';

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

function draftFrom(profile: PlansProfile | null, pending: PendingOptOuts = { monday: null, thursday: null }): PlansDraft {
  if (!profile) return EMPTY;
  return {
    interests: profile.eventInterests,
    neighborhood: profile.neighborhood ?? '',
    address: profile.address ?? '',
    inferredNeighborhood: profile.inferredNeighborhood ?? '',
    consent: Boolean(profile.piiConsentAt),
    // An email-link opt-out the sender hasn't processed yet already counts as off.
    eventsDigestOptIn: profile.eventsDigestOptIn && !pending.thursday,
    weeklyDigestOptIn: profile.weeklyDigestOptIn === true && !pending.monday,
  };
}

/** Which email a link asked for: `?email=monday`, `?email=thursday`, or both by default. */
function requestedEmails(params: URLSearchParams): Pick<PlansDraft, 'weeklyDigestOptIn' | 'eventsDigestOptIn'> {
  const want = params.get('email');
  return { weeklyDigestOptIn: want !== 'thursday', eventsDigestOptIn: want !== 'monday' };
}

/** Development only: `/plans?demo=member|monday|new` renders a signed-in reader without Firebase. */
function useDemo(params: URLSearchParams): { user: User; profile: PlansProfile; goingIds: Set<string> } | null {
  const mode = import.meta.env.DEV ? params.get('demo') : null;
  return useMemo(() => {
    if (!mode) return null;
    const user = { uid: 'demo', displayName: 'Vicky Penny', email: 'vicky@example.com', photoURL: '' } as unknown as User;
    const set = mode !== 'new';
    const profile: PlansProfile = {
      displayName: 'Vicky Penny', createdAt: Date.parse('2026-05-01'),
      neighborhood: set ? 'Beltline' : '', piiConsentAt: set ? 1 : undefined,
      weeklyDigestOptIn: set, eventsDigestOptIn: mode === 'member',
      eventInterests: set ? ['music', 'food'] : [],
    };
    const now = Date.now();
    const soon = discoveryRepository.list().filter((e) => e.kind === 'event' && Date.parse((e as { start: string }).start) > now).slice(0, mode === 'member' ? 2 : 0);
    return { user, profile, goingIds: new Set(soon.map((e) => e.id)) };
  }, [mode]);
}

export default function PlansPage() {
  const auth0 = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const demo = useDemo(params);
  // Admin can open any member's dashboard read-only: /plans?as=<uid>.
  const asUid = auth0.isAdmin ? (params.get('as') || '').trim() || null : null;
  const { signIn, isAuthReady, isFirebaseConfigured } = auth0;
  const subjectUid = demo ? undefined : asUid ?? auth0.user?.uid;
  const liveProfile = usePlansProfile(subjectUid);
  const profile = demo?.profile ?? liveProfile;
  const viewed = useMemo(() => (asUid && liveProfile
    ? ({ uid: asUid, displayName: liveProfile.displayName ?? '', email: liveProfile.email ?? '', photoURL: liveProfile.photoURL ?? '' } as unknown as User)
    : null), [asUid, liveProfile]);
  const user = demo?.user ?? (asUid ? viewed : auth0.user);
  const readOnly = Boolean(demo || asUid);
  const liveGoing = useMyGoing(subjectUid);
  const mine = demo ? { uid: 'demo', ids: demo.goingIds, ready: true } : liveGoing;
  const pending = usePendingOptOuts(subjectUid);
  const myClaims = useMyClaims(subjectUid);
  // A street address resolves to a point, so picks rank by distance even without a neighbourhood name.
  const { home: addressPoint } = useHomeLocation(profile?.address, Boolean(profile?.address));
  const communities = useCommunityNames();
  // A first-time visitor starts with the email(s) the link they followed was about, visibly ticked.
  const [draft, setDraft] = useState<PlansDraft>(() => ({ ...EMPTY, ...requestedEmails(params), interests: normalizeInterests((params.get('interests') ?? '').split(',')) }));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [joined, setJoined] = useState<BadgeId[] | null>(null);
  const [busy, setBusy] = useState<SetupStepId | null>(null);
  const [reportCount, setReportCount] = useState<number | undefined>(undefined);
  const [submissionCount, setSubmissionCount] = useState<number | undefined>(undefined);
  const pendingSave = useRef(false);
  const hydratedFor = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const now = Date.now();

  useEffect(() => { document.title = 'Your CalgaryWatch | Emails, plans & badges'; }, []);

  // Deep links from the account menu: ?edit=1 opens the editor, #id scrolls there once it exists.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || !profile) return;
    deepLinked.current = true;
    if (params.get('edit') === '1' && !readOnly) { setDraft(draftFrom(profile, pending)); setEditing(true); }
    const id = window.location.hash.slice(1);
    if (id) window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Hydrate the form from the profile once per account, keeping anything the
  // reader picked before signing in.
  useEffect(() => {
    if (!user || !profile || hydratedFor.current === user.uid) return;
    hydratedFor.current = user.uid;
    setDraft((local) => {
      const stored = draftFrom(profile, pending);
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

  // Pending opt-outs load after the profile; untick those boxes when they arrive (unless editing has begun).
  useEffect(() => {
    if (!pending.monday && !pending.thursday) return;
    setDraft((d) => ({ ...d, ...(pending.monday ? { weeklyDigestOptIn: false } : {}), ...(pending.thursday ? { eventsDigestOptIn: false } : {}) }));
  }, [pending.monday, pending.thursday]);

  useEffect(() => {
    if (!user || demo) { setReportCount(undefined); return; }
    // (In admin view, `user` is the member being viewed, so these are their counts.)
    let live = true;
    void readMyReportCount(user.uid).then((n) => { if (live) setReportCount(n); });
    void readMySubmissionCount(user.uid).then((n) => { if (live) setSubmissionCount(n); });
    return () => { live = false; };
  }, [user, demo]);

  // Set up = has a home area on file (the one thing every email needs).
  const hasPlans = Boolean(profile && (profile.piiConsentAt || profile.eventInterests.length));
  const showForm = !user || !profile || !hasPlans || editing;
  const dashboard = Boolean(user && profile && hasPlans);
  const area = profile ? homeAreaOf(profile) : '';
  const entities = discoveryRepository.list();
  const occurrences = discoveryRepository.occurrences();
  const interests = (showForm ? draft.interests : profile?.eventInterests) ?? [];
  const draftArea = (draft.neighborhood || draft.inferredNeighborhood).trim();
  const picks = useMemo(
    () => buildEventPicks({ entities, occurrences, interests, home: addressPoint, homeArea: area || draftArea, goingIds: mine.ids, days: 10, limit: 8 }),
    [entities, occurrences, interests, addressPoint, area, draftArea, mine.ids],
  );

  const goingKinds = useMemo(() => {
    const kinds = new Set<EventInterestId>();
    for (const e of entities) if (mine.ids.has(e.id)) interestsFor(e).filter((i) => i !== 'free').forEach((i) => kinds.add(i));
    return kinds.size;
  }, [entities, mine.ids]);

  const badgeInput = {
    createdAt: profile?.createdAt ?? null,
    hasHomeArea: Boolean(area),
    interestCount: profile?.eventInterests.length ?? 0,
    eventsDigestOptIn: profile?.eventsDigestOptIn === true,
    weeklyDigestOptIn: profile?.weeklyDigestOptIn === true,
    goingCount: mine.ids.size,
    goingInterestCount: goingKinds,
    reportCount,
    submissionCount,
  };
  const badges = orderBadges(computeBadges(badgeInput));
  const unlocked = badges.filter((b) => b.unlocked).length;

  // What saving this form would newly earn: the reward, shown before the ask.
  const unlocks = useMemo(() => {
    const before = new Set(computeBadges(badgeInput).filter((b) => b.unlocked).map((b) => b.id));
    const after = computeBadges({
      ...badgeInput,
      hasHomeArea: Boolean(draft.neighborhood.trim() || draft.address.trim()),
      interestCount: draft.interests.length,
      eventsDigestOptIn: draft.eventsDigestOptIn,
      weeklyDigestOptIn: draft.weeklyDigestOptIn,
      createdAt: profile?.createdAt ?? now,
    });
    return after.filter((b) => b.unlocked && !before.has(b.id)).map((b) => b.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, profile, mine.ids.size, reportCount, submissionCount]);

  // The live map's own snapshot (one cached read), filtered to near home.
  const pulse = useLivePulse(dashboard && !showForm);
  const homePoint = addressPoint ?? neighbourhoodPoint(area);
  const near = useMemo(() => nearHome(pulse.reports.recent ?? [], homePoint, area), [pulse.reports.recent, homePoint, area]);
  const nearReady = pulse.reports.status === 'ready' || pulse.reports.status === 'error';

  const steps = setupSteps({
    hasHomeArea: Boolean(area), weekly: profile?.weeklyDigestOptIn === true, events: profile?.eventsDigestOptIn === true,
    interestCount: profile?.eventInterests.length ?? 0, goingCount: mine.ids.size, reportCount, submissionCount,
  });
  const plan = emailPlan(profile?.weeklyDigestOptIn === true, profile?.eventsDigestOptIn === true, now);

  const hasArea = Boolean(draft.neighborhood.trim() || draft.address.trim());
  const needsConsent = hasArea && !profile?.piiConsentAt;
  const problem = !hasArea ? 'Add your neighbourhood or address, so everything starts near home.'
    : needsConsent && !draft.consent ? 'Tick the box so we can store your area.'
    : draft.eventsDigestOptIn && !draft.interests.length ? 'Pick at least one interest for your event picks, or untick that email.'
    : '';
  const progress = [hasArea && (!needsConsent || draft.consent), draft.weeklyDigestOptIn || draft.eventsDigestOptIn, draft.interests.length > 0];

  const openEditor = (focus?: 'interests' | 'home') => {
    setDraft(draftFrom(profile, pending));
    setEditing(true);
    requestAnimationFrame(() => {
      const target = focus === 'interests' ? document.getElementById('pl-step-interests') : formRef.current;
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const addEmail = async (which: 'monday' | 'thursday') => {
    if (!user || !profile) return;
    // Event picks need something to pick from: ask for interests first.
    if (which === 'thursday' && !profile.eventInterests.length) { openEditor('interests'); setDraft((d) => ({ ...d, eventsDigestOptIn: true })); return; }
    if (asUid) return;
    if (demo) { celebrateBadge(which === 'monday' ? 'monday-reader' : 'on-the-list'); return; }
    await setEmailOptIn(user, profile, which === 'monday' ? { weekly: true } : { events: true });
    setSavedAt(Date.now());
    celebrateBadge(which === 'monday' ? 'monday-reader' : 'on-the-list');
  };

  const actOnStep = async (id: SetupStepId) => {
    if (id === 'home') return openEditor('home');
    if (id === 'interests') return openEditor('interests');
    if (id === 'plan') { document.getElementById('pl-picks-title')?.scrollIntoView({ behavior: 'smooth' }); return; }
    if (id === 'share') { navigate('/submit'); return; }
    setBusy(id);
    try { await addEmail(id === 'monday' ? 'monday' : 'thursday'); } finally { setBusy(null); }
  };

  const save = async () => {
    if (asUid) { setError('Admin view is read-only. Members change their own settings.'); return; }
    const current = demo ? demo.user : auth?.currentUser;
    if (!current) { pendingSave.current = true; await signIn(); if (!auth?.currentUser) pendingSave.current = false; return; }
    if (problem) { setError(problem); return; }
    setSaving(true); setError('');
    try {
      const firstTime = !hasPlans;
      if (!demo) {
        let inferred = draft.inferredNeighborhood;
        if (draft.address.trim() && !inferred && !draft.neighborhood.trim()) inferred = await communityForAddress(draft.address).catch(() => '');
        await savePlans(current, profile, { ...draft, inferredNeighborhood: inferred });
      }
      setSavedAt(Date.now());
      if (firstTime && unlocks.length) { setJoined(unlocks); celebrateBadge(unlocks[0]); }
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

  const startForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => document.getElementById('su-hood')?.focus({ preventScroll: true }), 450);
  };

  const toggleInterest = (id: EventInterestId) => setDraft((d) => ({ ...d, interests: d.interests.includes(id) ? d.interests.filter((i) => i !== id) : [...d.interests, id] }));

  const q = draft.neighborhood.trim().toLowerCase();
  const suggestions = q.length >= 2 && !communities.some((c) => c.toLowerCase() === q)
    ? communities.filter((c) => c.toLowerCase().includes(q)).sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q))).slice(0, 6)
    : [];
  const first = (user?.displayName || '').split(' ')[0];
  const tunedLeft = Math.max(0, 3 - draft.interests.length);

  return (
    <SiteLayout>
      <div className="cw-plans" data-view={dashboard && !showForm ? 'home' : 'setup'}>
        {asUid ? (
          <div className="cw-wrap"><p className="pl-adminview" role="status"><Shield size={15} aria-hidden="true" /> <span><strong>Admin view.</strong> You’re seeing {profile?.displayName || 'this member'}’s dashboard as they see it. Read-only.</span> <Link to="/admin">Back to admin</Link></p></div>
        ) : null}
        {dashboard && !editing ? (
          <header className="cw-wrap pl-head pl-head-member">
            <PlansSkyHero
              greeting={`${partOfDay(now)}${first ? `, ${first}` : ''}.|Here’s your ${area || 'Calgary'}.`}
              area={area}
              after={joined ? (
                <div className="pl-joined" role="status">
                  <Sparkles size={20} aria-hidden="true" />
                  <div>
                    <strong>You’re in.</strong> {savedSummary(profile)}
                    <ul>{joined.map((id, i) => { const b = BADGES.find((x) => x.id === id)!; return <li key={id} style={{ animationDelay: `${0.25 + i * 0.12}s` }}><BadgeMark badge={{ ...b, unlocked: true }} size={30} /> {b.label}</li>; })}</ul>
                  </div>
                </div>
              ) : savedAt ? <p className="pl-saved" role="status"><Check size={16} aria-hidden="true" /> Saved. {savedSummary(profile)}</p> : null}
            >
              <Glance near={near.length} nearReady={nearReady} picks={picks.picks.length} going={picks.going} badges={unlocked} total={badges.length} />
            </PlansSkyHero>
          </header>
        ) : (
          <SignupHero
            editing={Boolean(user && hasPlans)}
            signedIn={Boolean(user)}
            area={draftArea}
            onStart={startForm}
            onSignIn={() => void signIn()}
          />
        )}

        <div className="cw-wrap pl-grid">
          <div className="pl-main">
            {dashboard && !showForm ? <SetupCard steps={steps} busy={busy} onAct={(id) => void actOnStep(id)} /> : null}
            {dashboard && !showForm ? (
              // On a phone the side column comes last, so the two cards people check most come up here instead.
              <div className="pl-narrow-only pl-narrow-cards">
                <EmailsCard plan={plan} area={area} busy={busy === 'monday' || busy === 'events'} onEdit={() => openEditor()} onAdd={(w) => void actOnStep(w === 'monday' ? 'monday' : 'events')} />
                <NearHomeCard reports={near} ready={nearReady} area={area} now={now} />
              </div>
            ) : null}

            {showForm ? (
              <SignupForm
                formRef={formRef}
                draft={draft}
                setDraft={setDraft}
                progress={progress}
                draftArea={draftArea}
                suggestions={suggestions}
                communityCount={communities.length}
                needsConsent={needsConsent}
                pending={pending}
                tunedLeft={tunedLeft}
                error={error}
                saving={saving}
                disabled={!demo && isAuthReady && !isFirebaseConfigured}
                signedIn={Boolean(user)}
                hasPlans={hasPlans}
                editing={editing}
                onCancel={() => { setEditing(false); setDraft(draftFrom(profile, pending)); setError(''); }}
                onSubmit={() => void save()}
                onToggleInterest={toggleInterest}
              />
            ) : null}

            {dashboard && !showForm ? <Reveal><GoingTimeline going={picks.going} /></Reveal> : null}

            <section className="pl-picks" aria-labelledby="pl-picks-title">
              <div className="pl-sec-head">
                <h2 id="pl-picks-title">{interests.length ? 'Picked for you' : 'On in Calgary'}<span> · next 10 days</span></h2>
                {!showForm ? <button type="button" className="pl-textbtn" onClick={() => openEditor()}><Pencil size={14} aria-hidden="true" /> Edit interests</button> : null}
              </div>
              {picks.picks.length ? (
                <ol className="pl-list">{picks.picks.map((p, i) => <PickRow key={p.key} item={p} signedIn={!!user} index={i} />)}</ol>
              ) : (
                <p className="pl-empty">{interests.length ? 'Nothing listed yet that matches. We only list events we’ve checked with the organizer, so some weeks are quieter. Try adding an interest.' : 'Pick a few interests above to see what fits.'}</p>
              )}
              <p className="pl-fine">{picks.considered} upcoming events and market dates considered. <Link to="/events">Browse everything</Link> · <Link to="/submit">Add one we’re missing</Link></p>
            </section>
          </div>

          <aside className="pl-side" aria-label={dashboard && !showForm ? 'Your profile' : 'Preview'}>
            {showForm ? (
              <SignupPreview
                name={first}
                area={draftArea}
                interests={draft.interests}
                weekly={draft.weeklyDigestOptIn}
                events={draft.eventsDigestOptIn}
                picks={picks.picks}
                unlocks={unlocks}
                now={now}
              />
            ) : (
              <>
                <div className="pl-card pl-mecard">
                  <div className="pl-me">
                    {user?.photoURL ? <img src={user.photoURL} alt="" width="52" height="52" referrerPolicy="no-referrer" /> : <span className="pl-avatar" aria-hidden="true">{(user?.displayName || 'C').slice(0, 1)}</span>}
                    <div>
                      <strong>{user?.displayName || 'Calgary neighbour'}</strong>
                      <span>{area ? <><MapPin size={13} aria-hidden="true" /> {area}</> : 'No home area yet'}</span>
                    </div>
                  </div>
                  <p className="pl-me-line">{setupPercent(steps) === 100 ? 'Fully set up' : `${setupPercent(steps)}% set up`} · {unlocked} badge{unlocked === 1 ? '' : 's'}</p>
                </div>
                <ListingsCard claims={myClaims ?? []} />
                <div className="pl-wide-only pl-side-cards">
                  <EmailsCard plan={plan} area={area} busy={busy === 'monday' || busy === 'events'} onEdit={() => openEditor()} onAdd={(w) => void actOnStep(w === 'monday' ? 'monday' : 'events')} />
                  <NearHomeCard reports={near} ready={nearReady} area={area} now={now} />
                </div>
              </>
            )}
            <BadgesCard badges={badges} signedIn={!!user && !showForm} />
            <p className="pl-fine pl-side-foot">Instant alerts and quiet hours live in the <Link to="/map?settings=alerts">live map’s settings</Link>.</p>
          </aside>
        </div>
      </div>
    </SiteLayout>
  );
}

function savedSummary(profile: PlansProfile | null): string {
  const plan = emailPlan(profile?.weeklyDigestOptIn === true, profile?.eventsDigestOptIn === true, Date.now());
  if (plan.kind === 'none' || !plan.next) return 'No emails for now; your picks and plans stay here.';
  const when = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', weekday: 'long', month: 'short', day: 'numeric' }).format(plan.next);
  return `Your first “${plan.name.replace(/^The /, '')}” email arrives ${when}, ${plan.cadence.split(', ')[1]}.`;
}

function PickRow({ item, signedIn, index = 0 }: { item: PickItem; signedIn: boolean; index?: number }) {
  const distance = pickDistance(item.distanceM);
  const labels = EVENT_INTERESTS.filter((i) => item.matched.includes(i.id)).map((i) => i.label);
  return (
    <li className="pl-row" style={{ ['--i' as string]: index }}>
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
