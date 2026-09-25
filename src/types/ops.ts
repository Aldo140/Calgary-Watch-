// Records for the operations agent: the Instagram post queue, partner leads and
// job health. Written by scripts/ops/* (GitHub Actions, admin SDK) and reviewed
// in the admin Operations and Partners workspaces. Nothing here is public.

export type BrandId = 'calgarywatch' | 'calgarydaily';

export type PostStatus =
  | 'requested'        // admin asked for a brief to be drafted (CalgaryDaily news)
  | 'drafted'          // waiting for review
  | 'redraft'          // reviewer asked for a new draft; the next run replaces it
  | 'approved'         // will publish at scheduledFor
  | 'published'
  | 'rejected'
  | 'needs-correction' // published, but the listing changed or was cancelled
  | 'expired'          // the date passed before it was approved or published
  | 'failed';          // publishing failed; see error

export type PostTemplate = 'event' | 'roundup' | 'update' | 'partner';

export interface PostImageText {
  eyebrow: string;
  headline: string;
  details: string[];
  footer: string;
}

export interface OpsPost {
  id: string;
  brand: BrandId;
  template: PostTemplate;
  status: PostStatus;
  /** Stable key so the same listing is never queued twice for the same date. */
  fingerprint: string;
  entityIds: string[];
  /** Start time of each listing when drafted, to notice later changes. */
  entityStarts: Record<string, string>;
  sourceUrls: string[];
  /** The facts the draft was written from, shown beside it for review. */
  facts: string;
  caption: string;
  altText: string;
  link: string;
  imageText: PostImageText;
  imageUrl: string | null;
  imagePath: string | null;
  warnings: string[];
  sponsored: boolean;
  /** Latest date the post is still useful (event start). Epoch ms. */
  relevantUntil: number | null;
  suggestedFor: number | null;
  scheduledFor: number | null;
  note?: string;
  /** For requested briefs: the page to draft from. */
  requestUrl?: string;
  draftedBy: 'claude' | 'template';
  createdAt: number;
  updatedAt: number;
  reviewedByEmail?: string | null;
  reviewedAt?: number | null;
  publishedAt?: number | null;
  igMediaId?: string | null;
  permalink?: string | null;
  correction?: string | null;
  error?: string | null;
  attempts?: number;
  /** Set while a publish is in flight so an overlapping run can't post twice. */
  publishingAt?: number | null;
}

export type LeadStatus =
  | 'new'            // found, not yet researched
  | 'no-email'       // no published address found; needs a contact form or manual research
  | 'blocked'        // the site asks not to be solicited, or a rule failed
  | 'ready'          // pitch drafted, waiting for approval
  | 'approved'       // approved; the sender will send in the next window
  | 'contacted'
  | 'follow-up-ready'
  | 'replied'
  | 'interested'
  | 'claimed'
  | 'partner'
  | 'not-interested'
  | 'no-response'
  | 'do-not-contact';

export type ReplyClass = 'interested' | 'question' | 'not-now' | 'stop' | 'auto-reply' | 'other';

export interface LeadEvent {
  at: number;
  type: 'found' | 'drafted' | 'approved' | 'sent' | 'reply' | 'reply-sent' | 'status' | 'imported' | 'note';
  summary: string;
}

export interface PartnerLead {
  id: string;
  /** Discovery entity this business entered the graph through, when there is one. */
  entityId: string | null;
  entityKind: string | null;
  businessName: string;
  category: string;
  neighbourhood: string;
  website: string | null;
  contactName: string | null;
  contactRole: string | null;
  contactEmail: string | null;
  /** CASL evidence: where the address is published, when we saw it, and why it's relevant. */
  emailSourceUrl: string | null;
  emailFoundAt: number | null;
  consentBasis: string | null;
  noSolicitationNotice: boolean;
  reasonRelevant: string;
  status: LeadStatus;
  draftSubject: string;
  draftBody: string;
  followUps: number;
  lastContactAt: number | null;
  nextFollowUpAt: number | null;
  conversationId: string | null;
  lastReply?: {
    at: number;
    from: string;
    subject: string;
    text: string;
    classification: ReplyClass;
    suggestedSubject: string;
    suggestedBody: string;
    /** Set by the reviewer to have the sender reply with suggestedBody. */
    approved: boolean;
    sent: boolean;
  } | null;
  doNotContact: boolean;
  notes: string;
  importedFrom?: string | null;
  /** Outlook message ids already processed, so a reply is never handled twice. */
  replyIds?: string[];
  history: LeadEvent[];
  createdAt: number;
  updatedAt: number;
  reviewedByEmail?: string | null;
}

export interface OpsHealth {
  checkedAt: number;
  items: Array<{ id: string; label: string; ok: boolean; detail: string }>;
}
