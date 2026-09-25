// Outreach mail goes out 1:1 from the real Outlook mailbox (aldo@calgarywatch.ca)
// through Microsoft Graph, so it lands in Sent Items and replies thread normally.
// App-only auth: an Entra app with Mail.Send + Mail.ReadWrite application
// permissions, ideally restricted to this one mailbox (see docs/operations-agent.md).

const GRAPH = 'https://graph.microsoft.com/v1.0';

export const outlookConfigured = () => Boolean(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);

let cached: { token: string; until: number } | null = null;
async function token(): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const res = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!, client_secret: process.env.MS_CLIENT_SECRET!,
      scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
    }),
  });
  const body: any = await res.json();
  if (!res.ok) throw new Error(`Microsoft sign-in failed: ${body.error_description ?? body.error ?? res.status}`);
  cached = { token: body.access_token, until: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

async function call(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 202 || res.status === 204) return null;
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Outlook: ${body.error?.message ?? res.status}`);
  return body;
}

const mailbox = () => encodeURIComponent(process.env.OUTREACH_MAILBOX || 'aldo@calgarywatch.ca');

/** Send a new plain-text message. Returns the conversation id used to match replies. */
export async function sendNew(to: string, subject: string, text: string): Promise<{ conversationId: string }> {
  const draft = await call(`/users/${mailbox()}/messages`, {
    method: 'POST',
    body: JSON.stringify({ subject, body: { contentType: 'Text', content: text }, toRecipients: [{ emailAddress: { address: to } }] }),
  });
  await call(`/users/${mailbox()}/messages/${draft.id}/send`, { method: 'POST' });
  return { conversationId: draft.conversationId };
}

/** Reply in the existing thread to the business's latest message (never to our own sent copy). */
export async function replyInThread(conversationId: string, text: string): Promise<void> {
  const own = decodeURIComponent(mailbox()).toLowerCase();
  const recent = await call(`/users/${mailbox()}/messages?$filter=${encodeURIComponent(`conversationId eq '${conversationId}'`)}&$top=25&$select=id,from,receivedDateTime`);
  const theirs = (recent.value ?? [])
    .filter((m: any) => String(m.from?.emailAddress?.address ?? '').toLowerCase() !== own)
    .sort((a: any, b: any) => Date.parse(b.receivedDateTime) - Date.parse(a.receivedDateTime));
  const id = theirs[0]?.id;
  if (!id) throw new Error('Outlook: conversation not found for reply.');
  await call(`/users/${mailbox()}/messages/${id}/reply`, { method: 'POST', body: JSON.stringify({ comment: text }) });
}

export interface InboundMessage { id: string; conversationId: string; from: string; subject: string; text: string; receivedAt: number }

/** Inbox messages received since `since`, newest last. */
export async function inboxSince(since: number): Promise<InboundMessage[]> {
  const filter = encodeURIComponent(`receivedDateTime ge ${new Date(since).toISOString()}`);
  const out: InboundMessage[] = [];
  let next: string | null = `/users/${mailbox()}/mailFolders/inbox/messages?$filter=${filter}&$orderby=receivedDateTime asc&$top=50&$select=id,conversationId,from,subject,body,receivedDateTime`;
  while (next && out.length < 500) {
    const page = await call(next, { headers: { Prefer: 'outlook.body-content-type="text"' } });
    for (const m of page.value ?? []) {
      out.push({
        id: m.id, conversationId: m.conversationId, from: String(m.from?.emailAddress?.address ?? '').toLowerCase(),
        subject: m.subject ?? '', text: String(m.body?.content ?? '').slice(0, 20_000), receivedAt: Date.parse(m.receivedDateTime),
      });
    }
    next = page['@odata.nextLink'] ? String(page['@odata.nextLink']).replace(GRAPH, '') : null;
  }
  return out;
}
