// HQ's reply check (arctoslaunchpad.com/hq): which Gmail replies need Aldo. A
// copy of lib/hq/triage.ts and the types it uses from Aldo140/ArctosLaunchpad,
// kept here so the hourly run's Claude key only ever runs this repository's
// code. Keep it in step with that file until the agents move to Arctos.

// ---- Types (lib/hq/types.ts) ----

export type Business = "calgarywatch" | "calgarydaily" | "vowmotion" | "arctos";

/**
 * What the Gmail sync (ops/gmail/hq-sync.gs, an Apps Script inside
 * mrotiz14@gmail.com) reports every 15 minutes: sends from each send-as
 * address and the replies to them, last 30 days. Replies carry a short
 * snippet; unanswered real replies also carry their conversation (see thread).
 */
export type MailBusiness = Business | "other";

export type ReplyKind = "reply" | "auto" | "optout" | "bounce";

export interface GmailSend {
  at: number;
  alias: string;
  /** The business the message is about (named in it), not necessarily its address's. */
  business: MailBusiness;
  to: string;
  domain: string;
  subject: string;
  /** First message of its thread: a pitch, not a reply to someone. */
  first: boolean;
  /** Sent from this other business's address by mistake (Gmail's default send-as). */
  wrongAlias: MailBusiness | null;
  replied: boolean;
  url: string;
}

export interface GmailReply {
  at: number;
  alias: string;
  business: MailBusiness;
  from: string;
  name: string;
  subject: string;
  snippet: string;
  kind: ReplyKind;
  /** A reply to one of our pitches (the thread started with us). */
  toPitch: boolean;
  answered: boolean;
  url: string;
  /**
   * The conversation around a real reply nobody has answered yet: our first
   * message and the latest few, each cut to its new text. Only the newest
   * unanswered reply in a thread carries it; the reply check reads it.
   */
  thread?: ThreadMessage[];
}

export interface ThreadMessage {
  at: number;
  /** Sent by us (any of our addresses). */
  ours: boolean;
  from: string;
  text: string;
}

export interface GmailSummary {
  generatedAt: number;
  account: string;
  days: number;
  sends: GmailSend[];
  replies: GmailReply[];
}

/**
 * The reply check: before a Gmail reply reaches the board, an agent reads the
 * thread and what else is going on with that sender and decides whether it
 * needs Aldo. Replies that do get a proposed subtask he approves or waves off;
 * the rest stay off the board (listed under "Filtered out" with the reason).
 * Written to arctos-hq hq/gmail-triage by /api/hq/ingest/gmail.
 */
export type TriageCategory = "question" | "request" | "problem" | "interested" | "scheduling" | "already-handled" | "informational" | "not-interested" | "other";

export interface ReplyTriage {
  /** The thread and its newest reply: a new reply in the thread is a new key, and a fresh check. */
  key: string;
  url: string;
  replyAt: number;
  from: string;
  /** When the agent decided. */
  at: number;
  /** A digest of what it decided on; when that changes (new mail with them), it checks again. */
  fingerprint: string;
  needsAction: boolean;
  category: TriageCategory;
  /** Why, in a sentence or two. */
  reason: string;
  /** What it verified and what it found (e.g. "aldo@… link answers 200"). */
  checks: string[];
  /** Other mail that shaped the call: an earlier thread, a later follow-up, an auto-reply. */
  related: string[];
  subtask: { title: string; detail: string; draftReply: string | null } | null;
}

export interface GmailTriage {
  at: number;
  items: ReplyTriage[];
  /** The last run's problem, if it had one (e.g. no API key). */
  error: string | null;
}

export type TriageDecisionKind = "approved" | "dismissed" | "reopened" | "done";

export interface TriageDecision {
  key: string;
  decision: TriageDecisionKind;
  /** The subtask as approved (Aldo can reword it). */
  title: string | null;
  by: string;
  at: number;
}

// ---- Logic (lib/hq/triage.ts) ----

/**
 * The reply check, minus the network: which Gmail replies get checked, what
 * the agent is shown about each one, and where each lands on the board once
 * it has decided and Aldo has (or hasn't) approved. Shared by the ingest route
 * (which runs the agent) and the dashboard.
 */

const DAY = 86_400_000;

/** Gmail's thread id, from the link the sync stores. */
export const threadIdOf = (url: string) => url.split("/").pop() ?? url;

/** A thread and its newest reply. A later reply in the thread gets a new key and a fresh check. */
export const triageKey = (r: Pick<GmailReply, "url" | "at">) => `${threadIdOf(r.url)}-${r.at}`.replace(/[^\w-]/g, "_");

