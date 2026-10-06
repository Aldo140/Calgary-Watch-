// Outreach sending through Resend (brand/outreach.json "transport": "resend").
// Used while Microsoft blocks outbound mail from the tenant (550 5.7.708). The
// message is from aldo@calgarywatch.ca with Reply-To the same mailbox, so replies
// still land in the Outlook inbox and syncReplies matches them by sender address.
// calgarywatch.ca is already a verified Resend domain (the ops digest uses it).

export const resendConfigured = () => Boolean(process.env.RESEND_API_KEY);

/** Send a plain-text message. The returned id stands in for an Outlook conversation id. */
export async function sendViaResend(
  from: { name: string; mailbox: string }, to: string, subject: string, text: string,
): Promise<{ conversationId: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: `${from.name} <${from.mailbox}>`, to: [to], reply_to: from.mailbox, subject, text }),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || !body.id) throw new Error(`Resend: ${body.message ?? body.name ?? res.status}`);
  return { conversationId: `resend:${body.id}` };
}
