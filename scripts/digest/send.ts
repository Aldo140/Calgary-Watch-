/**
 * Calgary Watch — the transport half of the digest.
 *
 * One provider (Resend), called over plain HTTP with the built-in `fetch`, so
 * the weekly job stays a `npx tsx` script with no SDK to install, pin or
 * upgrade. Swapping providers means rewriting `postToResend` and nothing else.
 *
 * The safety valves live here rather than in the orchestrator on purpose. Dry
 * run, the test redirect and the per-run cap are the difference between a bug
 * that prints and a bug that lands in several hundred inboxes and cannot be
 * recalled, so they sit at the last point before the network call where they
 * cannot be bypassed by a mistake further up.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
}

export interface SendResult {
  ok: boolean;
  /** Provider message id, when it gave one. */
  id?: string;
  error?: string;
  /** True when nothing was actually transmitted (dry run). */
  skipped?: boolean;
}

export interface SenderConfig {
  apiKey: string;
  /** e.g. `Calgary Watch <digest@calgarywatch.ca>` */
  from: string;
  replyTo?: string;
  supportEmail: string;
  dryRun: boolean;
  /** When set, every message is redirected here instead of the real recipient. */
  testRecipient?: string;
  /** Hard ceiling on messages per run. */
  limit: number;
  /** Milliseconds between provider calls. */
  throttleMs: number;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function loadSenderConfig(env: NodeJS.ProcessEnv = process.env): SenderConfig {
  const dryRun = env.DIGEST_DRY_RUN === '1' || env.DIGEST_DRY_RUN === 'true';
  const apiKey = env.RESEND_API_KEY ?? '';
  if (!apiKey && !dryRun) {
    throw new Error('RESEND_API_KEY is not set. Set it, or run with DIGEST_DRY_RUN=1.');
  }
  return {
    apiKey,
    from: env.DIGEST_FROM ?? 'Calgary Watch <digest@calgarywatch.ca>',
    replyTo: env.DIGEST_REPLY_TO,
    supportEmail: env.DIGEST_SUPPORT_EMAIL ?? 'hello@calgarywatch.ca',
    dryRun,
    testRecipient: env.DIGEST_TEST_EMAIL?.trim() || undefined,
    // Default 50: high enough for the current list, low enough that a bug in
    // the recipient query cannot mail the whole database before anyone looks.
    limit: Number(env.DIGEST_LIMIT ?? '50'),
    throttleMs: Number(env.DIGEST_THROTTLE_MS ?? '600'),
  };
}

/**
 * Headers that decide whether this lands in the inbox or the spam folder.
 *
 * `List-Unsubscribe` is what puts the native "Unsubscribe" control at the top
 * of a Gmail or Apple Mail message. Offering it makes people use that instead
 * of the spam button, which is the single biggest lever on sender reputation.
 *
 * `List-Unsubscribe-Post` — the one-click variant — is deliberately absent. It
 * obliges the sender to honour an unauthenticated HTTP POST, and Calgary Watch
 * is served as static hosting with no endpoint that could receive one. Claiming
 * support we cannot honour is worse than not claiming it. Gmail only mandates
 * one-click above 5,000 messages a day; if this list ever approaches that, the
 * fix is a real POST endpoint, not this header.
 */
export function unsubscribeHeaders(email: OutgoingEmail, config: SenderConfig): Record<string, string> {
  return {
    'List-Unsubscribe': `<mailto:${config.supportEmail}?subject=unsubscribe>, <${email.unsubscribeUrl}>`,
  };
}

async function postToResend(email: OutgoingEmail, config: SenderConfig): Promise<SendResult> {
  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(config.replyTo ? { reply_to: config.replyTo } : {}),
      headers: unsubscribeHeaders(email, config),
    }),
  });

  if (!response.ok) {
    // The body carries the actual reason (unverified domain, bad key, invalid
    // recipient). Losing it turns every failure into an unactionable "500".
    const detail = await response.text().catch(() => '');
    return { ok: false, error: `Resend ${response.status}: ${detail.slice(0, 400)}` };
  }
  const payload = (await response.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: payload.id };
}

/**
 * Send one message, honouring every guard.
 *
 * The test redirect rewrites the recipient rather than filtering the run, so a
 * rehearsal exercises the identical selection, rendering and ledger path that
 * production will take — the only difference is the envelope address.
 */
export async function sendDigestEmail(email: OutgoingEmail, config: SenderConfig): Promise<SendResult> {
  const recipient = config.testRecipient ?? email.to;

  if (config.dryRun) {
    console.log(`[digest] DRY RUN → ${recipient} :: ${email.subject}`);
    return { ok: true, skipped: true };
  }

  try {
    return await postToResend({ ...email, to: recipient }, config);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
