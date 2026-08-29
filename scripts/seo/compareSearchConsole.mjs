import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    args[token.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

export function parseCsv(input) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const source = input.replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter((item) => item.some(Boolean));
}

function number(value) {
  const normalized = String(value ?? '').replace(/[% ,]/g, '');
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDelta(current, previous, digits = 0, suffix = '') {
  const delta = current - previous;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(digits)}${suffix}`;
}

function commitRows(commits) {
  return commits.map((commit) => {
    const summary = execFileSync(
      'git',
      ['show', '-s', '--date=short', '--format=%h|%ad|%s', commit],
      { cwd: repoRoot, encoding: 'utf8' },
    ).trim();
    const [sha, date, subject] = summary.split('|');
    return `| \`${sha}\` | ${date} | ${subject} |`;
  });
}

const args = parseArgs(process.argv.slice(2));
if (!args.csv || !args.experiment) {
  console.error('Usage: npm run seo:compare -- --csv <queries.csv> --experiment <experiment-id> [--out report.md]');
  process.exit(1);
}

const manifest = JSON.parse(
  await readFile(resolve(repoRoot, 'docs/seo/experiments.json'), 'utf8'),
);
const experiment = manifest.experiments.find(({ id }) => id === args.experiment);
if (!experiment) {
  console.error(`Unknown experiment: ${args.experiment}`);
  process.exit(1);
}

const csv = parseCsv(await readFile(resolve(process.cwd(), args.csv), 'utf8'));
const headers = csv[0];
const periods = [];
const columns = new Map();
for (let index = 1; index < headers.length; index += 1) {
  const match = headers[index].match(/^(.*?)\s+(Clicks|Impressions|CTR|Position)$/i);
  if (!match) continue;
  const [, period, metric] = match;
  if (!periods.includes(period)) periods.push(period);
  columns.set(`${period}:${metric.toLowerCase()}`, index);
}
if (periods.length !== 2) {
  console.error('Expected a Search Console comparison CSV containing exactly two date periods.');
  process.exit(1);
}

const [currentPeriod, previousPeriod] = periods;
const records = new Map(
  csv.slice(1).map((row) => [String(row[0] ?? '').trim().toLowerCase(), row]),
);
const targets = experiment.targetQueries ?? [];
const metricRows = [];
for (const query of targets) {
  const row = records.get(query.toLowerCase());
  if (!row) {
    metricRows.push(`| ${query} | — | — | Not present in export |`);
    continue;
  }
  const read = (period, metric) => number(row[columns.get(`${period}:${metric}`)]);
  const currentClicks = read(currentPeriod, 'clicks');
  const previousClicks = read(previousPeriod, 'clicks');
  const currentImpressions = read(currentPeriod, 'impressions');
  const previousImpressions = read(previousPeriod, 'impressions');
  const currentCtr = read(currentPeriod, 'ctr');
  const previousCtr = read(previousPeriod, 'ctr');
  const currentPosition = read(currentPeriod, 'position');
  const previousPosition = read(previousPeriod, 'position');
  metricRows.push(
    `| ${query} | ${previousClicks}/${previousImpressions}, ${previousCtr.toFixed(2)}%, pos ${previousPosition.toFixed(2)} | ${currentClicks}/${currentImpressions}, ${currentCtr.toFixed(2)}%, pos ${currentPosition.toFixed(2)} | clicks ${formatDelta(currentClicks, previousClicks)}, impressions ${formatDelta(currentImpressions, previousImpressions)}, CTR ${formatDelta(currentCtr, previousCtr, 2, 'pp')}, position ${formatDelta(currentPosition, previousPosition, 2)} |`,
  );
}
const associatedCommits = experiment.commits.length
  ? commitRows(experiment.commits)
  : ['| — | — | Copy the production SHA from `/seo-release.json` into this experiment after deployment. |'];

const output = [
  `# SEO impact — ${experiment.id}`,
  '',
  `Hypothesis: ${experiment.hypothesis}`,
  '',
  `Comparison: ${previousPeriod} → ${currentPeriod}`,
  '',
  '## Target-query metrics',
  '',
  `| Query | ${previousPeriod} | ${currentPeriod} | Delta |`,
  '| --- | ---: | ---: | --- |',
  ...metricRows,
  '',
  'Clicks/impressions are shown together. Position is lower-is-better. A positive position delta therefore means ranking became worse.',
  '',
  '## Associated commits',
  '',
  '| Commit | Date | Change |',
  '| --- | --- | --- |',
  ...associatedCommits,
  '',
  '## Attribution note',
  '',
  experiment.measurement?.limitations ?? 'Treat before/after movement as association unless the release and measurement windows form a clean experiment.',
  '',
].join('\n');

if (args.out) {
  const outputPath = resolve(process.cwd(), args.out);
  await writeFile(outputPath, output, 'utf8');
  console.log(`[seo] Comparison report → ${outputPath}`);
} else {
  console.log(output);
}
