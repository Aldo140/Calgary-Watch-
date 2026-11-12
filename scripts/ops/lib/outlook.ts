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
  // Graph sometimes answers with an empty message (e.g. 500 UnknownError), so always name the status and code.
  if (!res.ok) throw new Error(`Outlook: ${res.status} ${body.error?.code ?? ''} ${body.error?.message || ''}`.trim());
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

/**
 * Inbox messages received since `since`, newest last.
 * Lists ids first, then reads each body on its own: Graph can fail a whole page
 * (500 with an empty message) when one message's body won't convert to text, and
 * that used to stop every reply from being matched.
 */
export async function inboxSince(since: number): Promise<InboundMessage[]> {
  const filter = encodeURIComponent(`receivedDateTime ge ${new Date(since).toISOString()}`);
  const out: InboundMessage[] = [];
  let next: string | null = `/users/${mailbox()}/mailFolders/inbox/messages?$filter=${filter}&$orderby=receivedDateTime asc&$top=50&$select=id,conversationId,from,subject,bodyPreview,receivedDateTime`;
  while (next && out.length < 500) {
    const page = await call(next);
    for (const m of page.value ?? []) {
      out.push({
        id: m.id, conversationId: m.conversationId, from: String(m.from?.emailAddress?.address ?? '').toLowerCase(),
        subject: m.subject ?? '', text: await messageText(m.id, String(m.bodyPreview ?? '')), receivedAt: Date.parse(m.receivedDateTime),
      });
    }
    next = page['@odata.nextLink'] ? String(page['@odata.nextLink']).replace(GRAPH, '') : null;
  }
  return out;
}

/** One message's body as text; falls back to the HTML body with tags stripped, then to the preview. */
async function messageText(id: string, preview: string): Promise<string> {
  const path = `/users/${mailbox()}/messages/${encodeURIComponent(id)}?$select=body`;
  try {
    const m = await call(path, { headers: { Prefer: 'outlook.body-content-type="text"' } });
    return String(m.body?.content ?? '').slice(0, 20_000);
  } catch {
    try {
      const m = await call(path);
      const html = String(m.body?.content ?? '');
      return html.replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20_000);
    } catch {
      return preview;
    }
  }
}

/** Explicitly read-only mailbox audit for owner-requested partner conversations, including Sent Items. */
export async function readPartnerConversations(search:string){
 const select='id,conversationId,from,toRecipients,ccRecipients,subject,body,receivedDateTime,sentDateTime,isDraft,hasAttachments';
 const first=await call(`/users/${mailbox()}/messages?${new URLSearchParams({'$search':`"${search.replace(/["\\]/g,'')}"`,'$top':'100','$select':select})}`);
 const conversations=[...new Set<string>((first.value??[]).filter((m:any)=>!m.isDraft).map((m:any)=>String(m.conversationId)))];
 const messages:any[]=[];let truncated=Boolean(first['@odata.nextLink']);
 for(const conversation of conversations.slice(0,30)){
  let next:string|null=`/users/${mailbox()}/messages?${new URLSearchParams({'$filter':`conversationId eq '${conversation.replace(/'/g,"''")}'`,'$top':'100','$select':select})}`;
  let pages=0;
  while(next&&pages++<10){const page=await call(next);for(const m of page.value??[])if(!m.isDraft)messages.push(m);const link=page['@odata.nextLink'];next=typeof link==='string'&&link.startsWith(GRAPH+'/')?link.slice(GRAPH.length):null;}
  if(next)truncated=true;
 }
 return {search,truncated:truncated||conversations.length>30,messages:[...new Map(messages.map(m=>[m.id,m])).values()].sort((a,b)=>Date.parse(a.sentDateTime)-Date.parse(b.sentDateTime))};
}
