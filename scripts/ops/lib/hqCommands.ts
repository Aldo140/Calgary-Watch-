// Actions taken in HQ (arctoslaunchpad.com/hq) arrive as commands in the
// arctos-hq project (hq_commands). The ops runs apply them here with the same
// rules as /admin: a command only moves a post or lead from a state where a
// person could have made that change by hand. Pure: given the command and the
// current document, return the update or the reason it can't apply.

import type { OpsPost, PartnerLead } from '../../../src/types/ops';

export type HqCommandType =
  | 'approve-post' | 'reject-post' | 'redraft-post' | 'unschedule-post'
  | 'approve-pitch' | 'skip-pitch'
  | 'approve-reply' | 'handled-reply';

export interface HqCommand {
  id: string;
  type: HqCommandType;
  targetId: string;
  payload: { caption?: string; scheduledFor?: number; note?: string; subject?: string; body?: string };
  by: string;
  at: number;
}

export type Applied =
  | { ok: true; collection: 'ops_queue' | 'partner_leads'; update: Record<string, unknown>; event?: string }
  | { ok: false; reason: string };

const EDITABLE_POST = ['drafted', 'approved', 'failed', 'expired', 'rejected'];

export const isPostCommand = (t: HqCommandType) => t.endsWith('-post');

export function applyPostCommand(cmd: HqCommand, post: OpsPost | null, now: number): Applied {
  if (!post) return { ok: false, reason: 'That post no longer exists.' };
  const reviewed = { reviewedByEmail: `${cmd.by} (HQ)`, reviewedAt: now, updatedAt: now };
  const caption = cmd.payload.caption?.trim();
  switch (cmd.type) {
    case 'approve-post': {
      if (!EDITABLE_POST.includes(post.status)) return { ok: false, reason: `It is ${post.status} now, so it can't be approved.` };
      const when = cmd.payload.scheduledFor ?? post.scheduledFor ?? post.suggestedFor ?? now + 5 * 60_000;
      return { ok: true, collection: 'ops_queue', update: { status: 'approved', scheduledFor: Math.max(when, now), error: null, attempts: 0, ...(caption ? { caption } : {}), ...reviewed } };
    }
    case 'reject-post':
      if (!EDITABLE_POST.includes(post.status) || post.status === 'rejected') return { ok: false, reason: `It is ${post.status} now.` };
      return { ok: true, collection: 'ops_queue', update: { status: 'rejected', ...reviewed } };
    case 'redraft-post':
      if (!EDITABLE_POST.includes(post.status)) return { ok: false, reason: `It is ${post.status} now, so it can't be redrafted.` };
      return { ok: true, collection: 'ops_queue', update: { status: 'redraft', note: cmd.payload.note ?? post.note ?? '', ...reviewed } };
    case 'unschedule-post':
      if (post.status !== 'approved') return { ok: false, reason: `It is ${post.status} now, not scheduled.` };
      return { ok: true, collection: 'ops_queue', update: { status: 'drafted', scheduledFor: null, ...reviewed } };
    default:
      return { ok: false, reason: 'Not a post action.' };
  }
}

export function applyLeadCommand(cmd: HqCommand, lead: PartnerLead | null, now: number): Applied {
  if (!lead) return { ok: false, reason: 'That lead no longer exists.' };
  if (lead.doNotContact || lead.status === 'do-not-contact') return { ok: false, reason: 'They asked not to be contacted.' };
  const base = { reviewedByEmail: `${cmd.by} (HQ)`, updatedAt: now };
  switch (cmd.type) {
    case 'approve-pitch': {
      if (lead.status !== 'ready' && lead.status !== 'follow-up-ready') return { ok: false, reason: `It is ${lead.status} now.` };
      const subject = cmd.payload.subject?.trim() || lead.draftSubject;
      const body = cmd.payload.body?.trim() || lead.draftBody;
      if (!body) return { ok: false, reason: 'The email is empty.' };
      return { ok: true, collection: 'partner_leads', update: { status: 'approved', draftSubject: subject, draftBody: body, ...base }, event: `Approved to send to ${lead.contactEmail} (${cmd.by}, HQ)` };
    }
    case 'skip-pitch':
      if (lead.status !== 'ready' && lead.status !== 'follow-up-ready') return { ok: false, reason: `It is ${lead.status} now.` };
      return { ok: true, collection: 'partner_leads', update: { status: lead.status === 'follow-up-ready' ? 'no-response' : 'not-interested', ...base }, event: `Skipped (${cmd.by}, HQ)` };
    case 'approve-reply': {
      const r = lead.lastReply;
      if (!r || r.sent) return { ok: false, reason: 'There is no unanswered reply.' };
      const body = cmd.payload.body?.trim() || r.suggestedBody;
      if (!body) return { ok: false, reason: 'The reply is empty.' };
      return { ok: true, collection: 'partner_leads', update: { 'lastReply.suggestedBody': body, 'lastReply.approved': true, ...base }, event: `Reply approved (${cmd.by}, HQ)` };
    }
    case 'handled-reply':
      if (!lead.lastReply || lead.lastReply.sent) return { ok: false, reason: 'There is no unanswered reply.' };
      return { ok: true, collection: 'partner_leads', update: { 'lastReply.sent': true, ...base }, event: `Handled outside the agent (${cmd.by}, HQ)` };
    default:
      return { ok: false, reason: 'Not a lead action.' };
  }
}
