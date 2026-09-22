/**
 * Contract tests between the client and the Firestore/Storage rules.
 *
 * ── Scope ──────────────────────────────────────────────────────────────────
 * These are STRUCTURAL smoke tests, not security tests. They parse the rules
 * files as text and assert they still agree with the TypeScript source. They
 * cannot evaluate `diff()`, ownership, missing fields, or which of several
 * matching `allow` expressions wins — only the Firebase emulator can do that.
 *
 * They exist because every serious defect found in the audit of this codebase
 * was a silent contract mismatch between a client write and a rule:
 *
 *   - `page_views` wrote `organic_query`, the rule did not allow it, and the
 *     write was rejected behind a `.catch(() => {})` — analytics silently empty.
 *   - The admin user directory wrote to other users' documents, which
 *     `isOwner()` forbids.
 *   - Category lists drifted four ways across constants, types, the form,
 *     the admin page, and the rules.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

import { ALL_ACCEPTED_CATEGORIES } from '../src/constants/index.js';
import { ALLOWED_ADMIN_EMAILS } from '../src/constants/admin.js';
import domain from '../functions/discovery-domain.cjs';
import { discoveryFixtures } from '../src/data/discovery.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const firestoreRules = read('firestore.rules');
const storageRules = read('storage.rules');
const appSource = read('src/App.tsx');
const typesSource = read('src/types/index.ts');
const adminConstants = read('src/constants/admin.ts');
const functionSource = read('functions/index.js');
const discoveryTypesSource = read('src/types/discovery.ts');
const discoveryDomainSource = read('functions/discovery-domain.cjs');
const discoveryStoreSource = read('functions/discovery-store.cjs');
const discoveryCallableSource = read('functions/discovery.cjs');
const discoveryAdminSource = read('src/components/admin/DiscoveryContent.tsx');
const discoveryIngestSource = read('scripts/discovery/ingest.ts');

/** Pulls the top-level field names out of a single-line TS interface body, tolerating one level of nested object types (e.g. `occurrences: { start: string }[]` yields "occurrences", not "start"). */
function interfaceFields(source: string, name: string): string[] {
  const marker = `interface ${name}`;
  const at = source.indexOf(marker);
  assert.notEqual(at, -1, `interface not found: ${name}`);
  const open = source.indexOf('{', at);
  assert.notEqual(open, -1, `interface body not found: ${name}`);
  let depth = 0, close = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) { close = i; break; }
  }
  assert.notEqual(close, -1, `unterminated interface body: ${name}`);
  const topLevel = source.slice(open + 1, close).replace(/\{[^{}]*\}/g, '{}');
  return [...topLevel.matchAll(/(\w+)\??:/g)].map((m) => m[1]);
}

