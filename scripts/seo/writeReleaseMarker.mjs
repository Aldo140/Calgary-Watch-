import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = resolve(repoRoot, 'docs/seo/experiments.json');
const outputPath = resolve(repoRoot, 'dist/seo-release.json');
const trackedPaths = [
  'src/lib/seo.ts',
  'src/components/SeoManager.tsx',
  'scripts/seo/prerender.ts',
  'scripts/seo/rewriteHtml.ts',
  'public/sitemap.xml',
  'public/robots.txt',
  'docs/seo/experiments.json',
];

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim() || fallback;
  } catch {
    return fallback;
  }
}

async function fingerprintFiles(paths) {
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(`${path}\0`);
    hash.update(await readFile(resolve(repoRoot, path)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const activeExperiments = manifest.experiments
  .filter((experiment) => ['awaiting_deployment', 'active'].includes(experiment.status))
  .map((experiment) => ({
    id: experiment.id,
    status: experiment.status,
    routes: experiment.routes,
    targetQueries: experiment.targetQueries ?? [],
  }));
const commit = process.env.GITHUB_SHA || git(['rev-parse', 'HEAD'], 'unknown');
const latestSeoCommit = git([
  'log',
  '-1',
  '--format=%H',
  '--',
  ...trackedPaths.filter((path) => path !== 'docs/seo/experiments.json'),
], commit);

const marker = {
  schemaVersion: 1,
  site: manifest.site,
  commit,
  shortCommit: commit.slice(0, 7),
  builtAt: new Date().toISOString(),
  latestSeoCommit,
  seoFingerprint: await fingerprintFiles(trackedPaths),
  activeExperiments,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
console.log(`[seo] Release marker ${marker.shortCommit} → dist/seo-release.json`);
