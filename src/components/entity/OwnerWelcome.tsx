import { Link } from "react-router-dom";
import { ArrowUpRight, BadgeCheck, Check } from "lucide-react";
import { discoveryRepository } from "../../data/discovery";
import { PROFILE_STEPS, profileProgress, stepDone } from "../../lib/ownerProfileGuide";

/**
 * What a newly verified owner sees on their claim page: a warm "you're in",
 * how complete their page is, and the one next thing to do.
 */
export function OwnerWelcome({ orgId, title, query = "" }: { orgId: string; title: string; query?: string }) {
  const page = discoveryRepository.list().find((e) => e.id === orgId && e.kind === "business") as unknown as Record<string, unknown> | undefined;
  const progress = page ? profileProgress(page) : undefined;
  const sep = query ? "&" : "?";
  const go = (step?: string) => `/organization/${orgId}${query}${step ? `${sep}step=${step}` : ""}`;
  return (
    <section className="ow-welcome" aria-labelledby="ow-welcome-title">
      <p className="ow-welcome-badge">
        <BadgeCheck size={16} aria-hidden="true" /> Verified
      </p>
      <h2 id="ow-welcome-title">{title} is yours. Welcome aboard!</h2>
      <p>
        Your page now shows the Verified mark. Next, make it feel like you: your hours, how to reach you, and anything
        special going on. It takes about five minutes, and you’ll see a preview before anything goes live.
      </p>
      {page && progress ? (
        <ol className="ow-welcome-steps">
          {PROFILE_STEPS.map((s) => {
            const done = stepDone(s, page);
            return (
              <li key={s.id} data-done={done || undefined}>
                <Link to={go(s.id)}>
                  <span aria-hidden="true">{done ? <Check size={14} strokeWidth={3} /> : null}</span>
                  {done ? s.title : s.ask}
                </Link>
              </li>
            );
          })}
        </ol>
      ) : null}
      <div className="ow-welcome-acts">
        <Link className="pl-btn" to={go(progress?.next?.id)}>
          {progress?.next ? "Finish your page" : "Edit your page"} <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
        <Link className="pl-textbtn" to={`/organization/${orgId}${query}${sep}add=event`}>
          Add an event
        </Link>
      </div>
      <p className="ow-small">
        Your dashboard keeps all of this in one place. Questions? Reply to any of our emails, a real person reads them.
      </p>
    </section>
  );
}
