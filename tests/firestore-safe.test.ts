import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withoutUndefined } from '../src/lib/firestoreSafe';

describe('Firestore fallback writes', () => {
  it('drops undefined from an approved suggestion before it is queued', () => {
    // The exact action the admin "Approve to pending review" button sends for a resident suggestion.
    const action = { action: 'review-submission', input: { title: 'Fall market', summary: 'x', organizer: undefined, occurrences: [{ start: 's', cancelled: undefined }] }, sourceId: 'src', recordId: 'submission-1', id: '1', cancelled: undefined };
    const out = withoutUndefined(action);
    assert.deepEqual(out, { action: 'review-submission', input: { title: 'Fall market', summary: 'x', occurrences: [{ start: 's' }] }, sourceId: 'src', recordId: 'submission-1', id: '1' });
    assert.ok(!JSON.stringify(out).includes('undefined'));
    assert.deepEqual(withoutUndefined([1, undefined, null, false]), [1, null, false]);
  });

  it('keeps false, null, empty strings and non-plain objects', () => {
    const when = new Date(0);
    assert.deepEqual(withoutUndefined({ cancelled: false, note: null, tag: '', when }), { cancelled: false, note: null, tag: '', when });
    assert.equal(withoutUndefined({ when }).when, when);
  });

  it('both fallback writes in discoveryApi go through it', () => {
    const src = readFileSync('src/lib/discoveryApi.ts', 'utf8');
    assert.match(src, /action: withoutUndefined\(data\)/);
    assert.match(src, /input: withoutUndefined\(input\)/);
  });

  it('a failed save does not hide the suggestions and inventory panels', () => {
    const src = readFileSync('src/components/admin/DiscoveryContent.tsx', 'utf8');
    assert.match(src, /\{loadError\?<p className="p-4">Suggestions could not be confirmed/);
    assert.match(src, /\{loadError\?<p className="p-4">Inventory could not be refreshed/);
  });
});
