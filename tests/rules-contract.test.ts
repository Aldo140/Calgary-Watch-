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

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const firestoreRules = read('firestore.rules');
const storageRules = read('storage.rules');
const appSource = read('src/App.tsx');
const typesSource = read('src/types/index.ts');
const adminConstants = read('src/constants/admin.ts');

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
