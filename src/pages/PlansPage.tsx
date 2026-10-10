import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Shield } from 'lucide-react';
import type { User } from 'firebase/auth';
import { SiteLayout } from '../components/site/SiteLayout';
import { useAuth } from '../components/FirebaseProvider';
import { useMyClaims } from '../lib/claimsApi';
import { SignupForm, SignupSky } from '../components/plans/SignupFlow';
import { MemberDashboard } from '../components/plans/Dashboard';
import { celebrateBadge } from '../components/plans/BadgeToast';
import { discoveryRepository } from '../data/discovery';
import { NEIGHBOURHOOD_COORDS } from '../data/neighbourhoodCoords';
import { computeBadges, orderBadges, type BadgeId } from '../lib/badges';
import { emailPlan, nearHome, setupSteps, type SetupStepId } from '../lib/memberHome';
import { useLivePulse } from '../hooks/useLivePulse';
import { fetchCommunityBoundaries, findCommunityAt } from '../lib/communityLookup';
import { buildEventPicks, normalizeInterests, neighbourhoodPoint, interestsFor, type EventInterestId } from '../lib/eventPicks';
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
  const [step, setStep] = useState(0);
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
    if (id === 'emails') setStep(1); else if (id === 'pl-step-interests') setStep(2);
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
    setStep(focus === 'interests' ? 2 : 0);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
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
      setStep(0);
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
  const first = (user?.displayName || '').split(' ')[0];

  if (dashboard && !showForm && user) {
    const images = new Map(entities.map((e) => [e.id, e.image?.src]));
    return (
      <SiteLayout>
        <MemberDashboard
          user={user} first={first} area={area} now={now}
          picks={picks.picks} going={picks.going} considered={picks.considered} imageFor={(id) => images.get(id)}
          near={near} nearReady={nearReady} badges={badges} steps={steps} plan={plan} claims={myClaims ?? []}
          busy={busy} onAct={(id) => void actOnStep(id)} onEdit={openEditor}
          adminView={asUid ? profile?.displayName ?? '' : null}
          notice={joined ? { joined, text: savedSummary(profile) } : savedAt ? { joined: null, text: savedSummary(profile) } : null}
        />
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <div className="cw-plans cw-home2" data-view="setup">
        {asUid ? (
          <div className="cw-wrap"><p className="pl-adminview" role="status"><Shield size={15} aria-hidden="true" /> <span><strong>Admin view.</strong> You’re seeing {profile?.displayName || 'this member'}’s dashboard as they see it. Read-only.</span> <Link to="/admin">Back to admin</Link></p></div>
        ) : null}
        <SignupSky editing={Boolean(user && hasPlans)} signedIn={Boolean(user)} area={draftArea} onSignIn={() => void signIn()} />
        <div className="cw-wrap su-sill">
          <SignupForm
              formRef={formRef}
              step={step}
              setStep={setStep}
              draft={draft}
              setDraft={setDraft}
              progress={progress}
              suggestions={suggestions}
              communityCount={communities.length}
              needsConsent={needsConsent}
              pending={pending}
              error={error}
              setError={setError}
              saving={saving}
              disabled={!demo && isAuthReady && !isFirebaseConfigured}
              signedIn={Boolean(user)}
              hasPlans={hasPlans}
              editing={editing}
              onCancel={() => { setEditing(false); setStep(0); setDraft(draftFrom(profile, pending)); setError(''); }}
              onSubmit={() => void save()}
              area={draftArea}
              onToggleInterest={toggleInterest}
            />
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
