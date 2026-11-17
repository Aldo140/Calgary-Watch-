import { artworkRequestUrl } from "../lib/artworkRequest";
import {
  importOrganizationProgramme,
  ORGANIZATION_CSV_TEMPLATE,
} from "../lib/organizationProgrammeImport";
import { claimPresentation } from "../lib/claimPresentation";
import "../styles/profile-category.css";
import {
  MANAGEMENT_PROFILES,
  approvedManagementOrganization,
  managementOrganizationById,
  standaloneOrganization,
  type ManagementOrganization,
} from "../lib/claimOrganization";
import { AdminAccessBar } from "../components/admin/AdminAccessBar";
import { useAdminEditMode } from "../hooks/useAdminEditMode";
import {
  adminEditableFields,
  adminListingPatch,
} from "../lib/adminListingEdits";
import {
  AdminGalleryEditor,
  AdminImageEditor,
} from "../components/entity/AdminImageEditor";
import { useOrganizationDraftPersistence } from "../hooks/useOrganizationDraftPersistence";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../components/FirebaseProvider";
import { SiteLayout } from "../components/site/SiteLayout";
import { useMyClaims } from "../lib/claimsApi";
import { discoveryRepository } from "../data/discovery";
import {
  organizationLiveRows,
  useOrganizationLive,
} from "../lib/organizationLive";
import {
  MAX_ORGANIZATION_CHANGES,
  approvedOrganization,
  organizationEvent,
  ORGANIZATION_CATALOG,
  ORGANIZATION_LIVE,
  ORGANIZATION_SUBMISSIONS,
  prepareOrganizationBatch,
  mergeOrganizationContent,
  type OrganizationChange,
  type OrganizationProjection,
} from "../lib/organizationWorkspace";
import {
  OWNER_BUSINESS_LIMITS,
  OWNER_EDITS_PER_WEEK,
  ownerAllowanceNextAt,
  ownerEditableFields,
  ownerSubmissionTimes,
  ownerUpdatesLeft,
  parseOwnerField,
} from "../lib/ownerListingEdits";
import { OwnerFieldEditor } from "../components/entity/OwnerFieldEditor";
import { OwnerProfilePreview } from "../components/entity/OwnerProfilePreview";
import { OwnerEventPreview } from "../components/entity/OwnerEventPreview";
import {
  EVENT_SECTIONS,
  EXTRA_FIELDS,
  PROFILE_STEPS,
  profileProgress,
  fieldLabel,
  fieldProblem,
  friendlyValue,
  stepDone,
} from "../lib/ownerProfileGuide";
import { entityPath } from "../lib/discovery";
import { calgaryDateTimeFormat } from "../lib/calgaryTz";
import { firestoreActionError } from "../lib/firestoreErrors";
import {
  filterOrganizationProgramme,
  mergeOrganizationRows,
  organizationListingState,
  organizationSchedule,
} from "../lib/organizationPresentation";
import type { Business } from "../types/discovery";
import "../styles/plans.css";
import "../styles/claim.css";
import "../styles/organization.css";
const text = (field: string, value: unknown) =>
  value === undefined
    ? ""
    : ["hours", "socials", "coordinates", "priceRange", "occurrences"].includes(
          field,
        )
      ? JSON.stringify(value)
      : Array.isArray(value)
        ? value.join(", ")
        : String(value);
const dateFormatter = calgaryDateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
});
const fmt = (at: number) => dateFormatter.format(new Date(at));
/**
 * Development only: `/organization/<business id>?demo=owner` renders the owner
 * workspace without Firebase. `&locked=1` shows the weekly wait, `&updated=1`
 * a recent publish. The draft lives in this browser like a real one.
 */
