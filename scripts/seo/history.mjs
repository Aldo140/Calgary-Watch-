import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(
  await readFile(resolve(repoRoot, 'docs/seo/experiments.json'), 'utf8'),
);
const trackedPaths = [
  'index.html',
  'public/sitemap.xml',
  'public/robots.txt',
  'scripts/seo',
  'src/lib/seo.ts',
  'src/components/SeoManager.tsx',
  'src/pages/LandingPage.tsx',
  'src/pages/NeighbourhoodWatchGuidePage.tsx',
  'src/pages/AirdrieCrimeMapPage.tsx',
];

console.log('Active SEO experiments');
for (const experiment of manifest.experiments.filter(({ status }) =>
  ['awaiting_deployment', 'active'].includes(status),
)) {
  console.log(`- ${experiment.id} [${experiment.status}]`);
  console.log(`  Routes: ${experiment.routes.join(', ')}`);
  console.log(`  Hypothesis: ${experiment.hypothesis}`);
}

console.log('\nCommits touching tracked SEO surfaces');
const history = execFileSync(
  'git',
  [
    'log',
    '--date=short',
    '--pretty=format:%h  %ad  %s',
    '-n',
    '30',
    '--',
    ...trackedPaths,
  ],
  { cwd: repoRoot, encoding: 'utf8' },
).trim();
console.log(history || '(none)');

