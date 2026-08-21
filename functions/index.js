const { initializeApp } = require('firebase-admin/app');
const { defineSecret } = require('firebase-functions/params');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');

initializeApp();

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const ADMIN_EMAILS = ['jorti104@mtroyal.ca', 'ophillah1863@gmail.com'];
const STYLE_LABELS = {
  'neighbour-note': 'A note from Calgary Watch',
  'news-brief': 'From the watch desk',
  'personal-story': 'This week in our community',
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function validRequest(value) {
  const action = value?.action || 'preview';
  return value
    && ['preview', 'cancelled'].includes(action)
    && /^\d{4}-W\d{2}$/.test(value.planWeekKey || '')
    && typeof value.headline === 'string'
    && value.headline.length <= 100
    && typeof value.body === 'string'
    && value.body.trim().length >= 20
    && value.body.length <= 2400
    && Object.hasOwn(STYLE_LABELS, value.style);
}

function renderPreview(value) {
  const cancelled = value.action === 'cancelled';
  const label = cancelled ? 'Opening note removed' : STYLE_LABELS[value.style];
  const title = cancelled ? `${value.planWeekKey} will use the standard brief` : value.headline.trim() || label;
  const paragraphs = value.body.trim().split(/\n\s*\n/).map((paragraph) => (
    `<p style="margin:12px 0 0;font:400 15px/1.62 Arial,sans-serif;color:#DCD3C4;">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`
  )).join('');

  const html = `<!doctype html><html><body style="margin:0;background:#0E1A17;color:#DCD3C4;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0E1A17;">
      <tr><td align="center" style="padding:28px 12px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">
          <tr><td style="padding:0 24px 16px;border-bottom:2px solid #E0AC63;">
            <div style="font:700 13px/1 Arial,sans-serif;color:#F4EEE3;letter-spacing:2.6px;">CALGARY WATCH</div>
            <div style="font:400 11px/1 Arial,sans-serif;color:#A6B8AE;padding-top:7px;">Internal preview · ${escapeHtml(value.planWeekKey)}</div>
          </td></tr>
          <tr><td style="padding:22px 24px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#17251F;border:1px solid #2C443B;border-radius:6px;">
              <tr><td style="padding:20px;">
                <div style="font:700 11px/1 Arial,sans-serif;color:#E0AC63;letter-spacing:1.7px;text-transform:uppercase;">${escapeHtml(label)}</div>
                <div style="font:700 22px/1.3 Georgia,serif;color:#F4EEE3;padding-top:11px;">${escapeHtml(title)}</div>
                ${paragraphs}
              </td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:22px 24px 0;font:400 13px/1.55 Arial,sans-serif;color:#A6B8AE;">
            ${cancelled
              ? 'This is an administrator-only confirmation. Subscribers will receive the standard weekly brief with no optional opening note.'
              : 'This is an administrator-only test. The contribution will appear first in the selected weekly email; subscriber-specific reports follow underneath.'}
            <div style="padding-top:14px;"><a href="https://calgarywatch.ca/admin" style="color:#5CC3AA;font-weight:700;">Open the email planner →</a></div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;

  const text = [
    'CALGARY WATCH — INTERNAL PREVIEW',
    value.planWeekKey,
    '',
    label.toUpperCase(),
    title,
    '',
    value.body.trim(),
    '',
    cancelled
      ? 'This opening note was removed. The standard weekly email will still send.'
      : 'This contribution will appear first in the selected weekly email.',
    'Open the planner: https://calgarywatch.ca/admin',
  ].join('\n');
  return { html, text };
}

exports.sendDigestPlannerPreview = onDocumentCreated({
  document: 'digest_test_requests/{requestId}',
  region: 'northamerica-northeast1',
  secrets: [RESEND_API_KEY],
  retry: true,
  maxInstances: 3,
}, async (event) => {
  if (!event.data) return;
  const requestId = event.params.requestId;
  const ref = event.data.ref;
  const current = await ref.get();
  if (!current.exists || current.data().status === 'sent') return;
  const value = current.data();

  if (!validRequest(value)) {
    await ref.set({ status: 'failed', processedAt: Date.now(), error: 'Invalid contribution payload' }, { merge: true });
    logger.error('Invalid planner preview request', { requestId });
    return;
  }

  await ref.set({ status: 'sending', claimedAt: Date.now() }, { merge: true });
  const preview = renderPreview(value);
  const results = [];
  let retryableFailure = false;
  for (const [index, email] of ADMIN_EMAILS.entries()) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY.value()}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `digest-planner-preview/${requestId}/${index}`,
        },
        body: JSON.stringify({
          from: 'Calgary Watch <digest@calgarywatch.ca>',
          to: [email],
          subject: value.action === 'cancelled'
            ? `[Cancelled] ${value.planWeekKey} weekly opening note`
            : `[Test] ${value.planWeekKey} weekly opening note`,
          html: preview.html,
          text: preview.text,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        results.push({ email, ok: true, providerId: payload.id || null });
      } else {
        const error = `Resend ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`;
        results.push({ email, ok: false, error });
        if (response.status >= 500) retryableFailure = true;
      }
    } catch (error) {
      retryableFailure = true;
      results.push({ email, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const delivered = results.filter((result) => result.ok).length;
  const status = retryableFailure ? 'retrying' : delivered === results.length ? 'sent' : delivered > 0 ? 'partial' : 'failed';
  const error = results.filter((result) => !result.ok).map((result) => `${result.email}: ${result.error}`).join(' · ') || null;
  await ref.set({ status, processedAt: retryableFailure ? null : Date.now(), recipients: results, error }, { merge: true });
  if (retryableFailure) throw new Error(error || 'A planner preview delivery will be retried.');
  logger.info('Planner preview processed', { requestId, delivered, recipients: ADMIN_EMAILS.length, status });
});
