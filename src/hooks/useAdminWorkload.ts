import {
  emptyAdminWorkloadSources,
  readAdminWorkload,
} from "@/src/lib/adminWorkload";
import { useEffect, useState } from "react";
import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/src/firebase";

export interface AdminWorkload {
  error?: string;
  loading?: boolean;
  pendingClaims?: number;
  legacyUpdates?: number;
  marketRequests?: number;
  socialReview?: number;
  socialCorrections?: number;
  readerReplies?: number;
  ownerUpdates: number;
  suggestions: number;
  failedActions: number;
  stuckActions: number;
  /** Listing claims to confirm plus organizer changes to apply. */
  claims: number;
}

/**
 * Work waiting outside the incident queue, counted server-side (one read per
 * thousand documents) when admin opens and every ten minutes after:
 * resident event suggestions, moderation the hourly job couldn't apply, and
 * moderation queued long enough that the job itself probably isn't running.
 */
export function useAdminWorkload(enabled: boolean): AdminWorkload {
  const [w, setW] = useState<AdminWorkload>({
    loading: true,
    suggestions: 0,
    failedActions: 0,
    stuckActions: 0,
    claims: 0,
    ownerUpdates: 0,
  });
  useEffect(() => {
    if (!enabled || !db) return;
    const database = db;
    let active = true;
    let pending = false;
    let sources = emptyAdminWorkloadSources();
    const count = (q: Parameters<typeof getCountFromServer>[0]) =>
      getCountFromServer(q).then((s) => s.data().count);
    // Single-field filters only, so no composite index has to be deployed
    // (the rules-only backend release does not create indexes). The queue is
    // small: a handful of pending or failed rows at most.
    const queue = () =>
      getDocs(
        query(
          collection(database, "discovery_actions"),
          where("status", "in", ["pending", "failed"]),
          limit(100),
        ),
      ).then((s) =>
        s.docs.map((d) => d.data() as { status: string; createdAt?: number }),
      );
    const load = () => {
      if (!active || pending || document.hidden) return;
      pending = true;
      void readAdminWorkload(
        {
          suggestions: () =>
            count(
              query(
                collection(database, "entity_submissions"),
                where("status", "==", "pending"),
              ),
            ),
          queue,
          claims: () =>
            count(
              query(
                collection(database, "listing_claims"),
                where("status", "==", "pending"),
              ),
            ),
          updates: () =>
            count(
              query(
                collection(database, "listing_updates"),
                where("status", "==", "pending"),
              ),
            ),
          service: () =>
            count(
              query(
                collection(database, "market_service_requests"),
                where("status", "==", "new"),
              ),
            ),
          ownerUpdates: () =>
            count(
              query(
                collection(database, "owner_listing_edits"),
                where("notificationPending", "==", true),
              ),
            ),
          socialReview: () =>
            count(
              query(
                collection(database, "ops_queue"),
                where("status", "==", "drafted"),
              ),
            ),
          socialCorrections: () =>
            count(
              query(
                collection(database, "ops_queue"),
                where("status", "==", "needs-correction"),
              ),
            ),
          readerReplies: () =>
            count(
              query(
                collection(database, "digest_replies"),
                where("status", "in", ["unread", "open"]),
              ),
            ),
        },
        sources,
      )
        .then((result) => {
          if (!active) return;
          sources = result.sources;
          const now = Date.now();
          setW({
            loading: false,
            pendingClaims: sources.claims,
            legacyUpdates: sources.updates,
            marketRequests: sources.service,
            socialReview: sources.socialReview,
            socialCorrections: sources.socialCorrections,
            readerReplies: sources.readerReplies,
            error: result.error,
            suggestions: sources.suggestions,
            ownerUpdates: sources.ownerUpdates,
            claims: sources.claims + sources.updates + sources.service,
            failedActions: sources.queue.filter(
              (r) =>
                r.status === "failed" &&
                (r.createdAt ?? 0) > now - 7 * 86_400_000,
            ).length,
            stuckActions: sources.queue.filter(
              (r) =>
                r.status === "pending" &&
                (r.createdAt ?? now) < now - 2 * 3_600_000,
            ).length,
          });
        })
        .finally(() => {
          pending = false;
        });
    };
    load();
    const t = window.setInterval(load, 10 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [enabled]);
  return w;
}
