// Notes Aldo gives the Instagram agent from Telegram (/ig, ArctosLaunchpad's
// HQ bot), kept in arctos-hq hq_ig_notes. The hq-commands step copies them to
// ops_health/ig_notes, where the coordinator and the caption writer read them.
// A note with a link also becomes a brief: a post drafted from that page.
// Pure, so it is tested.

export interface IgNote { id: string; text: string; at: number }

export const IG_NOTES_DOC = 'ig_notes';

/** The first link in a note, if any. */
export const noteLink = (text: string): string | null => text.match(/https?:\/\/[^\s<>"]+/)?.[0]?.replace(/[).,]+$/, '') ?? null;

/** True when the set of notes changed (added, removed or edited), so the week gets replanned. */
export function notesChanged(prev: IgNote[], next: IgNote[]): boolean {
  const key = (ns: IgNote[]) => ns.map(n => `${n.id}:${n.text}`).sort().join('|');
  return key(prev) !== key(next);
}

/** Notes with a link that haven't been turned into a brief yet. */
export const newBriefs = (notes: IgNote[], briefed: string[]): Array<IgNote & { url: string }> =>
  notes.flatMap(n => { const url = noteLink(n.text); return url && !briefed.includes(n.id) ? [{ ...n, url }] : []; });

/** The notes as lines for a prompt, newest first. */
export const notesForPrompt = (notes: IgNote[]): string | null =>
  notes.length ? [...notes].sort((a, b) => b.at - a.at).map(n => `- ${n.text}`).join('\n') : null;
