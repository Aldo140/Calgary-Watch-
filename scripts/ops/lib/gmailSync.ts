// HQ's Gmail sync without the Apps Script (ops/gmail/hq-sync.gs in
// Aldo140/ArctosLaunchpad). A scheduled Claude routine reads mrotiz14@gmail.com
// through the Gmail connector, saves the threads as RawThread JSON and runs
// scripts/ops/gmail-sync-pack.ts, which builds the same summary the Apps Script
// would and seals it with the public key next to it. The routine starts the
// HQ Gmail sync workflow with the sealed text; scripts/ops/gmail-sync-ingest.ts
// opens it with the private key kept in arctos-hq and merges it into hq/gmail.
// The repository is public, so mail only ever crosses GitHub sealed.
//
// Node builtins only, so the routine runs it with plain `node` (no install).

import { constants, createCipheriv, createDecipheriv, generateKeyPairSync, privateDecrypt, publicEncrypt, randomBytes } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { GmailReply, GmailSend, GmailSummary, MailBusiness, ReplyKind, ThreadMessage } from './replyCheck.ts';

export const DAYS = 30;
const DAY = 86_400_000;

export const ALIASES: Record<string, MailBusiness> = {
  'aldo@vowmotionweddings.com': 'vowmotion',
  'aldo@arctoslaunchpad.com': 'arctos',
  'aldo@calgarywatch.ca': 'calgarywatch',
};
const BRANDS: Array<[MailBusiness, RegExp]> = [
  ['vowmotion', /vow\s*motion/i],
  ['arctos', /arctos/i],
  ['calgarywatch', /calgary\s*watch/i],
];

/** The Gmail search the routine runs (newer_than set per run), same as the Apps Script's. */
export const gmailQuery = (days: number) =>
  `newer_than:${days}d (${Object.keys(ALIASES).map((a) => `from:${a} OR to:${a} OR deliveredto:${a}`).join(' OR ')})`;

/** One message as the routine copies it from the Gmail connector. */
export interface RawMessage {
  /** ISO date or epoch ms. */
  at: string | number;
  /** "Name <address>" or a bare address. */
  from: string;
  to?: string | string[];
  cc?: string | string[];
  subject?: string;
  /** The plain-text body when the routine read the thread, else the snippet. */
  text?: string;
}
export interface RawThread {
  /** Gmail's thread id (hex), as search_threads and get_thread give it. */
  id: string;
  /** Every message in the thread, oldest first. */
  messages: RawMessage[];
}
export interface RawMail {
  account: string;
  threads: RawThread[];
}

