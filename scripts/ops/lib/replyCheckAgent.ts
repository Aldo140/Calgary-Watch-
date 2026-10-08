// A copy of lib/hq/triageAgent.ts from Aldo140/ArctosLaunchpad (see replyCheck.ts).

import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { TRIAGE_SYSTEM, earlierCalls, linksIn, triageContext, triageKey, triageUserMessage, waitingReplies } from "./replyCheck";
import type { GmailReply, GmailSummary, GmailTriage, ReplyTriage } from "./replyCheck";

/**
 * The reply check (see lib/hq/triage.ts for what it decides and why). It runs
 * in the ops agents' hourly run (ops/reply-check.ts), which already has
 * ANTHROPIC_API_KEY, and also after each Gmail sync when that key is set on
 * Vercel. Each reply is checked once, and again only when new mail with that
 * person changes what the agent would see. Nothing here sends or changes mail.
 * No imports beyond the SDK and zod, so the ops runner can load it as is.
 */

/** Where verdicts live (arctos-hq hq/gmail-triage): Vercel and the ops run each bring their own access. */
export interface TriageStore {
  read(): Promise<GmailTriage | null>;
  write(triage: GmailTriage): Promise<void>;
}

const MODEL = "claude-opus-5-5";
/** Per sync; the rest wait for the next one, 15 minutes later. */
const PER_RUN = 8;
const PARALLEL = 4;

const Verdict = z.object({
  needsAction: z.boolean().describe("True when Aldo has to do something about this reply."),
  category: z.enum(["question", "request", "problem", "interested", "scheduling", "already-handled", "informational", "not-interested", "other"]),
  reason: z.string().describe("One or two plain sentences: why it does or doesn't need Aldo."),
  checks: z.array(z.string()).describe("What you verified and what you found. Empty if you verified nothing."),
  related: z.array(z.string()).describe("Other mail that changed your call, briefly (e.g. 'They wrote again on Oct 6 asking for rates'). Empty if none."),
  subtask: z
    .object({
      title: z.string().describe("The next step, starting with a verb, under 90 characters."),
      detail: z.string().describe("What it involves and anything it depends on, one to three sentences."),
      draftReply: z.string().nullable().describe("A short suggested reply when the next step is a reply, else null."),
    })
    .nullable()
    .describe("Required when needsAction is true; null otherwise."),
});

export const triageConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  client ??= new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
  return client;
}

/** "https://x.ca/rates answers 404" — whether a link they mention works right now. */
async function checkLink(url: string): Promise<string> {
  try {
    const r = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "ArctosHQ-reply-check" } });
    const to = r.headers.get("location");
    return `${url} answers ${r.status}${to ? ` (redirects to ${to})` : ""}`;
  } catch (e) {
    return `${url} didn't answer (${e instanceof Error ? e.name : "error"})`;
  }
}

async function decide(reply: GmailReply, context: string, earlier: string, fingerprint: string): Promise<ReplyTriage> {
  const theirs = (reply.thread ?? []).filter((m) => !m.ours).slice(-1)[0]?.text ?? reply.snippet;
  const checks = await Promise.all(linksIn(theirs, reply.from).map(checkLink));
  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 3000,
    output_config: { effort: "medium", format: betaZodOutputFormat(Verdict) },
    system: TRIAGE_SYSTEM,
    messages: [{ role: "user", content: triageUserMessage(context, earlier, checks) }],
  });
  const v = response.parsed_output;
  if (response.stop_reason === "refusal" || !v) throw new Error(`No verdict for ${reply.from} (${response.stop_reason}).`);
  const subtask = v.needsAction
    ? v.subtask ?? { title: `Answer ${reply.name || reply.from}`, detail: v.reason, draftReply: null }
    : null;
  return {
    key: triageKey(reply),
    url: reply.url,
    replyAt: reply.at,
    from: reply.from,
    at: Date.now(),
    fingerprint,
    needsAction: v.needsAction,
    category: v.category,
    reason: v.reason,
    checks: v.checks,
    related: v.related,
    subtask,
  };
}

/** The context minus its first line (today's date), so a check isn't redone just because a day passed. */
const digest = (context: string) => createHash("sha256").update(context.split("\n").slice(1).join("\n")).digest("hex").slice(0, 16);

/** Checks the replies that are new or whose surroundings changed, and saves every current verdict. */
export async function runTriage(gmail: GmailSummary, store: TriageStore, log: (m: string) => void = console.log): Promise<GmailTriage> {
  const now = Date.now();
  const previous = await store.read().catch(() => null);
  const known = new Map((previous?.items ?? []).map((t) => [t.key, t]));
  const waiting = waitingReplies(gmail).map(({ reply }) => {
    const context = triageContext(reply, gmail, now);
    return { reply, context, fingerprint: digest(context) };
  });

  const keep: ReplyTriage[] = [];
  const todo: typeof waiting = [];
  for (const w of waiting) {
    const had = known.get(triageKey(w.reply));
    if (had && had.fingerprint === w.fingerprint) keep.push(had);
    else {
      // Until it's checked again, the old call stands.
      if (had) keep.push(had);
      todo.push(w);
    }
  }

  let error: string | null = null;
  if (!triageConfigured()) error = "ANTHROPIC_API_KEY isn't set, so replies aren't checked.";
  else {
    const batch = todo.slice(0, PER_RUN);
    for (let i = 0; i < batch.length; i += PARALLEL) {
      const results = await Promise.allSettled(batch.slice(i, i + PARALLEL).map((w) => decide(w.reply, w.context, earlierCalls(w.reply, keep, now), w.fingerprint)));
      for (const r of results) {
        if (r.status === "fulfilled") {
          const at = keep.findIndex((k) => k.key === r.value.key);
          if (at >= 0) keep[at] = r.value;
          else keep.push(r.value);
        } else {
          error = r.reason instanceof Error ? r.reason.message : String(r.reason);
        }
      }
    }
    log(`[reply-check] checked ${batch.length} of ${todo.length} new or changed; ${waiting.length} waiting.`);
  }

  const out: GmailTriage = { at: now, items: keep, error };
  await store.write(out);
  return out;
}
