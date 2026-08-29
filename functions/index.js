const { initializeApp } = require('firebase-admin/app');
const { defineSecret } = require('firebase-functions/params');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { getFirestore } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

initializeApp();

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
const ADMIN_EMAILS = ['jorti104@mtroyal.ca', 'ophillah1863@gmail.com'];
const STYLE_LABELS = {
  'neighbour-note': 'A note from Calgary Watch',
  'news-brief': 'From the watch desk',
  'personal-story': 'This week in our community',
};
const AUDIENCE_LABELS = {
  everyone: 'Every weekly reader',
  local: 'Local-result readers only',
  citywide: 'City-wide digest readers only',
};
const LOGO_CID = 'cw-logo';

let logoBase64;
function logoAttachment() {
  logoBase64 ||= readFileSync(join(__dirname, 'assets', 'logo.png')).toString('base64');
  return {
    filename: 'calgary-watch-logo.png',
    content: logoBase64,
    content_id: LOGO_CID,
    content_type: 'image/png',
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function validHttpsUrl(value) {
  if (!value) return '';
  try {
    const parsed = new URL(String(value).trim());
    return parsed.protocol === 'https:' ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function inlineFormatting(value) {
  const source = String(value);
  const pattern = /\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g;
  let output = '';
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    output += escapeHtml(source.slice(cursor, match.index));
    if (match[1]) output += `<strong style="font-weight:700;color:#F4EEE3;">${escapeHtml(match[1])}</strong>`;
    else output += `<a href="${escapeHtml(match[3])}" style="color:#5CC3AA;font-weight:700;text-decoration:underline;">${escapeHtml(match[2])}</a>`;
    cursor = match.index + match[0].length;
  }
  return output + escapeHtml(source.slice(cursor)).replace(/\n/g, '<br>');
}

function formattedBody(value) {
  const lines = String(value).replace(/\r/g, '').split('\n');
  const blocks = [];
  let paragraph = [];
  let list = [];
  const flushParagraph = () => {
    const text = paragraph.join('\n').trim();
    if (text) blocks.push(`<p style="margin:12px 0 0;font:400 15px/1.62 Arial,sans-serif;color:#DCD3C4;">${inlineFormatting(text)}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">${list.map((item) => `<tr><td width="18" style="width:18px;vertical-align:top;color:#E0AC63;font:700 15px/1.6 Arial,sans-serif;">•</td><td style="padding-bottom:5px;color:#DCD3C4;font:400 15px/1.6 Arial,sans-serif;">${inlineFormatting(item)}</td></tr>`).join('')}</table>`);
    list = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushParagraph(); flushList(); }
    else if (/^##\s+/.test(trimmed)) { flushParagraph(); flushList(); blocks.push(`<div style="padding-top:15px;color:#F4EEE3;font:700 17px/1.35 Georgia,serif;">${inlineFormatting(trimmed.replace(/^##\s+/, ''))}</div>`); }
    else if (/^>\s?/.test(trimmed)) { flushParagraph(); flushList(); blocks.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:13px;"><tr><td width="3" style="width:3px;background:#E0AC63;font-size:0;">&nbsp;</td><td style="padding-left:13px;color:#DCD3C4;font:italic 400 15px/1.62 Georgia,serif;">${inlineFormatting(trimmed.replace(/^>\s?/, ''))}</td></tr></table>`); }
    else if (/^-\s+/.test(trimmed)) { flushParagraph(); list.push(trimmed.replace(/^-\s+/, '')); }
    else { flushList(); paragraph.push(trimmed); }
  }
  flushParagraph(); flushList();
  return blocks.join('');
}

function plainFormatting(value) {
  return String(value).replace(/^##\s+/gm, '').replace(/^>\s?/gm, '').replace(/^-\s+/gm, '• ')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g, '$1 ($2)');
}

function validRequest(value) {
  const action = value?.action || 'preview';
  return value
    && ['preview', 'cancelled'].includes(action)
    && /^\d{4}-W\d{2}$/.test(value.planWeekKey || '')
    && typeof value.headline === 'string'
    && value.headline.length <= 100
    && (value.preheader === undefined || (typeof value.preheader === 'string' && value.preheader.length <= 140))
    && typeof value.body === 'string'
    && value.body.trim().length >= 20
    && value.body.length <= 2400
    && Object.hasOwn(STYLE_LABELS, value.style)
    && (value.audience === undefined || Object.hasOwn(AUDIENCE_LABELS, value.audience))
    && (value.byline === undefined || (typeof value.byline === 'string' && value.byline.length <= 80))
    && (value.ctaLabel === undefined || (typeof value.ctaLabel === 'string' && value.ctaLabel.length <= 50))
    && (!value.ctaLabel && !value.ctaUrl || !!value.ctaLabel?.trim() && !!validHttpsUrl(value.ctaUrl));
}

function renderPreview(value) {
  const cancelled = value.action === 'cancelled';
  const label = cancelled ? 'Opening note removed' : STYLE_LABELS[value.style];
  const audienceLabel = AUDIENCE_LABELS[value.audience || 'everyone'];
  const title = cancelled ? `${value.planWeekKey} will use the standard brief` : value.headline.trim() || label;
  const paragraphs = formattedBody(value.body.trim());
  const extras = `${value.byline?.trim() ? `<div style="font:600 12px/1.5 Arial,sans-serif;color:#A6B8AE;padding-top:15px;">${escapeHtml(value.byline.trim())}</div>` : ''}${value.ctaLabel?.trim() && validHttpsUrl(value.ctaUrl) ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:17px;"><tr><td style="background:#F4EEE3;border-radius:3px;"><a href="${escapeHtml(validHttpsUrl(value.ctaUrl))}" style="display:inline-block;padding:11px 17px;color:#0E1A17;font:700 13px/1 Arial,sans-serif;text-decoration:none;">${escapeHtml(value.ctaLabel.trim())} →</a></td></tr></table>` : ''}`;

  const opening = (() => {
    if (cancelled) {
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#17251F;border:1px solid #2C443B;border-radius:6px;">
        <tr><td style="padding:20px;">
          <div style="font:700 11px/1 Arial,sans-serif;color:#E0AC63;letter-spacing:1.7px;text-transform:uppercase;">${escapeHtml(label)}</div>
          <div style="font:700 22px/1.3 Georgia,serif;color:#F4EEE3;padding-top:11px;">${escapeHtml(title)}</div>
          ${paragraphs}${extras}
        </td></tr>
      </table>`;
    }
    if (value.style === 'news-brief') {
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#17251F;border:1px solid #2C443B;border-radius:3px;">
        <tr><td style="padding:18px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font:700 11px/1 Arial,sans-serif;color:#E0AC63;letter-spacing:1.7px;text-transform:uppercase;">${escapeHtml(label)}</td>
            <td align="right" style="font:400 10px/1 monospace;color:#A6B8AE;">${escapeHtml(value.planWeekKey)}</td>
          </tr></table>
          <div style="font:700 21px/1.3 Georgia,serif;color:#F4EEE3;padding-top:12px;">${escapeHtml(title)}</div>
          ${paragraphs}${extras}
        </td></tr>
      </table>`;
    }
    if (value.style === 'personal-story') {
      return `<div style="border-top:1px solid #3A5A4E;border-bottom:1px solid #3A5A4E;padding:19px 4px 20px;">
        <div style="font:700 11px/1 Arial,sans-serif;color:#E0AC63;letter-spacing:1.7px;text-transform:uppercase;">${escapeHtml(label)}</div>
        <div style="font:700 23px/1.3 Georgia,serif;color:#F4EEE3;padding-top:12px;">${escapeHtml(title)}</div>
        ${paragraphs}${extras || '<div style="font:600 12px/1.5 Arial,sans-serif;color:#A6B8AE;padding-top:15px;">From the Calgary Watch team</div>'}
      </div>`;
    }
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#17251F;border:1px solid #2C443B;border-radius:6px;">
      <tr><td style="padding:20px;">
        <div style="font:700 11px/1 Arial,sans-serif;color:#E0AC63;letter-spacing:1.7px;text-transform:uppercase;">${escapeHtml(label)}</div>
        <div style="font:700 22px/1.3 Georgia,serif;color:#F4EEE3;padding-top:11px;">${escapeHtml(title)}</div>
        ${paragraphs}${extras}
      </td></tr>
    </table>`;
  })();

  const html = `<!doctype html><html><body style="margin:0;background:#0E1A17;color:#DCD3C4;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(value.preheader?.trim() || `Admin proof for ${value.planWeekKey}`)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0E1A17;">
      <tr><td align="center" style="padding:28px 12px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">
          <tr><td style="padding:0 24px 16px;border-bottom:2px solid #E0AC63;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td width="44" style="width:44px;padding-right:12px;vertical-align:middle;"><img src="cid:${LOGO_CID}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border:0;"></td>
              <td style="vertical-align:middle;"><div style="font:700 13px/1 Arial,sans-serif;color:#F4EEE3;letter-spacing:2.6px;">CALGARY WATCH</div>
              <div style="font:400 11px/1 Arial,sans-serif;color:#A6B8AE;padding-top:7px;">Admin proof · ${escapeHtml(value.planWeekKey)}</div></td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:22px 24px 0;">
            <div style="font:700 11px/1 Arial,sans-serif;color:#A6B8AE;padding-bottom:10px;">Audience: ${escapeHtml(audienceLabel)}</div>
            ${opening}
          </td></tr>
          <tr><td style="padding:22px 24px 0;font:400 13px/1.55 Arial,sans-serif;color:#A6B8AE;">
            ${cancelled
              ? 'This is an administrator-only confirmation. Subscribers will receive the standard weekly brief with no optional opening note.'
              : `This is an administrator-only test. The contribution will appear first for ${escapeHtml(audienceLabel.toLowerCase())}; subscriber-specific reports follow underneath.`}
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
    `AUDIENCE: ${audienceLabel}`,
    title,
    '',
    plainFormatting(value.body.trim()),
    ...(value.byline?.trim() ? ['', value.byline.trim()] : []),
    ...(value.ctaLabel?.trim() && validHttpsUrl(value.ctaUrl) ? ['', `${value.ctaLabel.trim()}: ${validHttpsUrl(value.ctaUrl)}`] : []),
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
          reply_to: 'jorti104@mtroyal.ca',
          html: preview.html,
          text: preview.text,
          attachments: [logoAttachment()],
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

/**
 * Maintain the public resident-corroboration aggregate on an incident.
 *
 * Per-user feedback in incident_feedback is owner-private (its doc id is the
 * writer's uid), so the map cannot read it directly without leaking who said
 * what. This trigger recomputes counts-only fields on the incident document
 * whenever a feedback record changes — the public sees "Backed by 3 neighbours"
 * without seeing which neighbours. The reducer mirrors aggregateFeedback in
 * src/lib/feedback.ts; keep the two in sync.
 */
exports.onIncidentFeedbackWritten = onDocumentWritten('incident_feedback/{feedbackId}', async (event) => {
  const after = event.data && event.data.after && event.data.after.data();
  const before = event.data && event.data.before && event.data.before.data();
  const incidentId = (after && after.incidentId) || (before && before.incidentId);
  if (!incidentId) return;

  const db = getFirestore();
  const snapshot = await db.collection('incident_feedback').where('incidentId', '==', incidentId).get();

  let sawIt = 0;
  let stillHappening = 0;
  let resolved = 0;
  let lastActiveAt = null;
  snapshot.forEach((doc) => {
    const d = doc.data();
    if (d.kind === 'saw_it') sawIt += 1;
    else if (d.kind === 'still_happening') stillHappening += 1;
    else if (d.kind === 'resolved') resolved += 1;
    if (d.kind === 'saw_it' || d.kind === 'still_happening') {
      const t = typeof d.updatedAt === 'number' ? d.updatedAt : 0;
      lastActiveAt = lastActiveAt === null ? t : Math.max(lastActiveAt, t);
    }
  });
  const corroborations = sawIt + stillHappening;

  try {
    // update(), not set(merge): never conjure a phantom incident for feedback
    // that points at a browser-derived record which lives only in the API feed.
    await db.collection('incidents').doc(incidentId).update({
      feedback_corroborations: corroborations,
      feedback_disputed: corroborations > 0 && resolved > 0,
      feedback_resolved: resolved > 0 && resolved >= corroborations,
      feedback_last_active: lastActiveAt,
    });
    logger.info('Aggregated incident feedback', { incidentId, corroborations, resolved });
  } catch (error) {
    logger.warn('Feedback target incident not updatable', { incidentId, error: error instanceof Error ? error.message : String(error) });
  }
});
