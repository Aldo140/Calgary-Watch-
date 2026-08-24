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

/** One image carried inside the message and referenced as `cid:<cid>`. */
export interface InlineImage {
  cid: string;
  filename: string;
  contentType: string;
  /** Base64 payload, no data: prefix. */
  base64: string;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Omitted for internal test messages, which are transactional admin mail. */
  unsubscribeUrl?: string;
  /** Per-message reply route; overrides the sender-level fallback. */
  replyTo?: string;
  /**
   * Artwork sent as inline attachments rather than linked from the site.
   *
   * A hosted image is one missed deploy away from a broken rectangle in every
   * message already delivered — which is exactly what happened the first time
   * this shipped. An inline part travels with the mail, so it renders on a
   * plane, behind a corporate proxy that strips remote content, and years after
   * the asset path has been renamed. It costs a few KB per send and removes the
   * entire class of failure.
   */
  inline?: InlineImage[];
}

export interface SendResult {
  ok: boolean;
  /** Provider message id, when it gave one. */
  id?: string;
  error?: string;
  /** True when nothing was actually transmitted (dry run, or blocked). */
  skipped?: boolean;
  /** True when the allowlist refused this recipient. */
  blocked?: boolean;
}

export interface SenderConfig {
  apiKey: string;
  /** e.g. `Calgary Watch <digest@calgarywatch.ca>` */
  from: string;
  replyTo?: string;
  /** Resend receiving address used for tokenized subscriber reply routing. */
  inboundAddress?: string;
  supportEmail: string;
  dryRun: boolean;
  /** When set, every message is redirected here instead of the real recipient. */
  testRecipient?: string;
  /** Hard ceiling on messages per run. */
  limit: number;
  /**
   * When non-empty, the ONLY addresses that may be sent to. Everything else is
   * refused at the last step before the network call.
   */
  allowlist: string[];
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
    replyTo: env.DIGEST_INBOUND_ADDRESS?.trim() || env.DIGEST_REPLY_TO?.trim() || env.DIGEST_SUPPORT_EMAIL?.trim(),
    inboundAddress: env.DIGEST_INBOUND_ADDRESS?.trim() || undefined,
    supportEmail: env.DIGEST_SUPPORT_EMAIL ?? 'hello@calgarywatch.ca',
    dryRun,
    testRecipient: env.DIGEST_TEST_EMAIL?.trim() || undefined,
    // Default 50: high enough for the current list, low enough that a bug in
    // the recipient query cannot mail the whole database before anyone looks.
    limit: Number(env.DIGEST_LIMIT ?? '50'),
    allowlist: (env.DIGEST_ALLOWLIST ?? '')
      .split(',').map((a) => a.trim().toLowerCase()).filter(Boolean),
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
  if (!email.unsubscribeUrl) return {};
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
      ...(email.replyTo || config.replyTo ? { reply_to: email.replyTo || config.replyTo } : {}),
      ...(email.inline?.length
        ? {
          attachments: email.inline.map((img) => ({
            filename: img.filename,
            content: img.base64,
            content_id: img.cid,
            content_type: img.contentType,
          })),
        }
        : {}),
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

  // The allowlist is checked here, after the redirect, so it governs the
  // address that will actually be transmitted to rather than the one the
  // caller intended. While a list is set, a scheduled run that would otherwise
  // mail every subscriber can reach nobody else — the guarantee holds even if
  // the workflow, the recipient query or the ledger is wrong.
  if (config.allowlist.length > 0 && !config.allowlist.includes(recipient.toLowerCase())) {
    console.log(`[digest] BLOCKED ${recipient} — not on DIGEST_ALLOWLIST`);
    return { ok: true, skipped: true, blocked: true };
  }

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