/** Real answers to our pitches nobody has answered yet, newest reply per thread only. */
export function waitingReplies(gmail: GmailSummary | null): Array<{ reply: GmailReply; earlier: number }> {
  const byThread = new Map<string, GmailReply[]>();
  for (const r of gmail?.replies ?? []) {
    if (r.kind !== "reply" || !r.toPitch || r.answered) continue;
    byThread.set(r.url, [...(byThread.get(r.url) ?? []), r]);
  }
  return [...byThread.values()]
    .map((rs) => {
      const sorted = [...rs].sort((a, b) => b.at - a.at);
      return { reply: sorted[0], earlier: sorted.length - 1 };
    })
    .sort((a, b) => b.reply.at - a.reply.at);
}

/**
 * Where a waiting reply stands.
 * - unchecked: the agent hasn't looked yet (or isn't set up), so it shows as before.
 * - proposed: it needs you; the agent proposes a subtask for you to approve.
 * - approved: you approved the subtask; it stays until done or answered in Gmail.
 * - reopened: the agent said no action, you put it back.
 * - filtered: no action needed (the agent's call, or you waved the subtask off).
 * - done: you finished the subtask.
 */
export type BoardState = "unchecked" | "proposed" | "approved" | "reopened" | "filtered" | "done";

export function boardState(triage: ReplyTriage | undefined, decision: TriageDecision | undefined): BoardState {
  if (decision?.decision === "done") return "done";
  if (decision?.decision === "dismissed") return "filtered";
  if (decision?.decision === "approved") return "approved";
  if (decision?.decision === "reopened") return "reopened";
  if (!triage) return "unchecked";
  return triage.needsAction ? "proposed" : "filtered";
}

export const ON_BOARD: BoardState[] = ["unchecked", "proposed", "approved", "reopened"];

export interface BoardItem {
  reply: GmailReply;
  /** Earlier unanswered replies in the same thread, folded into this one. */
  earlier: number;
  triage: ReplyTriage | undefined;
  decision: TriageDecision | undefined;
  state: BoardState;
}

export function replyBoard(
  data: { gmail: GmailSummary | null; triage?: { items: ReplyTriage[] } | null; decisions?: TriageDecision[] },
  include: (r: GmailReply) => boolean = () => true,
): { board: BoardItem[]; filtered: BoardItem[] } {
  const triage = new Map((data.triage?.items ?? []).map((t) => [t.key, t]));
  const decisions = new Map<string, TriageDecision>();
  for (const d of [...(data.decisions ?? [])].sort((a, b) => a.at - b.at)) decisions.set(d.key, d);
  const items = waitingReplies(data.gmail)
    .filter(({ reply }) => include(reply))
    .map(({ reply, earlier }) => {
      const key = triageKey(reply);
      const t = triage.get(key);
      const d = decisions.get(key);
      return { reply, earlier, triage: t, decision: d, state: boardState(t, d) };
    });
  return { board: items.filter((i) => ON_BOARD.includes(i.state)), filtered: items.filter((i) => i.state === "filtered") };
}

const FREEMAIL = /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac|aol|proton|protonmail|shaw|telus)\./i;
const domainOf = (address: string) => address.split("@")[1]?.toLowerCase() ?? "";
/** Two addresses belong to the same organisation: same address, or the same non-webmail domain. */
export function sameParty(a: string, b: string): boolean {
  if (a.toLowerCase() === b.toLowerCase()) return true;
  const da = domainOf(a);
  return Boolean(da) && da === domainOf(b) && !FREEMAIL.test(da);
}

const OUR_SITES = ["arctoslaunchpad.com", "vowmotionweddings.com", "calgarywatch.ca"];

/**
 * Links in their text the agent can check, up to three: only our own sites and
 * the sender's (so a reply can't point the check anywhere else).
 */
export function linksIn(text: string, sender = ""): string[] {
  const theirs = domainOf(sender);
  const allowed = [...OUR_SITES, ...(theirs && !FREEMAIL.test(theirs) ? [theirs] : [])];
  const found = text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [];
  return [...new Set(found.map((u) => u.replace(/[.,;:!?]+$/, "")))]
    .filter((u) => {
      try {
        const host = new URL(u).hostname.toLowerCase();
        return allowed.some((d) => host === d || host.endsWith(`.${d}`));
      } catch {
        return false;
      }
    })
    .slice(0, 3);
}

const fmt = (t: number) => new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC";

/**
 * Everything the agent is shown about one reply, as plain text: the
 * conversation, then every other piece of mail with the same person or
 * organisation in the sync's 30 days (earlier threads, follow-ups we sent
 * elsewhere, auto-replies, opt-outs, bounces). Its digest is the fingerprint:
 * new related mail means a fresh check.
 */
