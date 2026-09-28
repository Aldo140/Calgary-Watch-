import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { repostProblems } from '../scripts/ops/jobs/drafts';

const ok = {
  kind: 'repost',
  caption: 'Elk on the pathway.\n\n🎥 @someone.yyc, shared with permission.\n\n#yyc #calgary #calgarydaily',
  repost: {
    handle: 'someone.yyc', originalUrl: 'https://www.instagram.com/reel/abc/', video: 'brand/reposts/someone-elk.mp4',
    permission: { grantedBy: '@someone.yyc', how: 'Instagram DM', date: '2026-10-01', quote: 'Yes, tag me!' },
  },
};

describe('reposts need the creator’s permission', () => {
  it('accepts a repost with recorded permission and credit', () => {
    assert.deepEqual(repostProblems(ok), []);
  });
  it('refuses a repost with credit but no permission', () => {
    const { permission: _, ...noPermission } = ok.repost;
    assert.ok(repostProblems({ ...ok, repost: noPermission as any }).some(p => /Permission/.test(p)));
    assert.ok(repostProblems({ ...ok, repost: { ...ok.repost, permission: { ...ok.repost.permission, quote: '' } } }).length > 0);
  });
  it('refuses a caption that does not credit the creator or say it is shared with permission', () => {
    assert.ok(repostProblems({ ...ok, caption: 'Elk! #yyc' }).length >= 2);
  });
  it('ignores other kinds of post', () => {
    assert.deepEqual(repostProblems({ kind: 'news', caption: 'x' }), []);
  });
  it('every repost draft in brand/drafts is cleared to go', () => {
    const dir = join(import.meta.dirname, '..', 'brand', 'drafts');
    for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
      for (const p of JSON.parse(readFileSync(join(dir, f), 'utf8')).posts) assert.deepEqual(repostProblems(p), [], `${f}/${p.id}`);
    }
  });
});