export const address = (header: string) => (String(header || '').match(/[\w.+'-]+@[\w-]+(\.[\w-]+)+/)?.[0] ?? '').toLowerCase();
const displayName = (header: string) => String(header || '').match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.trim() ?? address(header);
const joined = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(', ') : v ?? '');
const timeOf = (at: string | number) => (typeof at === 'number' ? at : Date.parse(at));
export const threadUrl = (id: string) => `https://mail.google.com/mail/u/0/#all/${id}`;

/** The reply above the quoted text. */
export function firstLines(body: string): string {
  const cut = body.search(/\n\s*(On .+ wrote:|From: |-----Original Message-----|>)/);
  return (cut > 0 ? body.slice(0, cut) : body).replace(/\s+/g, ' ').trim();
}

const brandOf = (body: string) => BRANDS.find(([, re]) => re.test(body))?.[0] ?? null;

export function kindOf(from: string, subject: string, body: string): ReplyKind {
  if (/mailer-daemon|postmaster/i.test(from) || /delivery status notification|undeliverable|delivery has failed|returned mail/i.test(subject)) return 'bounce';
  if (/automatic reply|auto.?reply|out of (the )?office|away from|autoresponder|thank you for (your email|contacting|reaching)/i.test(subject)) return 'auto';
  const top = firstLines(body).slice(0, 400);
  if (/\bunsubscribe\b|remove me|take me off|stop (emailing|contacting)|no more emails|do not (email|contact)/i.test(top)) return 'optout';
  if (/out of (the )?office|currently away|limited access to email|will respond .* upon my return/i.test(top)) return 'auto';
  return 'reply';
}

/** The summary the Apps Script would post, for these threads only. */
export function buildSummary(mail: RawMail, now = Date.now()): GmailSummary {
  const me = mail.account.toLowerCase();
  const mine = [...Object.keys(ALIASES), me];
  const isMine = (a: string) => mine.includes(a);
  const since = now - DAYS * DAY;
  const sends: GmailSend[] = [];
  const replies: GmailReply[] = [];

  for (const t of mail.threads) {
    const messages = [...t.messages].sort((a, b) => timeOf(a.at) - timeOf(b.at));
    if (!messages.length) continue;
    const url = threadUrl(t.id);
    const firstReply = replies.length;
    const firstFromUs = isMine(address(messages[0].from));
    const ours = messages.find((m) => isMine(address(m.from)));
    const threadBusiness = ours ? brandOf((ours.text ?? '').slice(0, 4000)) ?? ALIASES[address(ours.from)] ?? null : null;

    messages.forEach((m, i) => {
      const at = timeOf(m.at);
      if (!Number.isFinite(at) || at < since) return;
      const from = address(m.from);
      const later = messages.slice(i + 1);
      const subject = (m.subject ?? '').slice(0, 200);
      const text = m.text ?? '';
      if (isMine(from)) {
        const alias = ALIASES[from] ? from : me;
        const to = address(joined(m.to));
        if (!to || isMine(to)) return;
        const own = ALIASES[alias] ?? null;
        const about = brandOf(text.slice(0, 4000)) ?? threadBusiness ?? own ?? 'other';
        sends.push({
          at,
          alias,
          business: about,
          to: to.slice(0, 200),
          domain: (to.split('@')[1] ?? '').slice(0, 120),
          subject,
          first: i === 0,
          wrongAlias: own && about !== 'other' && about !== own ? own : null,
          replied: later.some((x) => !isMine(address(x.from))),
          url,
        });
      } else {
        const all = `${joined(m.to)},${joined(m.cc)}`.toLowerCase();
        const toAlias = Object.keys(ALIASES).find((a) => all.includes(a)) ?? (all.includes(me) ? me : '');
        if (!toAlias && !firstFromUs) return;
        replies.push({
          at,
          alias: toAlias || me,
          business: threadBusiness ?? ALIASES[toAlias] ?? 'other',
          from: from.slice(0, 200),
          name: displayName(m.from).slice(0, 120),
          subject,
          snippet: firstLines(text).slice(0, 240),
          kind: kindOf(from, m.subject ?? '', text),
          toPitch: firstFromUs,
          answered: later.some((x) => isMine(address(x.from))),
          url,
        });
      }
    });

    // The newest unanswered real reply in this thread gets the conversation.
    for (let j = replies.length - 1; j >= firstReply; j--) {
      if (replies[j].kind === 'reply' && !replies[j].answered) {
        const picked = messages.length > 8 ? [messages[0], ...messages.slice(-7)] : messages;
        replies[j].thread = picked.map((x): ThreadMessage => ({
          at: timeOf(x.at),
          ours: isMine(address(x.from)),
          from: address(x.from),
          text: firstLines(x.text ?? '').slice(0, 700),
        }));
        break;
      }
    }
  }
  return { generatedAt: now, account: me, days: DAYS, sends, replies };
}

/**
 * The stored summary with these threads replaced by their fresh read. Threads
 * the routine didn't read this time keep what they had, until they age out.
 */
export function mergeSummary(existing: GmailSummary | null, fresh: GmailSummary, threadIds: string[], now = Date.now()): GmailSummary {
  const replaced = new Set(threadIds.map(threadUrl));
  const since = now - DAYS * DAY;
  const keep = <T extends { url: string; at: number }>(old: T[] | undefined, add: T[]) =>
    [...(old ?? []).filter((x) => !replaced.has(x.url)), ...add].filter((x) => x.at >= since).sort((a, b) => b.at - a.at);
  return {
    generatedAt: now,
    account: fresh.account,
    days: DAYS,
    // Small enough for one Firestore document (1 MB), like the ingest route.
    sends: keep(existing?.sends, fresh.sends).slice(0, 1200),
    replies: keep(existing?.replies, fresh.replies).slice(0, 400),
  };
}

/** What crosses GitHub: the threads read this run and their summary. */
export interface SyncPayload {
  threadIds: string[];
  summary: GmailSummary;
}

const b64 = (b: Buffer) => b.toString('base64');

/** RSA-OAEP wraps a fresh AES-256-GCM key; the payload is gzipped first. */
export function seal(payload: SyncPayload, publicKeyPem: string): string {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(gzipSync(JSON.stringify(payload))), cipher.final()]);
  const wrapped = publicEncrypt({ key: publicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key);
  return ['v1', b64(wrapped), b64(iv), b64(cipher.getAuthTag()), b64(data)].join('.');
}

export function open(sealed: string, privateKeyPem: string): SyncPayload {
  const [v, wrapped, iv, tag, data] = sealed.trim().split('.');
  if (v !== 'v1' || !data) throw new Error('Not a sealed Gmail sync.');
  const key = privateDecrypt({ key: privateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(wrapped, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]);
  return JSON.parse(gunzipSync(plain).toString('utf8')) as SyncPayload;
}

export function newKeyPair(): { publicKey: string; privateKey: string } {
  return generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

/** GitHub caps a workflow's inputs at 65,535 characters. */
export const MAX_SEALED = 60_000;

/** Sealed payloads small enough for one workflow run each, splitting by thread when needed. */
export function sealInParts(mail: RawMail, publicKeyPem: string, now = Date.now()): string[] {
  const one = (threads: RawThread[]) =>
    seal({ threadIds: threads.map((t) => t.id), summary: buildSummary({ account: mail.account, threads }, now) }, publicKeyPem);
  const split = (threads: RawThread[]): string[] => {
    const sealed = one(threads);
    if (sealed.length <= MAX_SEALED || threads.length <= 1) return [sealed];
    const half = Math.ceil(threads.length / 2);
    return [...split(threads.slice(0, half)), ...split(threads.slice(half))];
  };
  return split(mail.threads);
}
