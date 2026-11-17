import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldChanges, ownerEditStats, showValue, type OwnerEditRow } from '../src/lib/ownerEditStats';

const now = Date.UTC(2026, 10, 17);
const row = (id: string, rootId: string, at: number, extra: Partial<OwnerEditRow> = {}): OwnerEditRow => ({ id, uid: 'u1', rootId, entityId: rootId, entityTitle: rootId.toUpperCase(), changes: { phone: '1' }, status: 'applied', createdAt: at, notificationPending: false, ...extra });

test('owner edit totals: week and month counts, businesses, editors and failures', () => {
  const rows = [
    row('a', 'biz-a', now - 1000, { notificationPending: true }),
    row('b', 'biz-a', now - 2000, { uid: 'u2' }),
    row('c', 'biz-b', now - 10 * 86400000, { status: 'failed', error: 'Too soon' }),
    row('d', 'biz-b', now - 3000, { actorRole: 'admin', uid: 'staff' }),
  ];
  const s = ownerEditStats(rows, now);
  assert.equal(s.week, 3); assert.equal(s.month, 4); assert.equal(s.failed, 1); assert.equal(s.unread, 1); assert.equal(s.admin, 1);
  assert.equal(s.businessesWeek, 2); assert.equal(s.editorsWeek, 3);
  const a = s.businesses.find(b => b.rootId === 'biz-a')!;
  assert.equal(a.week, 2); assert.deepEqual(a.editors.sort(), ['u1', 'u2']); assert.deepEqual(s.fields[0], ['phone', 4]);
});

test('a business with five owner publishes this week shows as at the limit', () => {
  const rows = [1, 2, 3, 4, 5].map(i => row(`r${i}`, 'biz-a', now - i * 1000));
  assert.equal(ownerEditStats(rows, now).atLimit, 1);
});

test('organization batches list every listing field with before and after', () => {
  const changes = fieldChanges({ entityTitle: 'Org', changes: { listings: [{ entityId: 'e1', action: 'edit' }, { entityId: 'e2', action: 'delete' }] } as any,
    before: { listings: [{ entityId: 'e1', title: 'Show', fields: { title: 'Old' } }, { entityId: 'e2', title: 'Gone show', fields: {} }] } as any,
    after: { listings: [{ entityId: 'e1', title: 'Show', fields: { title: 'New' } }, null] } as any });
  assert.deepEqual(changes, [{ listing: 'Show', field: 'title', before: 'Old', after: 'New' }, { listing: 'Gone show', field: 'removed', before: 'Gone show', after: null }]);
  assert.equal(showValue(['a', 'b']), 'a, b'); assert.equal(showValue(null), '—');
});
