/**
 * Tells Aldo's HQ bot when CalgaryWatch outreach starts sending and how it
 * ended, the same texts the Arctos and Vow Motion sender gives. Signed in with
 * this run's GitHub OIDC token (arctoslaunchpad.com /api/hq/alerts/outreach
 * accepts ops-hourly.yml from this repository). Never throws; does nothing
 * outside GitHub Actions.
 */

const REPORT_URL = 'https://arctoslaunchpad.com/api/hq/alerts/outreach';

export interface OutreachReport {
  event: 'start' | 'done';
  planned?: number;
  sent?: string[];
  failed?: { business: string; error: string } | null;
  sentToday?: number;
  cap?: number;
  left?: number;
}

export async function reportOutreach(body: OutreachReport, log: (m: string) => void = console.log): Promise<void> {
  const { ACTIONS_ID_TOKEN_REQUEST_URL: url, ACTIONS_ID_TOKEN_REQUEST_TOKEN: bearer, GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  if (!url || !bearer) return;
  try {
    const oidc = (await fetch(`${url}&audience=arctos-hq-outreach`, { headers: { Authorization: `Bearer ${bearer}` } }).then(r => r.json())) as { value?: string };
    const runUrl = GITHUB_RUN_ID ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : undefined;
    const r = await fetch(REPORT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${oidc.value}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, campaign: 'calgarywatch', runUrl }),
    });
    if (!r.ok) log(`couldn't text Aldo about outreach (HTTP ${r.status})`);
  } catch (e) {
    log(`couldn't text Aldo about outreach: ${e instanceof Error ? e.message : e}`);
  }
}
