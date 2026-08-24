/**
 * Synchronize Resend inbound mail into the admin-only reply inbox.
 *
 * This runs in GitHub Actions so reply tracking works on Firebase's free plan.
 * Resend stores inbound mail even without a webhook; this job polls the
 * Received Emails API, retrieves only unseen messages, strips active HTML and
 * writes bounded plain text plus safe attachment metadata to Firestore.
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

const RESEND_API = 'https://api.resend.com';
const REPLIES = 'digest_replies';
const SENDS = 'digest_sends';
const REPLY_ROUTES = 'digest_reply_routes';
const HEALTH = 'ingestion_health';
const SOURCE_ID = 'resend_inbound';
const MAX_BODY_CHARS = 20_000;
const RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

type ReceivedSummary = {
  id: string;
  to?: string[];
  from?: string;
  created_at?: string;
  subject?: string;
  message_id?: string;
  attachments?: ReceivedAttachment[];
};

type ReceivedAttachment = {
  id?: string;
  filename?: string;
  content_type?: string;
  size?: number;
};

type ReceivedEmail = ReceivedSummary & {
  text?: string | null;
  html?: string | null;
  headers?: Record<string, string>;
};

type ResendDomain = {
  name?: string;
  status?: string;
  capabilities?: { receiving?: string };
};

function initFirebase(): Firestore {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is required.');
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(raw)) });
  return getFirestore();
}

function normalizeAddress(value: string): string {
  const match = value.trim().match(/<([^<>]+)>$/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function parseAddress(value: string): { local: string; domain: string } | null {
  const normalized = normalizeAddress(value);
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return null;
  return { local: normalized.slice(0, at), domain: normalized.slice(at + 1) };
}

function matchesInbox(candidate: string, inbox: string): boolean {
  const target = parseAddress(inbox);
  const received = parseAddress(candidate);
  if (!target || !received || target.domain !== received.domain) return false;
  return received.local === target.local || received.local.startsWith(`${target.local}+`);
}

function replyToken(to: string[], inbox: string): string | null {
  const target = parseAddress(inbox);
  if (!target) return null;
  for (const candidate of to) {
    const received = parseAddress(candidate);
    if (!received || received.domain !== target.domain) continue;
    const prefix = `${target.local}+`;
    if (received.local.startsWith(prefix)) return received.local.slice(prefix.length) || null;
  }
  return null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

export function safePlainText(text: string | null | undefined, html: string | null | undefined): string {
  const source = text?.trim() || (html ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(source)
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_BODY_CHARS);
}

function isAutomated(headers: Record<string, string> | undefined, subject: string): boolean {
  const normalized = Object.fromEntries(
    Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value).toLowerCase()]),
  );
  return (!!normalized['auto-submitted'] && normalized['auto-submitted'] !== 'no')
    || ['bulk', 'junk', 'list'].includes(normalized.precedence ?? '')
    || /^(automatic reply|auto.?reply|out of office|away from the office)/i.test(subject.trim());
}

async function resendGet<T>(path: string, apiKey: string): Promise<T> {
  const response = await fetch(`${RESEND_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend ${response.status}: ${detail.slice(0, 400)}`);
  }
  return response.json() as Promise<T>;
}

async function matchingSend(db: Firestore, token: string | null) {
  if (!token) return null;
  const snapshot = await db.collection(SENDS).where('replyToken', '==', token).limit(1).get();
  if (!snapshot.empty) {
    const row = snapshot.docs[0];
    return { id: row.id, ...row.data() } as Record<string, unknown>;
  }
  const route = await db.collection(REPLY_ROUTES).doc(token).get();
  return route.exists ? { id: route.id, ...route.data() } as Record<string, unknown> : null;
}

async function publishHealth(
  db: Firestore,
  status: 'ok' | 'error' | 'disabled',
  detail: { count?: number; error?: string | null; inboundAddress?: string | null; durationMs?: number },
) {
  const checkedAt = Date.now();
  await db.collection(HEALTH).doc(SOURCE_ID).set({
    sourceId: SOURCE_ID,
    name: 'Resend reply inbox',
    status,
    checkedAt,
    durationMs: detail.durationMs ?? null,
    recordCount: detail.count ?? null,
    error: detail.error ?? null,
    inboundAddress: detail.inboundAddress ?? null,
    runId: process.env.GITHUB_RUN_ID ?? 'local',
    ...(status === 'ok' ? { lastSuccessAt: checkedAt } : {}),
  }, { merge: true });
}

async function run(): Promise<void> {
  const startedAt = Date.now();
  const db = initFirebase();
  let inbox = process.env.DIGEST_INBOUND_ADDRESS?.trim().toLowerCase() ?? '';
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? '';

  if (!apiKey) throw new Error('RESEND_API_KEY is required.');
  if (!inbox) {
    try {
      const domains = await resendGet<{ data?: ResendDomain[] }>('/domains?limit=100', apiKey);
      const receivingDomain = (domains.data ?? []).find((domain) =>
        domain.status === 'verified' && domain.capabilities?.receiving === 'enabled' && domain.name,
      );
      if (receivingDomain?.name) inbox = `replies@${receivingDomain.name.toLowerCase()}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await publishHealth(db, 'error', {
        error: `${message} The Resend API key must have full access for inbound synchronization.`,
        inboundAddress: null,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  if (!inbox || !parseAddress(inbox)) {
    await publishHealth(db, 'disabled', {
      error: 'Add the Resend receiving address as the DIGEST_INBOUND_ADDRESS repository variable.',
      inboundAddress: null,
      durationMs: Date.now() - startedAt,
    });
    console.log('[replies] Setup required — DIGEST_INBOUND_ADDRESS is not configured.');
    return;
  }
  try {
    const list = await resendGet<{ data?: ReceivedSummary[] }>(`/emails/receiving?limit=100`, apiKey);
    const candidates = (list.data ?? []).filter((email) =>
      (email.to ?? []).some((address) => matchesInbox(address, inbox)),
    );
    let added = 0;

    for (const summary of candidates) {
      const ref = db.collection(REPLIES).doc(summary.id);
      if ((await ref.get()).exists) continue;

      const email = await resendGet<ReceivedEmail>(`/emails/receiving/${encodeURIComponent(summary.id)}`, apiKey);
      const token = replyToken(email.to ?? [], inbox);
      const send = await matchingSend(db, token);
      const uid = typeof send?.uid === 'string' ? send.uid : null;
      const profile = uid ? await db.collection('users').doc(uid).get() : null;
      const profileData = profile?.exists ? profile.data() : undefined;
      const receivedAt = Date.parse(email.created_at ?? '') || Date.now();
      const attachments = (email.attachments ?? []).slice(0, 20).map((attachment) => ({
        id: String(attachment.id ?? ''),
        filename: String(attachment.filename ?? 'Attachment').slice(0, 180),
        contentType: String(attachment.content_type ?? 'application/octet-stream').slice(0, 120),
        size: Number.isFinite(attachment.size) ? Number(attachment.size) : null,
      }));

      await ref.create({
        providerId: email.id,
        from: normalizeAddress(email.from ?? ''),
        to: (email.to ?? []).map(normalizeAddress).slice(0, 10),
        subject: String(email.subject ?? '(No subject)').slice(0, 300),
        text: safePlainText(email.text, email.html),
        receivedAt,
        syncedAt: Date.now(),
        messageId: String(email.message_id ?? '').slice(0, 500),
        inReplyTo: String(email.headers?.['in-reply-to'] ?? email.headers?.['In-Reply-To'] ?? '').slice(0, 500),
        attachments,
        automated: isAutomated(email.headers, email.subject ?? ''),
        status: 'unread',
        subscriberUid: uid,
        subscriberEmail: typeof profileData?.email === 'string' ? profileData.email : null,
        subscriberName: typeof profileData?.displayName === 'string' ? profileData.displayName : null,
        sendId: typeof send?.id === 'string' ? send.id : null,
        weekKey: typeof send?.weekKey === 'string' ? send.weekKey : null,
        deliveryKind: typeof send?.kind === 'string' ? send.kind : null,
        originalSubject: typeof send?.subject === 'string' ? send.subject : null,
        note: '',
        updatedAt: Date.now(),
      });
      added += 1;
      await new Promise((resolve) => setTimeout(resolve, 550));
    }

    const expired = await db.collection(REPLIES)
      .where('receivedAt', '<', Date.now() - RETENTION_MS)
      .limit(200)
      .get();
    if (!expired.empty) {
      const batch = db.batch();
      expired.docs.forEach((row) => batch.delete(row.ref));
      await batch.commit();
    }

    const expiredRoutes = await db.collection(REPLY_ROUTES)
      .where('expiresAt', '<', Date.now())
      .limit(200)
      .get();
    if (!expiredRoutes.empty) {
      const batch = db.batch();
      expiredRoutes.docs.forEach((row) => batch.delete(row.ref));
      await batch.commit();
    }

    const unread = await db.collection(REPLIES).where('status', '==', 'unread').count().get();
    await publishHealth(db, 'ok', {
      count: unread.data().count,
      error: null,
      inboundAddress: inbox,
      durationMs: Date.now() - startedAt,
    });
    console.log(`[replies] Synced ${added} new message(s); ${unread.data().count} unread.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    await publishHealth(db, 'error', { error: message, inboundAddress: inbox, durationMs: Date.now() - startedAt });
    throw error;
  }
}

run().catch((error) => {
  console.error('[replies] fatal:', error);
  process.exit(1);
});