function useOwnerDemo(id: string, params: URLSearchParams) {
  const mode = import.meta.env.DEV ? params.get("demo") : null;
  return useMemo(() => {
    if (!mode) return null;
    const org = managementOrganizationById(id, discoveryRepository.list());
    if (!org) return null;
    const now = Date.now();
    return {
      key: `${id}:${params.toString()}`,
      org,
      state: {
        nextAt: params.get("locked") ? now + 4 * 86400000 : 0,
        lastUpdated: params.get("updated") ? now - 2 * 86400000 : undefined,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, id]);
}
const UNVERIFIED_PUBLISH =
  "One quick step before you publish: confirm your email address. We’ve opened it for you. Your changes stay saved here, so just come back and press Review & publish again.";
export default function OrganizationPage() {
  const { id = "" } = useParams(),
    [params] = useSearchParams(),
    { user, isAdmin, signIn } = useAuth();
  const demo = useOwnerDemo(id, params);
  const previewUid = isAdmin ? params.get("as") || undefined : undefined,
    uid = previewUid ?? user?.uid;
  const adminMode = useAdminEditMode(isAdmin, `${user?.uid}:${uid}:${id}`);
  const claims = useMyClaims(uid),
    live = useOrganizationLive();
  const approved = claims?.find(
    (c) =>
      approvedManagementOrganization(c, discoveryRepository.list())?.id === id,
  );
  const [savedProfile, setSavedProfile] = useState<{
    id: string;
    profile?: ManagementOrganization;
    error?: string;
  }>({ id: "" });
  useEffect(() => {
    let active = true;
    if (
      !id.startsWith("org-") ||
      !user ||
      !db ||
      managementOrganizationById(id, discoveryRepository.list())
    )
      return;
    void Promise.all([
      getDoc(doc(db, MANAGEMENT_PROFILES, id.slice(4))),
      getDoc(doc(db, ORGANIZATION_CATALOG, id.slice(4))),
    ])
      .then(([snapshot, source]) => {
        const listing = source.data()?.entity;
        if (active)
          setSavedProfile({
            id,
            profile:
              snapshot.data()?.entity ??
              (listing &&
              (listing.kind === "event" || listing.kind === "market")
                ? standaloneOrganization(listing)
                : undefined),
          });
      })
      .catch(() => {
        if (active)
          setSavedProfile({
            id,
            error:
              "Saved organization details could not be loaded. Try again or contact aldo@calgarywatch.ca.",
          });
      });
    return () => {
      active = false;
    };
  }, [id, user?.uid]);
  const org =
    (savedProfile.id === id ? savedProfile.profile : undefined) ??
    managementOrganizationById(id, discoveryRepository.list());
  const allowed =
    approved ||
    claims?.find(
      (c) =>
        c.status === "approved" &&
        org?.managementOnly &&
        c.entityId === org.sourceListingId &&
        !c.approvedOrganizationId,
    );

  if (demo)
    return (
      <SiteLayout>
        <main className="cw-wrap cl-page">
          <OrganizationWorkspace
            key={demo.key}
            org={demo.org}
            uid="demo"
            readOnly={false}
            liveVersion={0}
            ownerName="Paul Demo"
            demo={demo.state}
          />
        </main>
      </SiteLayout>
    );
  return (
    <SiteLayout>
      <main className="cw-wrap cl-page">
        <Link
          to={
            previewUid
              ? `/plans?as=${encodeURIComponent(previewUid)}`
              : "/plans"
          }
        >
          ← Back to dashboard
        </Link>
        {!user ? (
          <button
            className="pl-btn"
            onClick={() =>
              void signIn({
                mode: "signin",
                verify: true,
                title: "Manage your organization.",
                intro:
                  "Sign in with the account you used to claim it. New to CalgaryWatch? Claim your listing first.",
              })
            }
          >
            Sign in to manage your organization
          </button>
        ) : !claims && !isAdmin ? (
          <p role="status">Checking organization access…</p>
        ) : !org && id.startsWith("org-") && savedProfile.id !== id ? (
          <p role="status">Loading your organization workspace…</p>
        ) : !org ? (
          <p>
            {savedProfile.error ??
              "Organization profile unavailable. Contact aldo@calgarywatch.ca."}
          </p>
        ) : !allowed && !isAdmin ? (
          <>
            <h1>{org.title}</h1>
            <p>
              Your account does not have confirmed organization management
              access. An event claim alone does not grant access to the entire
              organization. Ask CalgaryWatch to confirm your organization
              access.
            </p>
          </>
        ) : (
          <OrganizationWorkspace
            key={`${uid}:${id}:${adminMode.enabled}`}
            org={org}
            uid={uid!}
            readOnly={isAdmin ? !adminMode.enabled : Boolean(previewUid)}
            liveVersion={live.version}
            adminEdit={adminMode.enabled}
            adminUserId={isAdmin ? user?.uid : undefined}
            onAdminEditChange={adminMode.setEnabled}
            ownerName={previewUid ? undefined : (user?.displayName ?? undefined)}
          />
        )}
      </main>
    </SiteLayout>
  );
}
export function OrganizationWorkspace({
  org,
  uid,
  readOnly,
  liveVersion,
  adminEdit = false,
  adminUserId,
  onAdminEditChange,
  ownerName,
  demo,
}: {
  org: ManagementOrganization;
  uid: string;
  readOnly: boolean;
  liveVersion: number;
  adminEdit?: boolean;
  adminUserId?: string;
  onAdminEditChange?: (enabled: boolean) => void;
  /** The signed-in owner's name, for a friendly greeting. */
  ownerName?: string;
  /** Development only: render without Firebase (see the page's `?demo=`). */
  demo?: { nextAt?: number; lastUpdated?: number };
}) {
  const { isEmailVerified, openVerification } = useAuth();
  const key = `organization-draft:${adminUserId ? `admin:${adminUserId}:${uid}` : uid}:${org.id}`;
  const [ops, setOps] = useState<OrganizationChange[]>(() => {
    if (readOnly) return [];
    try {
      const v = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  });
  const [shown, setShown] = useState(24),
    [clock, setClock] = useState(Date.now);
  const [loadingError, setLoadingError] = useState("");
  const [catalog, setCatalog] = useState<
    import("../types/discovery").DiscoveryEntity[]
  >([]);
  const [linkParams] = useSearchParams();
  const [view, setView] = useState<"profile" | "events" | "editor" | "draft">(
    () =>
      linkParams.get("view") === "events" || linkParams.get("add") === "event"
        ? "events"
        : org.managementOnly
          ? "events"
          : "profile",
  );
  const [eventQuery, setEventQuery] = useState(""),
    [eventFilter, setEventFilter] = useState(
      org.managementOnly ? "all" : "upcoming",
    ),
    [reload, setReload] = useState(0);
  const deferredQuery = useDeferredValue(eventQuery);
  useEffect(() => setShown(24), [eventQuery, eventFilter]);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const visible = () => {
      if (timer) clearInterval(timer);
      if (!document.hidden) {
        setClock(Date.now());
        timer = setInterval(() => setClock(Date.now()), 60000);
      }
    };
    visible();
    document.addEventListener("visibilitychange", visible);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  const [targetId, setTargetId] = useState(org.id),
    [rows, setRows] = useState<OrganizationProjection[]>([]),
    [serverNextAt, setNextAt] = useState(0),
    [sentAt, setSentAt] = useState<number[]>([]),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [step, setStep] = useState(() =>
      Math.max(0, PROFILE_STEPS.findIndex((s) => s.id === linkParams.get("step"))),
    ),
    [pane, setPane] = useState<"edit" | "preview">("edit"),
    [published, setPublished] = useState<{ at: number; next: number }>(),
    [copied, setCopied] = useState(false),
    [queued, setQueued] = useState<{ id: string; at: number }>();
  // Up to OWNER_EDITS_PER_WEEK publishes in any rolling seven days.
  const nextAt = Math.max(serverNextAt, ownerAllowanceNextAt(sentAt, clock)),
    updatesLeft = ownerUpdatesLeft(sentAt, clock);
  const [initialRequest] = useState<string | undefined>(() => {
    if (readOnly) return undefined;
    try {
      return localStorage.getItem(key + ":request") || undefined;
    } catch {
      return undefined;
    }
  });
  const request = useRef(initialRequest);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (review) dialog.current?.showModal();
    else dialog.current?.close();
  }, [review]);
  useOrganizationDraftPersistence(key, readOnly, ops, request, setError);
  // A publish sent earlier (this visit or a previous one) that is still waiting.
  useEffect(() => {
    if (!db || demo || readOnly || !initialRequest) return;
    getDoc(doc(db, ORGANIZATION_SUBMISSIONS, initialRequest))
      .then((snap) => {
        if (snap.exists()) setQueued({ id: initialRequest, at: Date.now() });
      })
      .catch(() => undefined);
  }, [initialRequest, demo, readOnly]);
  useEffect(() => {
    if (!db || !queued) return;
    return onSnapshot(
      doc(db, ORGANIZATION_SUBMISSIONS, queued.id),
      (snap) => {
        const status = snap.get("status");
        if (status === "published") {
          const at = Number(snap.get("publishedAt")) || Date.now();
          if (!adminEdit) setSentAt((current) => [...current, at]);
          setNextAt(Number(snap.get("nextAt")) || 0);
          setOps([]);
          setQueued(undefined);
          request.current = undefined;
          try {
            localStorage.removeItem(key + ":request");
          } catch {
            /* nothing stored */
          }
          setPublished({ at, next: Number(snap.get("nextAt")) || 0 });
          setReload((n) => n + 1);
          setNotice(
            adminEdit
              ? "Admin changes are live and recorded under your account. The business’s weekly allowance was not used."
              : "",
          );
        } else if (status === "failed") {
          setQueued(undefined);
          request.current = undefined;
          try {
            localStorage.removeItem(key + ":request");
          } catch {
            /* nothing stored */
          }
          setError(
            `${snap.get("error") || "Your changes could not be published."} Your changes are still saved here. If it keeps happening, email aldo@calgarywatch.ca and we'll publish them for you.`,
          );
        }
      },
      () => undefined,
    );
  }, [queued?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let active = true;
    if (demo) {
      setNextAt(demo.nextAt ?? 0);
      setLoaded(true);
      return;
    }
    if (!db) return;
    setLoaded(false);
    setLoadingError("");
    void Promise.all([
      getDoc(doc(db, OWNER_BUSINESS_LIMITS, org.allowanceId ?? org.id)),
      getDocs(
        query(
          collection(db, ORGANIZATION_LIVE),
          where("organizationId", "==", org.id),
          limit(250),
        ),
      ),
      getDocs(
        query(
          collection(db, ORGANIZATION_CATALOG),
          where("entity.organizerEntityId", "==", org.id),
          limit(250),
        ),
      ),
      getDoc(
        doc(
          db,
          org.managementOnly ? MANAGEMENT_PROFILES : ORGANIZATION_CATALOG,
          org.sourceListingId ?? org.id,
        ),
      ),
      ...(org.sourceListingId
        ? [
            getDoc(doc(db, ORGANIZATION_LIVE, org.sourceListingId)),
            getDoc(doc(db, ORGANIZATION_CATALOG, org.sourceListingId)),
          ]
        : []),
    ])
      .then(([rate, content, linked, profile, sourceLive, sourceCatalog]) => {
        if (active) {
          setSentAt((current) => [...current, ...ownerSubmissionTimes(rate.data())]);
          setCatalog([
            ...(sourceCatalog?.exists() ? [sourceCatalog.data().entity] : []),
            ...(profile.exists() ? [profile.data().entity] : []),
            ...linked.docs.map((d) => ({
              ...d.data().entity,
              ...(d.data().entity.kind === "market"
                ? {
                    occurrences: (d.data().occurrences ?? []).map(
                      ({ id, start, end, cancelled }: any) => ({
                        id,
                        start,
                        end,
                        cancelled,
                      }),
                    ),
                  }
                : {}),
            })),
          ]);
          setRows((current) =>
            mergeOrganizationRows(current, [
              ...content.docs.map((d) => d.data() as OrganizationProjection),
              ...(sourceLive?.exists()
                ? [sourceLive.data() as OrganizationProjection]
                : []),
            ]),
          );
          setLoaded(true);
          if (linked.size === 250 || content.size === 250)
            setError(
              "Showing up to 250 saved events. Contact CalgaryWatch if an older event is missing.",
            );
        }
      })
      .catch((e) => {
        if (active) setLoadingError(firestoreActionError(e));
      });
    return () => {
      active = false;
    };
  }, [org.id, reload]);
  useEffect(() => {
    const incoming = organizationLiveRows(org.id);
    if (!incoming.length) return;
    setRows((current) => mergeOrganizationRows(current, incoming));
    setSentAt((current) => [
      ...current,
      ...incoming
        .filter((row) => !row.submittedByAdmin)
        .map((row) => row.updatedAt)
        .filter((t): t is number => typeof t === "number"),
    ]);
  }, [org.id, liveVersion]);
  const entities = useMemo(
    () =>
      mergeOrganizationContent(
        [
          ...new Map(
            [...discoveryRepository.list(), org, ...catalog].map((e) => [
              e.id,
              e,
            ]),
          ).values(),
        ],
        rows.map((r) => ({ ...r, deleted: false })),
      ),
    [rows, catalog, org],
  );
  const events = useMemo(
    () =>
      entities.filter(
        (e) =>
          (e.kind === "event" || e.kind === "market") &&
          (e.organizerEntityId === org.id || e.id === org.sourceListingId),
      ),
    [entities, org.id],
  );
  const added = useMemo(
    () =>
      ops
        .filter((o) => o.action === "add")
        .map((o) => ({
          ...organizationEvent(org, o.entityId, Date.now()),
          ...o.changes,
        })),
    [ops, org],
  );
  const targets = [
    entities.find((e) => e.id === org.id) ?? org,
    ...events,
    ...added,
  ];
  const target = targets.find((e) => e.id === targetId),
    op = ops.find((o) => o.entityId === targetId);
  useEffect(() => {
    const remaining = nextAt - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.min(remaining + 20, 2147483647),
    );
    return () => clearTimeout(timer);
  }, [nextAt]);
  const locked = !adminEdit && nextAt > Math.max(clock, Date.now()),
    disabled = readOnly || busy || review || Boolean(queued);
  function update(field: string, value: string) {
    if (disabled || !target) return;
    request.current = undefined;
    setError("");
    try {
      const parsed = parseOwnerField(field, value);
      setOps((current) => {
        const existing = current.find((o) => o.entityId === targetId);
        const changes = { ...existing?.changes, [field]: parsed };
        if (
          existing?.action !== "add" &&
          text(field, parsed) ===
            text(field, (target as unknown as Record<string, unknown>)[field])
        )
          delete changes[field];
        const rest = current.filter((o) => o.entityId !== targetId);
        return Object.keys(changes).length || existing?.action === "add"
          ? [
              ...rest,
              {
                entityId: targetId,
                action: existing?.action === "add" ? "add" : "edit",
                changes,
              },
            ]
          : rest;
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  /** The first change that would be refused, so we can take the owner straight to it. */
  function firstProblem() {
    for (const o of ops) {
      if (o.action === "delete") continue;
      const entity = targets.find((t) => t.id === o.entityId);
      if (!entity) continue;
      if (o.action === "add")
        for (const field of ["title", "start", "end", "address"])
          if (!String(o.changes[field] ?? "").trim())
            return {
              entityId: o.entityId,
              field,
              problem: "Fill this in before publishing.",
            };
      for (const [field, value] of Object.entries(o.changes)) {
        if (["image", "images"].includes(field)) continue;
        const problem = fieldProblem(entity, field, value);
        if (problem) return { entityId: o.entityId, field, problem };
      }
    }
    return undefined;
  }
  function beginReview() {
    // The publish service only accepts confirmed emails. Say so up front
    // instead of letting "Publish now" fail behind the dialog.
    if (!demo && !adminEdit && !isEmailVerified) {
      setError(UNVERIFIED_PUBLISH);
      openVerification();
      return;
    }
    try {
      prepareOrganizationBatch(org, entities, ops, Date.now(), adminEdit);
      setError("");
      setPublished(undefined);
      setReview(true);
    } catch (e) {
      const found = firstProblem();
      if (found) {
        setTargetId(found.entityId);
        if (found.entityId === org.id) {
          setView("profile");
          const at = PROFILE_STEPS.findIndex((s) => s.fields.includes(found.field));
          if (at >= 0) setStep(at);
          setPane("edit");
        } else setView("editor");
        const kind = targets.find((t) => t.id === found.entityId)?.kind;
        setError(
          `One thing needs a quick look before you publish: ${fieldLabel(found.field, kind)}${found.entityId === org.id ? "" : ` on “${String(targets.find((t) => t.id === found.entityId)?.title || "your new event")}”`}. ${found.problem}`,
        );
      } else setError((e as Error).message);
    }
  }
  async function submit() {
    if (readOnly || busy || (!db && !demo)) return;
    setBusy(true);
    setError("");
    if (demo) {
      const at = Date.now();
      setSentAt((current) => [...current, at]);
      setOps([]);
      setReview(false);
      setPublished({ at, next: ownerAllowanceNextAt([...sentAt, at], at) });
      setBusy(false);
      return;
    }
    try {
      request.current ??= crypto.randomUUID();
      try {
        localStorage.setItem(key + ":request", request.current);
      } catch {
        /* Current-session retries still preserve the request identifier. */
      }
      // Publishing is queued in Firestore and applied by the owner-updates
      // workflow (every 15 minutes) with the same claim and allowance checks.
      const ref = doc(db!, ORGANIZATION_SUBMISSIONS, request.current);
      const existing = await getDoc(ref).catch(() => undefined);
      if (!existing?.exists())
        await setDoc(ref, {
          uid: adminEdit && adminUserId ? adminUserId : uid,
          organizationId: org.id,
          operations: ops,
          adminEdit: Boolean(adminEdit),
          ...(adminEdit && uid ? { subjectUid: uid } : {}),
          status: "queued",
          createdAt: serverTimestamp(),
        });
      setReview(false);
      setQueued({ id: request.current, at: Date.now() });
      return;
      request.current = undefined;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "functions/unauthenticated") {
        setReview(false);
        setError(UNVERIFIED_PUBLISH);
        openVerification();
        return;
      }
      setError(
        code === "functions/not-found" || code === "functions/unavailable"
          ? "Organization publishing is temporarily unavailable. Your draft is saved on this device. Please try again later or email aldo@calgarywatch.ca."
          : `${firestoreActionError(e, true)} Your changes are still saved here, so nothing is lost. If it keeps happening, email aldo@calgarywatch.ca and we'll publish them for you.`,
      );
    } finally {
      setBusy(false);
    }
  }
  const deleted = useMemo(
    () => new Set(rows.filter((r) => r.deleted).map((r) => r.entityId)),
    [rows],
  );
  const publicProfile =
    (entities.find((e) => e.id === org.id && e.kind === "business") as
      | Business
      | undefined) ?? org;
  const presentation = claimPresentation(publicProfile);
  const filteredEvents = useMemo(
    () =>
      filterOrganizationProgramme(
        events,
        deleted,
        eventFilter,
        deferredQuery,
        clock,
      ),
    [events, deleted, eventFilter, deferredQuery, clock],
  );
  const profileOp = ops.find((o) => o.entityId === org.id);
  const draftProfile = {
    ...publicProfile,
    ...(profileOp?.changes ?? {}),
  } as Business;
  const changedProfile = new Set(Object.keys(profileOp?.changes ?? {}));
  const lastUpdated =
    demo?.lastUpdated ??
    rows
      .filter((r) => r.entityId === org.id || r.organizationId === org.id)
      .reduce((max, r) => Math.max(max, r.updatedAt ?? 0), 0);
  const dayFormat = calgaryDateTimeFormat("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const day = (at: number) => dayFormat.format(new Date(at));
  const firstName = ownerName?.trim().split(/\s+/)[0];
  const studio =
    view === "profile" &&
    !org.managementOnly &&
    !adminEdit &&
    target?.id === org.id &&
    target.kind === "business";
  const current = PROFILE_STEPS[step];
  const problemFor = (field: string) => {
    if (!target || !op || op.action === "delete") return undefined;
    const value = op.changes[field];
    if (value === undefined || (op.action === "add" && value === "")) return undefined;
    return fieldProblem(target, field, value);
  };
  const valueFor = (field: string) =>
    text(
      field,
      op?.changes[field] ??
        (field === "occurrences"
          ? (
              rows.find((r) => r.entityId === target!.id)?.occurrences ??
              discoveryRepository
                .occurrences()
                .filter((o) => o.marketId === target!.id)
            ).map(({ id, start, end, cancelled }) => ({
              id,
              start,
              end,
              cancelled,
            }))
          : (target as unknown as Record<string, unknown>)[field]),
    );
  /** Required fields still empty on a new event, flagged once the owner tries to publish. */
  const missing = new Set(
    op?.action === "add" && error
      ? ["title", "start", "end", "address"].filter(
          (f) => !String(op.changes[f] ?? "").trim(),
        )
      : [],
  );
  const progress = profileProgress(
    draftProfile as unknown as Record<string, unknown>,
  );
  const eventEditor =
    view === "editor" &&
    !adminEdit &&
    target?.kind === "event" &&
    op?.action !== "delete";
  const editorFor = (field: string) => (
    <OwnerFieldEditor
      key={`${target!.id}:${field}`}
      field={field}
      value={valueFor(field)}
      disabled={disabled}
      changed={op?.action === "edit" && op.changes[field] !== undefined}
      problem={
        problemFor(field) ??
        (missing.has(field) ? "Fill this in before publishing." : undefined)
      }
      kind={target!.kind}
      onChange={(v) => {
        update(field, v);
        // A start with no sensible end gets a two-hour end the owner can change.
        if (field === "start" && target!.kind === "event") {
          const end = Date.parse(String(op?.changes.end ?? (target as { end?: string }).end ?? ""));
          const start = Date.parse(v);
          if (Number.isFinite(start) && (!Number.isFinite(end) || end <= start))
            update("end", new Date(start + 2 * 3600000).toISOString());
        }
      }}
    />
  );
  function addEvent() {
    const entityId = `${org.id}-event-${crypto.randomUUID()}`;
    setOps((v) => [
      ...v,
      {
        entityId,
        action: "add",
        changes: { title: "", address: org.address, pricing: "unknown" },
      },
    ]);
    setTargetId(entityId);
    setView("editor");
    setPane("edit");
    request.current = undefined;
  }
  // `?step=hours` (from the dashboard or claim page) lands on that step, not the top of the page.
  useEffect(() => {
    if (!linkParams.get("step") || !loaded) return;
    document.querySelector(".ow-progress, .ow-steps")?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
  // `?add=event` (from the dashboard) opens a fresh event once the workspace is ready.
  const addedFromLink = useRef(false);
  useEffect(() => {
    if (
      addedFromLink.current ||
      linkParams.get("add") !== "event" ||
      readOnly ||
      !loaded ||
      org.kind !== "business"
    )
      return;
    addedFromLink.current = true;
    if (!ops.some((o) => o.action === "add" && !o.changes.start)) addEvent();
    else {
      const open = ops.find((o) => o.action === "add" && !o.changes.start)!;
      setTargetId(open.entityId);
      setView("editor");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
  const publicLink = `https://calgarywatch.ca${entityPath(org)}`;
  const changeCount = ops.reduce(
    (n, o) => n + (o.action === "edit" ? Object.keys(o.changes).length : 1),
    0,
  );
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return (
    <section
      className="pl-form cl-form organization-workspace ow"
      data-profile-category={presentation.key}
    >
      <header className="organization-hero ow-hero">
        <p className="pl-eyebrow">
          {firstName ? `Hi ${firstName}, welcome back` : "Your page on CalgaryWatch"}
        </p>
        <h1 className="cl-title">
          {(entities.find((e) => e.id === org.id) ?? org).title}
        </h1>
        <div
          className="ow-status"
          role="status"
          data-state={
            published ? "live" : ops.length ? "draft" : "live"
          }
        >
          <span className="ow-dot" aria-hidden="true" />
          <span>
            <strong>
              {published
                ? "Your changes are live"
                : ops.length
                  ? `${plural(changeCount, "change")} not published yet`
                  : org.managementOnly
                    ? "Your listing is live"
                    : "Your page is live"}
            </strong>
            <small>
              {published
                ? `Published ${fmt(published.at)}`.replace(/\.?$/, ".")
                : ops.length
                  ? "Saved on this device as you type. Visitors see them once you publish."
                  : lastUpdated
                    ? `Last updated ${fmt(lastUpdated)}`.replace(/\.?$/, ".")
                    : "Showing the details we have on file. Anything missing? Add it below."}
              {loaded && locked && !adminEdit
                ? ` You can publish again on ${day(nextAt)}.`
                : ""}
            </small>
          </span>
        </div>
        {!org.managementOnly ||
        discoveryRepository.list().some((e) => e.id === org.sourceListingId) ? (
          <Link
            className="ow-hero-link"
            to={entityPath(
              org.sourceListingId
                ? discoveryRepository
                    .list()
                    .find((e) => e.id === org.sourceListingId)!
                : org,
            )}
          >
            {org.managementOnly ? "View your public listing" : "View your page"} ↗
          </Link>
        ) : (
          <p>
            The original listing is currently removed. Its management workspace
            and history remain available.
          </p>
        )}
      </header>
      {adminUserId && onAdminEditChange ? (
        <AdminAccessBar
          enabled={adminEdit}
          onChange={onAdminEditChange}
          busy={busy || review}
          subject={org.title}
        />
      ) : null}
      {readOnly && !adminUserId ? (
        <p className="pl-adminview" role="status">
          Admin preview — read-only. This is this member’s organization
          workspace.
        </p>
      ) : null}
      {queued ? (
        <section className="ow-success" aria-labelledby="ow-queued" role="status">
          <h2 id="ow-queued">Sent! Going live shortly</h2>
          <p>
            Your changes are on their way. They go live on your page within
            about 15 minutes, with no approval needed. You can close this page;
            we’ll finish it for you.
          </p>
        </section>
      ) : null}
      {published && !adminEdit ? (
        <section className="ow-success" aria-labelledby="ow-success">
          <h2 id="ow-success">You’re live! 🎉</h2>
          <p>
            Your changes are on your page now. Nobody needs to approve them.
            Thanks for keeping your page fresh.
          </p>
          <div className="ow-success-acts">
            <Link className="pl-btn" to={entityPath(org)}>
              See your page
            </Link>
            <button
              type="button"
              className="pl-btn ow-btn-ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(publicLink);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2500);
                } catch {
                  /* clipboard blocked */
                }
              }}
            >
              {copied ? "Link copied" : "Copy your page link"}
            </button>
          </div>
          <p className="ow-small">
            Your next update opens {day(published.next)}. Need a change before
            then? Just email{" "}
            <a href="mailto:aldo@calgarywatch.ca">aldo@calgarywatch.ca</a> and
            we’ll make it for you.
          </p>
          <button
            type="button"
            className="pl-textbtn"
            onClick={() => setPublished(undefined)}
          >
            Close
          </button>
        </section>
      ) : null}
      {!ops.length && !published && !readOnly && !org.managementOnly ? (
        <ol className="ow-how" aria-label="How updating your page works">
          <li>
            <strong>Edit</strong>
            <span>Change anything below. It saves on this device as you type.</span>
          </li>
          <li>
            <strong>Preview</strong>
            <span>See exactly how your page will look before anyone else does.</span>
          </li>
          <li>
            <strong>Publish</strong>
            <span>It goes live right away. No approval needed. Up to {OWNER_EDITS_PER_WEEK} times a week.</span>
          </li>
        </ol>
      ) : null}

      {error ? (
        <p role="alert" className="pl-error">
          {error}
        </p>
      ) : null}
      {loadingError ? (
        <div role="alert" className="pl-error">
          {loadingError}{" "}
          <button
            className="pl-textbtn"
            disabled={busy}
            onClick={() => {
              setError("");
              setReload((n) => n + 1);
            }}
          >
            Try loading again
          </button>
        </div>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {!loaded ? (
        <p role="status">Loading your page…</p>
      ) : null}
      <nav className="organization-actions ow-tabs" aria-label="Workspace sections">
        <button
          className="pl-btn"
          aria-pressed={view === "profile"}
          disabled={busy || review}
          onClick={() => {
            setTargetId(org.id);
            setView("profile");
          }}
        >
          {org.managementOnly ? "Organizer details" : "Your page"}
        </button>
        <button
          className="pl-btn"
          aria-pressed={view === "events" || view === "editor"}
          disabled={busy || review}
          onClick={() => setView("events")}
        >
          {org.managementOnly ? "Your listings" : "Events"} ({events.length})
        </button>
        <button
          className="pl-btn"
          aria-pressed={view === "draft"}
          disabled={busy || review}
          onClick={() => setView("draft")}
        >
          Changes{ops.length ? ` (${changeCount})` : ""}
        </button>
      </nav>
      {studio ? (
        <div className="ow-studio">
          {progress.next ? (
            <div className="ow-progress">
              <span
                className="ow-progress-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                aria-label="Page sections filled in"
              >
                <i style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </span>
              <span>
                <strong>
                  {progress.done} of {progress.total} sections done.
                </strong>{" "}
                Next: {progress.next.ask.toLowerCase()}.
              </span>
            </div>
          ) : null}
          <ol className="ow-steps" aria-label="Sections of your page">
            {PROFILE_STEPS.map((s, i) => {
              const done = stepDone(s, draftProfile as unknown as Record<string, unknown>);
              const edited = s.fields.some((f) => changedProfile.has(f));
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-current={i === step ? "step" : undefined}
                    data-done={done || undefined}
                    data-edited={edited || undefined}
                    onClick={() => {
                      setStep(i);
                      setPane("edit");
                    }}
                  >
                    <span className="ow-step-n" aria-hidden="true">
                      {done ? "✓" : i + 1}
                    </span>
                    {s.short}
                    {edited ? <span className="ow-visually-hidden"> (edited)</span> : null}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="ow-seg" role="group" aria-label="Show">
            <button
              type="button"
              aria-pressed={pane === "edit"}
              onClick={() => setPane("edit")}
            >
              Edit
            </button>
            <button
              type="button"
              aria-pressed={pane === "preview"}
              onClick={() => setPane("preview")}
            >
              Preview{changedProfile.size ? " · new" : ""}
            </button>
          </div>
          <div className="ow-panes" data-pane={pane}>
            <section className="ow-step-card" aria-labelledby="ow-step-title">
              <p className="ow-step-count">
                Step {step + 1} of {PROFILE_STEPS.length}
              </p>
              <h2 id="ow-step-title">{current.title}</h2>
              <p className="ow-why">{current.why}</p>
              <div className="ow-fields">
                {current.fields
                  .filter(
                    (f) =>
                      !EXTRA_FIELDS.has(f) &&
                      ownerEditableFields("business").includes(f),
                  )
                  .map(editorFor)}
              </div>
              {current.fields.some((f) => EXTRA_FIELDS.has(f)) ? (
                <details className="ow-more">
                  <summary>More details (optional)</summary>
                  <div className="ow-fields">
                    {current.fields
                      .filter(
                        (f) =>
                          EXTRA_FIELDS.has(f) &&
                          ownerEditableFields("business").includes(f),
                      )
                      .map(editorFor)}
                  </div>
                </details>
              ) : null}
              <div className="ow-step-nav">
                {step > 0 ? (
                  <button
                    type="button"
                    className="pl-btn ow-btn-ghost"
                    onClick={() => setStep(step - 1)}
                  >
                    Back
                  </button>
                ) : null}
                {step < PROFILE_STEPS.length - 1 ? (
                  <button
                    type="button"
                    className="pl-btn"
                    onClick={() => {
                      setStep(step + 1);
                      document
                        .querySelector(".ow-steps")
                        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                    }}
                  >
                    Next: {PROFILE_STEPS[step + 1].short}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pl-btn"
                    onClick={() => setPane("preview")}
                  >
                    See your preview
                  </button>
                )}
              </div>
            </section>
            <aside className="ow-preview-wrap">
              <OwnerProfilePreview
                profile={draftProfile}
                changed={changedProfile}
                state={changedProfile.size ? "draft" : "live"}
              />
              {pane === "preview" ? (
                <button
                  type="button"
                  className="pl-btn ow-btn-ghost ow-back-edit"
                  onClick={() => setPane("edit")}
                >
                  Back to editing
                </button>
              ) : null}
            </aside>
          </div>
        </div>
      ) : null}
      {view === "events" ? (
        <section
          className="organization-programme"
          aria-labelledby="organization-programme"
        >
          <h2 id="organization-programme">
            {org.managementOnly ? "Your listings" : "Your events"}
          </h2>
          <p>
            Add your next event, or fix a date or ticket link. Past, cancelled
            and removed events stay here too.
          </p>
          <button
            className="pl-btn organization-add"
            disabled={disabled || ops.length >= MAX_ORGANIZATION_CHANGES}
            onClick={addEvent}
          >
            + Add an event
          </button>
          <div className="organization-filters">
            <label className="pl-field">
              <span>Search your events</span>
              <input
                type="search"
                placeholder="Event name or address"
                value={eventQuery}
                onChange={(e) => setEventQuery(e.target.value)}
              />
            </label>
            <label className="pl-field">
              <span>Show</span>
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
              >
                {[
                  "upcoming",
                  "past",
                  "cancelled",
                  "removed",
                  "market",
                  "all",
                ].map((state) => (
                  <option key={state} value={state}>
                    {state === "market"
                      ? "Markets"
                      : state[0].toUpperCase() + state.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ul className="organization-programme-list">
            {filteredEvents.slice(0, shown).map((e) => (
              <li key={e.id}>
                <div>
                  <span className="organization-status">
                    {organizationListingState(e, deleted)}
                  </span>
                  <strong>{e.title}</strong>
                  <small>
                    {organizationSchedule(e)}
                    {"address" in e ? ` · ${e.address}` : ""}
                  </small>
                </div>
                <button
                  className="pl-btn"
                  disabled={busy || review}
                  onClick={() => {
                    setTargetId(e.id);
                    setView("editor");
                  }}
                >
                  Edit {e.kind}
                </button>
                {e.kind === "market" ? (
                  <Link
                    to={`/organizer/${encodeURIComponent(e.id)}${adminUserId && uid ? `?as=${encodeURIComponent(uid)}` : ""}`}
                  >
                    Market HQ ↗
                  </Link>
                ) : null}
                {!deleted.has(e.id) ? (
                  <Link to={entityPath(e)}>Public page ↗</Link>
                ) : null}
              </li>
            ))}
          </ul>
          {filteredEvents.length ? (
            <p className="organization-results" role="status">
              Showing {Math.min(shown, filteredEvents.length)} of{" "}
              {filteredEvents.length}
              {eventQuery !== deferredQuery ? " · Updating search…" : ""}
            </p>
          ) : null}
          {filteredEvents.length > shown ? (
            <button
              className="pl-btn"
              onClick={() => setShown((count) => count + 24)}
            >
              Show more
            </button>
          ) : null}
          {!filteredEvents.length ? (
            <div className="organization-empty">
              <strong>
                {eventQuery
                  ? "No matching events"
                  : eventFilter === "upcoming"
                    ? "Nothing coming up yet"
                    : "Nothing here yet"}
              </strong>
              <p>
                {eventQuery
                  ? "Try another name, or switch Show to All."
                  : "Got a sale, tasting, workshop or class coming up? Add it and it shows on your page and in what’s on near you."}
              </p>
            </div>
          ) : null}
          <details className="organization-help">
            <summary>Lots of dates? Add them from a spreadsheet</summary>
            <p>
              Import up to {MAX_ORGANIZATION_CHANGES} confirmed shows or
              workshops as a CSV file. Nothing publishes until you review
              everything. Required columns: title, start, end, address. Dates
              use Calgary time (2026-11-20T19:00).
            </p>
            <a
              className="pl-textbtn"
              download="calgarywatch-event-template.csv"
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(ORGANIZATION_CSV_TEMPLATE)}`}
            >
              Download CSV template
            </a>
            <label className="pl-field">
              <span>Import event CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={disabled}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setBusy(true);
                  try {
                    if (file.size > 500000)
                      throw Error("Keep the CSV below 500 KB.");
                    const incoming = importOrganizationProgramme(
                      await file.text(),
                      org,
                      entities,
                      ops,
                    );
                    request.current = undefined;
                    setOps((current) => [...current, ...incoming]);
                    setView("draft");
                    setError("");
                    setNotice(
                      `${incoming.length} events added. Check dates, venues and tickets before publishing.`,
                    );
                  } catch (error) {
                    setError((error as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
          </details>
        </section>
      ) : null}
      {view === "editor" ? (
        <button className="pl-textbtn" onClick={() => setView("events")}>
          ← Back to your events
        </button>
      ) : null}
      {view === "editor" && targets.length > 2 ? (
        <label className="pl-field">
          <span>Switch to another listing (your changes are kept)</span>
          <select
            value={targetId}
            disabled={busy || review}
            onChange={(e) => setTargetId(e.target.value)}
          >
            {targets.map((e) => (
              <option key={e.id} value={e.id}>
                {e.kind === "business"
                  ? "Your page"
                  : e.kind === "market"
                    ? "Market"
                    : deleted.has(e.id)
                      ? "Removed event"
                      : e.kind === "event" && Date.parse(e.end) < Date.now()
                        ? "Past event"
                        : "Event"}
                : {e.title || "New event"}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {eventEditor ? (
        <div className="ow-studio">
          <div className="ow-seg" role="group" aria-label="Show">
            <button type="button" aria-pressed={pane === "edit"} onClick={() => setPane("edit")}>
              Edit
            </button>
            <button type="button" aria-pressed={pane === "preview"} onClick={() => setPane("preview")}>
              Preview
            </button>
          </div>
          <div className="ow-panes" data-pane={pane}>
            <section className="ow-step-card" aria-labelledby="ow-event-title">
              <p className="ow-step-count">
                {op?.action === "add" ? "New event" : "Editing event"}
              </p>
              <h2 id="ow-event-title">
                {String(op?.changes.title ?? target.title ?? "") || "Tell people what’s on"}
              </h2>
              <p className="ow-why">
                {op?.action === "add"
                  ? "Four quick parts: what, when, where and price. It shows on your page and in what’s on around Calgary."
                  : "Fix a date, time or link. Everything else stays as it is."}
              </p>
              {EVENT_SECTIONS.map((section) => {
                const pricing = String(op?.changes.pricing ?? (target as { pricing?: string }).pricing ?? "unknown");
                const fields = section.fields.filter(
                  (f) =>
                    ownerEditableFields("event").includes(f) &&
                    // Ticket prices only matter for paid events.
                    (f !== "priceRange" || pricing === "paid"),
                );
                return section.extra ? (
                  <details key={section.id} className="ow-more">
                    <summary>{section.title}</summary>
                    <div className="ow-fields">{fields.map(editorFor)}</div>
                  </details>
                ) : (
                  <fieldset key={section.id} className="ow-section">
                    <legend>{section.title}</legend>
                    <div className="ow-fields">{fields.map(editorFor)}</div>
                  </fieldset>
                );
              })}
              <div className="ow-step-nav">
                <button type="button" className="pl-btn ow-btn-ghost" onClick={() => setView("events")}>
                  Back to events
                </button>
                <button type="button" className="pl-btn" onClick={() => setPane("preview")}>
                  See preview
                </button>
              </div>
            </section>
            <aside className="ow-preview-wrap">
              <OwnerEventPreview
                event={{ ...(target as object), ...(op?.changes ?? {}) } as never}
                changed={new Set(op?.action === "edit" ? Object.keys(op.changes) : [])}
                state={op?.action === "add" ? "new" : op ? "draft" : "live"}
                host={(entities.find((e) => e.id === org.id) ?? org).title}
              />
              {pane === "preview" ? (
                <button type="button" className="pl-btn ow-btn-ghost ow-back-edit" onClick={() => setPane("edit")}>
                  Back to editing
                </button>
              ) : null}
            </aside>
          </div>
        </div>
      ) : null}
      {!studio &&
      !eventEditor &&
      (view === "profile" || view === "editor") &&
      target &&
      op?.action !== "delete" ? (
        <section className="ow-step-card ow-plain-editor">
          <h2>
            {target.kind === "business"
              ? org.managementOnly
                ? "Organizer details"
                : "Your page"
              : op?.action === "add"
                ? target.title || "New event"
                : target.title}
          </h2>
          {org.managementOnly && target.id === org.id ? (
            <p>
              These are your organizer details for management. Edit your public
              event or market under Your listings. Saving organizer details does
              not create a public business page.
            </p>
          ) : null}
          {[false, true].map((advanced) => {
            const essential = [
              "title",
              "summary",
              "description",
              "address",
              "venue",
              "website",
              "email",
              "phone",
              "start",
              "end",
              "pricing",
              "tickets",
              "cancelled",
              "occurrences",
            ];
            const fields = (
              adminEdit
                ? adminEditableFields(target.kind)
                : ownerEditableFields(target.kind)
            )
              .filter((f) => !["image", "images"].includes(f))
              .filter(
                (f) => f !== "organizer" && essential.includes(f) !== advanced,
              )
              .map(editorFor);
            return advanced ? (
              <details key="advanced" className="ow-more">
                <summary>More details (optional)</summary>
                <div className="ow-fields">{fields}</div>
              </details>
            ) : (
              <div key="essential" className="ow-fields">
                {fields}
              </div>
            );
          })}
        </section>
      ) : null}
      {adminEdit && target && (view === "profile" || view === "editor") ? (
        <AdminImageEditor
          value={
            op?.changes.image !== undefined
              ? (op.changes.image as any)
              : target.image
          }
          disabled={disabled}
          onChange={(value) => {
            request.current = undefined;
            setOps((current) => {
              const existing = current.find((o) => o.entityId === targetId);
              return [
                ...current.filter((o) => o.entityId !== targetId),
                {
                  entityId: targetId,
                  action: existing?.action ?? "edit",
                  changes: { ...existing?.changes, image: value },
                },
              ];
            });
          }}
        />
      ) : null}
      {adminEdit &&
      target &&
      "images" in target &&
      (view === "profile" || view === "editor") ? (
        <AdminGalleryEditor
          value={(op?.changes.images ?? target.images) as any}
          disabled={disabled}
          onChange={(images) => {
            request.current = undefined;
            setOps((current) => {
              const existing = current.find((o) => o.entityId === targetId);
              return [
                ...current.filter((o) => o.entityId !== targetId),
                {
                  entityId: targetId,
                  action: existing?.action ?? "edit",
                  changes: { ...existing?.changes, images },
                },
              ];
            });
          }}
        />
      ) : null}
      {view === "editor" && target?.kind === "event" ? (
        <button
          className="pl-textbtn"
          disabled={disabled}
          onClick={() => {
            request.current = undefined;
            if (op?.action === "add") {
              setOps((v) => v.filter((o) => o.entityId !== targetId));
              setTargetId(org.id);
              setView("events");
            } else
              setOps((v) => [
                ...v.filter((o) => o.entityId !== targetId),
                {
                  entityId: targetId,
                  action: op?.action === "delete" ? "edit" : "delete",
                  changes: op?.action === "delete" ? { cancelled: false } : {},
                },
              ]);
          }}
        >
          {op?.action === "add"
            ? "Discard this new event"
            : op?.action === "delete"
              ? "Undo removal"
              : deleted.has(targetId)
                ? "Put this event back on your page"
                : "Remove this event from your page"}
        </button>
      ) : null}
      <section className="organization-draft ow-changes" hidden={view !== "draft"}>
        <h2 id="organization-draft">Your changes</h2>
        {ops.length ? (
          <p>
            Saved on this device and not live yet. Check them over, then
            publish when you’re ready.
          </p>
        ) : (
          <div className="organization-empty">
            <strong>No changes yet</strong>
            <p>
              Edit anything on Your page or Events and it shows up here, ready
              to publish.
            </p>
          </div>
        )}
        <ChangeList
          ops={ops}
          targets={targets}
          orgId={org.id}
          onDiscard={
            disabled
              ? undefined
              : (o) => {
                  setOps((v) => v.filter((x) => x.entityId !== o.entityId));
                  request.current = undefined;
                  if (o.action === "add" && targetId === o.entityId)
                    setTargetId(org.id);
                }
          }
        />
      </section>
      <aside className="ow-help" aria-label="Help">
        <strong>Need a hand?</strong>
        <p>
          Photos and logos: we add them for you.{" "}
          {"Owners cannot upload or replace images here, so just send them over."}{" "}
          <a
            href={artworkRequestUrl(
              org.title,
              org.managementOnly
                ? `/claim/${encodeURIComponent(org.id)}`
                : entityPath(org),
            )}
          >
            Send photos
          </a>
        </p>
        <p>
          Anything else, or not sure something looks right? Email{" "}
          <a href="mailto:aldo@calgarywatch.ca">aldo@calgarywatch.ca</a>. A
          real person reads every message, and we’re happy to make changes for
          you.
        </p>
      </aside>
      {error && !review && ops.length && !readOnly ? (
        <p role="alert" className="pl-error ow-publish-error">
          {error}
        </p>
      ) : null}
      {ops.length && !readOnly ? (
        <div className="organization-publishbar" data-locked={locked || undefined}>
          <span>
            <strong>{plural(changeCount, "change")} ready</strong>
            <small>
              {locked
                ? `You can publish again on ${day(nextAt)}. Your changes stay saved here until then.`
                : adminEdit
                  ? "Admin publishing does not use the business’s weekly update."
                  : `Goes live right away. No approval needed. ${updatesLeft} of ${OWNER_EDITS_PER_WEEK} updates left this week.`}
            </small>
          </span>
          <button
            className="pl-btn"
            disabled={disabled || locked || !loaded || !ops.length}
            onClick={beginReview}
          >
            Review & publish
          </button>
        </div>
      ) : null}
      {review ? (
        <dialog
          ref={dialog}
          aria-labelledby="organization-confirm"
          className="organization-confirm"
          onCancel={(e) => {
            if (busy) e.preventDefault();
            else setReview(false);
          }}
        >
          <h2 id="organization-confirm">Ready to go live?</h2>
          {adminEdit ? (
            <p>
              Publish {plural(changeCount, "change")} as an administrator? They
              go live immediately and are recorded under your admin account.
              This does not use the business’s weekly update.
            </p>
          ) : (
            <p>
              Here’s everything that will change on your page. It goes live as
              soon as you publish, with no approval step. You can publish up to{" "}
              {OWNER_EDITS_PER_WEEK} times in any seven days, and this will be
              update {OWNER_EDITS_PER_WEEK - updatesLeft + 1} of{" "}
              {OWNER_EDITS_PER_WEEK}. Need more? Email us and we’ll fix it for
              you.
            </p>
          )}
          <ChangeList ops={ops} targets={targets} orgId={org.id} />
          {error ? (
            <p role="alert" className="pl-error">
              {error}
            </p>
          ) : null}
          <div className="ow-confirm-acts">
            <button
              className="pl-btn"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? "Publishing…" : "Publish now"}
            </button>
            <button
              className="pl-btn ow-btn-ghost"
              disabled={busy}
              onClick={() => setReview(false)}
            >
              Keep editing
            </button>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}

/** Every change as "before → after" in plain words. Never field keys or JSON. */
function ChangeList({
  ops,
  targets,
  orgId,
  onDiscard,
}: {
  ops: OrganizationChange[];
  targets: readonly import("../types/discovery").DiscoveryEntity[];
  orgId: string;
  onDiscard?: (op: OrganizationChange) => void;
}) {
  if (!ops.length) return null;
  return (
    <ul className="ow-diff">
      {ops.map((o) => {
        const before = targets.find((t) => t.id === o.entityId) as
          | Record<string, unknown>
          | undefined;
        const name =
          o.entityId === orgId
            ? "Your page"
            : String(o.changes.title ?? before?.title ?? "") || "New event";
        return (
          <li key={o.entityId}>
            <p className="ow-diff-head">
              <span data-action={o.action}>
                {o.action === "add"
                  ? "New event"
                  : o.action === "delete"
                    ? "Removing"
                    : "Updating"}
              </span>
              <strong>{name}</strong>
            </p>
            {o.action === "delete" ? (
              <p className="ow-small">
                This event comes off your page. Its history stays here.
              </p>
            ) : (
              <dl>
                {Object.entries(o.changes)
                  .filter(([field]) => !["image", "images"].includes(field))
                  .map(([field, value]) => {
                    const was =
                      o.action === "edit" ? before?.[field] : undefined;
                    const hadValue =
                      was !== undefined && was !== null && was !== "";
                    return (
                      <div key={field}>
                        <dt>{fieldLabel(field, (before?.kind as string | undefined) ?? (o.action === "add" ? "event" : undefined))}</dt>
                        <dd>
                          {hadValue ? (
                            <del>
                              {friendlyValue(field, was).map((line) => (
                                <span key={line}>{line}</span>
                              ))}
                            </del>
                          ) : null}
                          <ins>
                            {friendlyValue(field, value).map((line) => (
                              <span key={line}>{line}</span>
                            ))}
                          </ins>
                        </dd>
                      </div>
                    );
                  })}
              </dl>
            )}
            {onDiscard ? (
              <button
                className="pl-textbtn"
                onClick={() => onDiscard(o)}
              >
                Undo this change
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