export function triageContext(reply: GmailReply, gmail: GmailSummary, now: number): string {
  const lines: string[] = [];
  lines.push(`Today: ${fmt(now)}`);
  lines.push(`Business: ${reply.business}. Our address on this thread: ${reply.alias}.`);
  lines.push(`Reply from: ${reply.name ? `${reply.name} <${reply.from}>` : reply.from}, ${fmt(reply.at)}`);
  lines.push(`Subject: ${reply.subject}`);
  lines.push("");
  lines.push("## The conversation (oldest first; each message cut to its new text)");
  const thread = reply.thread?.length ? reply.thread : [{ at: reply.at, ours: false, from: reply.from, text: reply.snippet }];
  for (const m of thread) lines.push(`- ${fmt(m.at)} · ${m.ours ? "US" : "THEM"} (${m.from}): ${m.text}`);
  if (!reply.thread?.length) lines.push("(Only a short snippet of their reply is available; the rest of the thread wasn't sent.)");

  const id = threadIdOf(reply.url);
  const otherReplies = gmail.replies.filter((r) => threadIdOf(r.url) !== id && sameParty(r.from, reply.from));
  const otherSends = gmail.sends.filter((s) => threadIdOf(s.url) !== id && sameParty(s.to, reply.from));
  lines.push("");
  lines.push("## Other mail with the same person or organisation, last 30 days");
  if (!otherReplies.length && !otherSends.length) lines.push("None.");
  const other = [
    ...otherReplies.map((r) => ({ at: r.at, text: `THEM (${r.from}) · ${r.kind}${r.kind === "reply" ? (r.answered ? ", we answered" : ", not answered") : ""} · "${r.subject}": ${r.snippet}` })),
    ...otherSends.map((s) => ({ at: s.at, text: `US to ${s.to} · ${s.first ? "new thread" : "reply in a thread"} · "${s.subject}"${s.replied ? " · they replied" : ""}` })),
  ].sort((a, b) => a.at - b.at);
  for (const o of other.slice(-15)) lines.push(`- ${fmt(o.at)} · ${o.text}`);

  return lines.join("\n");
}

/** The agent's own earlier calls on this person's other replies, so related threads are judged together. */
export function earlierCalls(reply: GmailReply, checked: ReplyTriage[], now: number): string {
  const calls = checked.filter((t) => t.key !== triageKey(reply) && sameParty(t.from, reply.from) && t.at > now - 30 * DAY);
  if (!calls.length) return "";
  return ["## Your earlier calls on their other replies", ...calls.slice(0, 5).map((t) => `- ${fmt(t.replyAt)} · ${t.needsAction ? `needs action: ${t.subtask?.title ?? t.reason}` : `no action: ${t.reason}`}`)].join("\n");
}

export const TRIAGE_SYSTEM = `You are the first read on email replies for Aldo, who runs four small Calgary businesses: CalgaryWatch (a local news and events site), CalgaryDaily (its Instagram), Vow Motion (wedding videography) and Arctos Launchpad (a web studio). Aldo pitched these people; they wrote back. You decide whether a reply needs Aldo to do something, so his board only shows what does.

Work it out in this order:
1. Read the whole conversation, not just the last message. A reply often only makes sense against what we said before it ("yes, Thursday works" answers a question we asked; "never mind, sorted" closes an earlier request).
2. Check the other mail with the same person or organisation. They may have written again in another thread, we may already have followed up somewhere else, an auto-reply may say they're away until a date, or they may have opted out. If a later message settles this one, it needs no action.
3. Validate any claim you can. If they report a problem (a broken link, a wrong name, a site down), use the link checks you're given: a link that now answers fine means the problem is already fixed or wasn't one, and say so. If you can't verify it, say that rather than assuming either way.
4. Decide. It needs action when Aldo has to answer, decide, fix, send, schedule or follow up: a question, a request, interest, a scheduling detail, a real problem. It needs no action when it is purely informational, a thank-you with nothing open, a polite no, already handled elsewhere, or a problem that checks out as fixed. When it is genuinely unclear, choose action: a missed customer costs more than one extra item on the board.

When it needs action, propose one subtask: the concrete next step, starting with a verb, in Aldo's words (e.g. "Send Ramsay Coffee the Thursday 2 pm slot and the rate card"). Put any dependency in the detail (e.g. "wait until the venue confirms, they said they'd know Friday"). Offer a short draft reply only when the next step is a reply; it is a suggestion Aldo edits and sends himself, so write it plainly, in his voice, no sign-off. Nothing you write is sent automatically.

Keep reason to one or two plain sentences. List in checks only what you actually verified and what you found, and in related only the other mail that changed your call.`;

export function triageUserMessage(context: string, earlier: string, linkChecks: string[]): string {
  return `${context}${earlier ? `\n\n${earlier}` : ""}\n\n## Link checks (fetched just now)\n${linkChecks.length ? linkChecks.map((c) => `- ${c}`).join("\n") : "No links in their message."}`;
}