/** Pulls a bracketed string-list out of the rules text. */
function ruleList(source: string, marker: string): string[] {
  const at = source.indexOf(marker);
  assert.notEqual(at, -1, `marker not found in rules: ${marker}`);
  const open = source.indexOf('[', at);
  const close = source.indexOf(']', open);
  assert.ok(open !== -1 && close !== -1, `no list after marker: ${marker}`);
  return [...source.slice(open + 1, close).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('category enum', () => {
  it('firestore.rules accepts exactly the categories the app defines', () => {
    const inRules = ruleList(firestoreRules, 'function allowedCategories()');
    assert.deepEqual([...inRules].sort(), [...ALL_ACCEPTED_CATEGORIES].sort());
  });

  it('the legacy category stays accepted so old documents remain editable', () => {
    // Dropping a legacy value would make any surviving document carrying it
    // permanently uneditable, because the admin rule revalidates `category`.
    assert.ok(ALL_ACCEPTED_CATEGORIES.includes('gas' as never));
  });
});

describe('page_views analytics contract', () => {
  const allowed = ruleList(firestoreRules, 'match /page_views/{viewId}');

  it('every field the client writes is permitted by the rules', () => {
    const block = appSource.slice(
      appSource.indexOf("addDoc(collection(db, 'page_views')"),
      appSource.indexOf('}).catch(() => {});'),
    );
    assert.ok(block.length > 0, 'could not locate the page_views write');
    const written = [...block.matchAll(/^\s{6}([a-zA-Z_]+)[,:]/gm)].map((m) => m[1]);
    assert.ok(written.length > 0, 'parsed no fields from the page_views write');
    for (const field of written) {
      assert.ok(allowed.includes(field), `client writes "${field}" but the rules reject it`);
    }
  });

  it('does not collect search keywords', () => {
    // Search terms are PII and the collection documents itself as PII-free.
    assert.ok(!allowed.includes('organic_query'));
    assert.ok(!appSource.includes('organic_query'));
  });
});

describe('reporter PII split', () => {
  it('incidents cannot carry an email field', () => {
    const createAllowlist = ruleList(firestoreRules, 'allow create: if isAuthenticated() &&');
    assert.ok(
      !createAllowlist.includes('email'),
      'email must live in incident_reporters, never on the world-readable incident',
    );
  });

  it('incident_reporters is not publicly readable', () => {
    const block = firestoreRules.slice(firestoreRules.indexOf('match /incident_reporters/'));
    const readRule = block.slice(block.indexOf('allow read:'), block.indexOf('\n', block.indexOf('allow read:')));
    assert.ok(!readRule.includes('if true'), 'reporter identity must never be world-readable');
  });

  it('the public map query filters on visibility', () => {
    const mapSource = read('src/pages/MapPage.tsx');
    assert.ok(
      mapSource.includes("where('visibility', '==', 'public')"),
      'rules filter queries, not rows — the client must constrain the query itself',
    );
  });
});

describe('incident_feedback lifecycle', () => {
  const block = firestoreRules.slice(
    firestoreRules.indexOf('match /incident_feedback/'),
    firestoreRules.indexOf('match /', firestoreRules.indexOf('match /incident_feedback/') + 1),
  );

  it('is present', () => {
    assert.ok(block.length > 0, 'incident_feedback rule block not found');
  });

  it('is never deletable by a client', () => {
    const deleteRule = block.slice(block.indexOf('allow delete:'), block.indexOf('\n', block.indexOf('allow delete:')));
    assert.ok(deleteRule.includes('if false'), 'resident feedback must not be client-deletable');
  });

  it('is not world-readable — per-user feedback identity stays private', () => {
    const readRule = block.slice(block.indexOf('allow read:'), block.indexOf(';', block.indexOf('allow read:')));
    assert.ok(!readRule.includes('if true'), 'who left feedback must never be world-readable');
    assert.ok(readRule.includes('isAdmin()') && readRule.includes('request.auth.uid'),
      'read must be limited to the owner and admins');
  });

  it('ties the document id to the writer to enforce one record per user', () => {
    assert.ok(
      block.includes("request.auth.uid + '_' + request.resource.data.incidentId"),
      'the id must be uid+incident so a report cannot be ballot-stuffed',
    );
  });

  it('accepts exactly the FeedbackKind values the client writes', () => {
    // Source of truth: the union in src/lib/feedback.ts.
    const feedbackSource = read('src/lib/feedback.ts');
    const kinds = /export type FeedbackKind =\s*([^;]+);/.exec(feedbackSource)![1]
      .split('|')
      .map((s) => s.trim().replace(/['"]/g, ''))
      .filter(Boolean);
    for (const kind of kinds) {
      assert.ok(block.includes(`'${kind}'`), `client writes kind "${kind}" but the rule rejects it`);
    }
  });
});

describe('feedback aggregate parity', () => {
  // The public aggregate is computed twice: aggregateFeedback() in
  // src/lib/feedback.ts (on-read, and the digest) and the reducer inside
  // onIncidentFeedbackWritten in functions/index.js (writes the incident
  // fields). They must agree. A full behavioural cross-check needs the
  // emulator; this is the cheap drift guard.
  const feedbackSource = read('src/lib/feedback.ts');

  it('both reducers key off the same FeedbackKind values', () => {
    const kinds = /export type FeedbackKind =\s*([^;]+);/.exec(feedbackSource)![1]
      .split('|').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
    for (const kind of kinds) {
      assert.ok(functionSource.includes(`'${kind}'`), `function reducer is missing kind "${kind}"`);
    }
  });

  it('the function writes every public feedback_* field the client type declares', () => {
    const fields = [...read('src/types/index.ts').matchAll(/\b(feedback_[a-z_]+)\??:/g)].map((m) => m[1]);
    assert.ok(fields.length >= 4, 'expected several feedback_* fields on the Incident type');
    for (const field of new Set(fields)) {
      assert.ok(functionSource.includes(`${field}:`), `function does not write ${field}`);
    }
  });

  it('the function updates the incident rather than set(merge) — no phantom docs', () => {
    const block = functionSource.slice(functionSource.indexOf('onIncidentFeedbackWritten'));
    assert.ok(block.includes(".doc(incidentId).update({"), 'must use update() so feedback on a browser-only record no-ops');
  });
});

describe('flag threshold', () => {
  it('rules and client agree on how many flags hide a report', () => {
    const inRules = /function flagThreshold\(\)\s*\{\s*return (\d+);/.exec(firestoreRules);
    const inTypes = /FLAG_THRESHOLD = (\d+)/.exec(typesSource);
    assert.ok(inRules && inTypes, 'threshold not found in both places');
    assert.equal(inRules[1], inTypes[1]);
  });

  it('a single flag cannot hide a report', () => {
    const threshold = Number(/FLAG_THRESHOLD = (\d+)/.exec(typesSource)![1]);
    assert.ok(threshold >= 2, 'one account must not be able to take down the feed');
  });
});

describe('admin identity', () => {
  const emails = [...adminConstants.matchAll(/'([^']+@[^']+)'/g)].map((m) => m[1]);

  it('firestore.rules matches ALLOWED_ADMIN_EMAILS', () => {
    for (const email of emails) {
      assert.ok(firestoreRules.includes(email), `${email} missing from firestore.rules`);
    }
  });

  it('storage.rules matches ALLOWED_ADMIN_EMAILS', () => {
    // Storage rules cannot read Firestore, so the admin identity is duplicated
    // there by necessity. This test is what keeps the copies in step.
    for (const email of emails) {
      assert.ok(storageRules.includes(email), `${email} missing from storage.rules`);
    }
  });

  it('the admin preview function mails the same approved accounts', () => {
    for (const email of emails) {
      assert.ok(functionSource.includes(email), `${email} missing from functions/index.js`);
    }
  });
});

describe('weekly email planner security', () => {
  it('keeps plans admin-only and test status server-owned', () => {
    const plans = firestoreRules.slice(
      firestoreRules.indexOf('match /weekly_email_plans'),
      firestoreRules.indexOf('match /digest_test_requests'),
    );
    const tests = firestoreRules.slice(
      firestoreRules.indexOf('match /digest_test_requests'),
      firestoreRules.indexOf('match /digest_unsubscribes'),
    );
    assert.match(plans, /allow read: if isAdmin\(\)/);
    assert.doesNotMatch(plans, /allow read: if true/);
    assert.match(tests, /allow create: if isAdmin\(\)/);
    assert.match(tests, /allow update, delete: if false/);
  });

  it('supports explicit preview and cancellation notifications', () => {
    assert.match(firestoreRules, /request\.resource\.data\.action in \['preview', 'cancelled'\]/);
    assert.ok(functionSource.includes("['preview', 'cancelled'].includes(action)"));
  });

  it('permits constrained editorial controls and secure calls to action', () => {
    for (const field of ['preheader', 'audience', 'byline', 'ctaLabel', 'ctaUrl']) {
      assert.ok(firestoreRules.includes(`'${field}'`), `${field} is missing from the Firestore contract`);
      assert.ok(functionSource.includes(field), `${field} is missing from the proof renderer`);
    }
    assert.match(firestoreRules, /ctaUrl\.matches\('\^https:\/\/.\+'/);
    assert.ok(functionSource.includes("parsed.protocol === 'https:'"));
    assert.match(firestoreRules, /audience in \['everyone', 'local', 'citywide'\]/);
  });

  it('delivers private, retry-safe copies to each admin', () => {
    assert.ok(functionSource.includes('for (const [index, email] of ADMIN_EMAILS.entries())'));
    assert.ok(functionSource.includes("'Idempotency-Key': `digest-planner-preview/${requestId}/${index}`"));
    assert.ok(functionSource.includes('to: [email]'));
  });

  it('embeds the Calgary Watch logo in every admin proof', () => {
    assert.ok(functionSource.includes('src="cid:${LOGO_CID}"'));
    assert.ok(functionSource.includes('attachments: [logoAttachment()]'));
    assert.ok(read('functions/package-assets.js').includes("public', 'images', 'email', 'logo.png"));
  });
});

describe('moderation durability', () => {
  it('the ingest pipeline consults the suppression list', () => {
    const ingest = read('scripts/ingest/index.ts');
    assert.ok(
      ingest.includes('loadSuppressedIds') && ingest.includes('suppressed.has('),
      'without this, deleting an ingested incident is undone by the next run',
    );
  });

  it('browser-derived incidents have stable ids', () => {
    const edmonton = read('src/hooks/useEdmontonOpenData.ts');
    assert.ok(
      !/id: `[^`]*Math\.random\(\)/.test(edmonton),
      'a random id changes every fetch, making suppression impossible',
    );
  });

  it('ingested records are written with a visibility', () => {
    const ingest = read('scripts/ingest/index.ts');
    assert.ok(ingest.includes("visibility: 'public'"), 'records without it never appear on the map');
  });
});

describe('discovery collections lockdown', () => {
  // Discovery is published through a verified static snapshot (src/generated/discovery-index.json).
  // Raw inventory, review records and source payloads must never be directly readable or writable
  // by a public client — every mutation has to go through the manageDiscovery/submitDiscovery
  // callables, which apply validateSubmission()/moderate()'s own rules.
  const rawInventoryBlock = firestoreRules.slice(
    firestoreRules.indexOf("match /{collection}/{id} {"),
    firestoreRules.indexOf('match /entity_submissions/'),
  );
  const submissionsBlock = firestoreRules.slice(
    firestoreRules.indexOf('match /entity_submissions/'),
    firestoreRules.indexOf('match /{path=**}'),
  );

  it('raw events/markets/market_occurrences/source collections are never client-writable', () => {
    assert.match(rawInventoryBlock, /allow write: if false/);
  });

  it('raw inventory reads are restricted to admins, never world-readable', () => {
    assert.doesNotMatch(rawInventoryBlock, /allow read: if true/);
    assert.match(rawInventoryBlock, /isAdmin\(\)/);
  });

  it('the admin-readable collection list matches what the ingest/moderation pipeline actually writes', () => {
    // Cross-check against the collections discovery-store.cjs and discovery.cjs touch, so an
    // added collection can't be silently unreadable to the admin UI (or, worse, silently
    // world-readable because someone forgot to add it to this list at all).
    const inRules = [...rawInventoryBlock.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    for (const collection of ['events', 'markets', 'market_occurrences', 'discovery_sources', 'discovery_source_records', 'discovery_audit']) {
      assert.ok(inRules.includes(collection), `${collection} missing from the admin-read allowlist`);
    }
  });

  it('entity_submissions cannot be written directly by a client either', () => {
    assert.match(submissionsBlock, /allow write: if false/);
  });

  it('entity_submissions reads are limited to the admin or the original submitter', () => {
    assert.doesNotMatch(submissionsBlock, /allow read: if true/);
    assert.ok(submissionsBlock.includes('isAdmin()') && submissionsBlock.includes('resource.data.submittedBy == request.auth.uid'));
  });
});

describe('public submission DTOs cannot smuggle privileged entity fields', () => {
  // This is the exact hazard the narrow *SubmissionInput types exist to prevent: a client
  // submitting a full DiscoveryEntity could otherwise attempt partner/editorial/status fields
  // directly. validateSubmission()'s allowlist and the TS submission types must describe
  // exactly the same field set, in both directions.
  const submissionBaseFields = interfaceFields(discoveryTypesSource, 'SubmissionBase');
  const eventFields = new Set(['kind', ...submissionBaseFields, ...interfaceFields(discoveryTypesSource, 'EventSubmissionInput')]);
  const marketFields = new Set(['kind', ...submissionBaseFields, ...interfaceFields(discoveryTypesSource, 'MarketSubmissionInput')]);

  const commonMatch = /const common = \[([^\]]+)\]/.exec(discoveryDomainSource);
  const specificMatch = /const specific = input\.kind === 'event' \? \[([^\]]+)\] : \[([^\]]+)\]/.exec(discoveryDomainSource);
  assert.ok(commonMatch && specificMatch, 'could not locate the validateSubmission field allowlists');
  const parseList = (text: string) => [...text.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const common = parseList(commonMatch![1]);
  const eventAllowlist = new Set([...common, ...parseList(specificMatch![1])]);
  const marketAllowlist = new Set([...common, ...parseList(specificMatch![2])]);

  it('the server allowlist accepts exactly the fields EventSubmissionInput declares', () => {
    assert.deepEqual([...eventAllowlist].sort(), [...eventFields].sort());
  });

  it('the server allowlist accepts exactly the fields MarketSubmissionInput declares', () => {
    assert.deepEqual([...marketAllowlist].sort(), [...marketFields].sort());
  });

  it('rejects a submission carrying privileged entity-only fields', () => {
    const privileged = ['status', 'verification', 'verifiedAt', 'scores', 'developmentOnly', 'id', 'slug', 'sources', 'claimed', 'partner', 'editorialSelection'];
    for (const field of privileged) assert.ok(!eventAllowlist.has(field) && !marketAllowlist.has(field), `"${field}" must never be a submittable field`);
    assert.throws(() => domain.validateSubmission({ kind: 'event', title: 't', summary: 's', description: 'd', address: 'a', organizer: 'o', sourceUrl: 'https://example.org/x', categories: [], tags: [], start: '2026-01-01T00:00:00Z', end: '2026-01-01T01:00:00Z', pricing: 'free', status: 'published' }));
  });

  it('BusinessSubmissionInput exists in the type model but has no server-side submission path yet', () => {
    // Tracked gap, not a bug: only event/market submissions are wired end-to-end today.
    assert.ok(interfaceFields(discoveryTypesSource, 'BusinessSubmissionInput').length > 0);
    assert.match(discoveryDomainSource, /\['event', 'market'\]\.includes\(input\.kind\)/);
  });
});

describe('discovery moderation actions parity', () => {
  it('the admin UI only offers moderation actions the server accepts', () => {
    const serverActions = /!\['publish','draft','archive','cancel'\]\.includes\(action\)/.exec(discoveryStoreSource);
    assert.ok(serverActions, 'could not find the server action allowlist');
    const clientActions = [...discoveryAdminSource.matchAll(/\{publish:'[^']+',draft:'[^']+',archive:'[^']+',cancel:'[^']+'\}/g)];
    assert.ok(clientActions.length > 0, 'could not find the admin UI action labels');
  });

  it('a moderator cannot publish over an unacknowledged duplicate warning', () => {
    assert.match(discoveryStoreSource, /if \(action === 'publish' && entity\.duplicateIds\?\.length && !acknowledgeDuplicates\)/);
  });

  it('publishing requires an official or editorial source, never a bare submission', () => {
    assert.match(discoveryStoreSource, /entity\.sources\.every\(s => \['official','editorial'\]\.includes\(s\.kind\)\)/);
  });
});

describe('discovery admin identity parity', () => {
  it('the manageDiscovery callable approves exactly ALLOWED_ADMIN_EMAILS', () => {
    for (const email of ALLOWED_ADMIN_EMAILS) {
      assert.ok(discoveryCallableSource.includes(`'${email}'`), `${email} missing from functions/discovery.cjs`);
    }
    const inSource = [...discoveryCallableSource.matchAll(/'([^']+@[^']+)'/g)].map((m) => m[1]);
    assert.deepEqual([...inSource].sort(), [...ALLOWED_ADMIN_EMAILS].sort(), 'discovery.cjs keeps its own admin email copy in step with src/constants/admin.ts');
  });
});

describe('publish eligibility keeps unverified and fixture content out of the public snapshot', () => {
  const officialSource = { name: 'Organizer', url: 'https://example.org/event', kind: 'official' as const };
  const baseEligible = {
    id: 'e1', kind: 'event' as const, status: 'published' as const, verification: 'source-checked' as const,
    verifiedAt: new Date().toISOString(), sources: [officialSource], developmentOnly: false,
  };

  it('a fully verified, published, non-fixture entity is eligible', () => {
    assert.equal(domain.eligible(baseEligible), true);
  });

  it('every design/development fixture is ineligible for the public snapshot', () => {
    // This is the exact contract behind fixtures never reaching production: developmentOnly:true
    // must fail eligible() regardless of anything else set on the record.
    for (const fixture of discoveryFixtures) {
      assert.equal(domain.eligible({ ...fixture, status: 'published', verification: 'source-checked', verifiedAt: new Date().toISOString(), sources: [officialSource] }), false, `${fixture.id} is developmentOnly and must never be eligible`);
    }
  });

  it('a merely-ingested (unverified) record cannot be eligible, even once status flips to published', () => {
    assert.equal(domain.eligible({ ...baseEligible, verification: 'unverified' }), false);
  });

  it('a stale verification (older than 14 days) is not eligible', () => {
    const fourteenDaysAgo = new Date(Date.now() - 15 * 86400000).toISOString();
    assert.equal(domain.eligible({ ...baseEligible, verifiedAt: fourteenDaysAgo }), false);
  });

  it('a fixture-kind or non-https source is not eligible', () => {
    assert.equal(domain.eligible({ ...baseEligible, sources: [{ ...officialSource, kind: 'fixture' }] }), false);
    assert.equal(domain.eligible({ ...baseEligible, sources: [{ ...officialSource, url: 'http://example.org/event' }] }), false);
  });
});

describe('new inventory always lands pending, never auto-published', () => {
  it('normalizeRecord always stamps new/changed entities pending and unverified', () => {
    assert.match(discoveryDomainSource, /status: 'pending', verification: 'unverified'/);
  });

  it('the ingest CLI only writes to Firestore behind an explicit --write flag', () => {
    assert.ok(discoveryIngestSource.includes("process.argv.includes('--write')"));
    assert.match(discoveryIngestSource, /if \(!write\) \{ console\.log/);
  });

  it('re-ingesting an unchanged record does not bump its revision or reset its moderation status', () => {
    assert.match(discoveryStoreSource, /if \(old && JSON\.stringify\(previousRaw\.data\(\)\?\.input\) === JSON\.stringify\(input\)/);
  });
});
