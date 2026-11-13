const MINUTE = 60_000;

const expectedMinutes: Record<string, number> = {
  calgary_311: 90, calgary_police_news: 90, environment_canada: 90,
  alberta_emergency: 90, global_news: 90, enmax_outages: 30,
  discovery_ingest: 13 * 60, discovery_publication: 13 * 60,
};
const optionalMinutes: Record<string, number> = { alberta_511: 90, aggregate_traffic_flow: 30 };

export interface FeedHealth { status?: string; lastSuccessAt?: number }

export function feedProblems(feeds: ReadonlyMap<string, FeedHealth>, now: number): string[] {
  const problems: string[] = [];
  const ids = new Set([...Object.keys(expectedMinutes), ...feeds.keys()]);
  for (const id of ids) {
    const feed = feeds.get(id);
    if (feed?.status === 'disabled' || feed?.status === 'unconfigured') continue;
    const maxAge = (expectedMinutes[id] ?? optionalMinutes[id]) * MINUTE;
    if (maxAge && (!feed?.lastSuccessAt || now - feed.lastSuccessAt > maxAge)) {
      problems.push(id + " has no recent successful publication");
    } else if (feed?.status === 'error') {
      problems.push(id + " reported an error");
    }
  }
  return problems;
}
