import { OWNER_EDIT_INTERVAL, OWNER_EDITS_PER_WEEK, type OwnerEdit } from './ownerListingEdits';

export type OwnerEditRow = OwnerEdit & { id: string; actorRole?: string; subjectUid?: string | null; live?: boolean };
export type FieldChange = { listing: string; field: string; before: unknown; after: unknown };
export type BusinessActivity = { rootId: string; title: string; week: number; month: number; total: number; last: number; editors: string[]; fields: string[]; failed: number };
export type OwnerEditStats = {
  week: number; month: number; loaded: number; published: number; failed: number; queued: number; admin: number; unread: number;
  businessesWeek: number; editorsWeek: number; atLimit: number;
  fields: Array<[string, number]>; businesses: BusinessActivity[];
};

const DAY = 86400000;
/** createdAt is a Firestore Timestamp, a Date or a number depending on the writer. */
export function editTime(row: Pick<OwnerEdit, 'createdAt' | 'appliedAt'>): number {
  const c = row.createdAt as { toMillis?: () => number; seconds?: number } | number | Date | null | undefined;
  if (typeof c === 'number') return c;
  if (c instanceof Date) return c.getTime();
  return c?.toMillis?.() ?? (c?.seconds ? c.seconds * 1000 : row.appliedAt ?? 0);
}

type AuditListing = { entityId: string; title?: string; fields?: Record<string, unknown> } | null;
/** Every field a row changed, for both single-listing edits and organization batches. */
export function fieldChanges(row: Pick<OwnerEdit, 'changes' | 'before' | 'after' | 'entityTitle'>): FieldChange[] {
  const after = row.after as { listings?: AuditListing[] } | undefined, before = row.before as { listings?: AuditListing[] } | undefined;
  if (Array.isArray(after?.listings) || Array.isArray(before?.listings)) {
    const out: FieldChange[] = [];
    const prior = new Map((before?.listings ?? []).filter(Boolean).map(l => [l!.entityId, l!]));
    const listings = (row.changes as { listings?: Array<{ entityId: string; action?: string }> }).listings ?? [];
    for (const l of after?.listings ?? []) {
      if (!l) continue;
      const was = prior.get(l.entityId);
      for (const [field, value] of Object.entries(l.fields ?? {})) out.push({ listing: l.title ?? l.entityId, field, before: was?.fields?.[field] ?? null, after: value });
    }
    for (const op of listings) if (op.action === 'delete') out.push({ listing: prior.get(op.entityId)?.title ?? op.entityId, field: 'removed', before: prior.get(op.entityId)?.title ?? op.entityId, after: null });
    return out;
  }
  return Object.keys(row.changes ?? {}).map(field => ({ listing: row.entityTitle, field, before: row.before?.[field] ?? null, after: row.after?.[field] ?? row.changes[field] }));
}

export function ownerEditStats(rows: readonly OwnerEditRow[], now: number): OwnerEditStats {
  const fieldCount = new Map<string, number>(), biz = new Map<string, BusinessActivity & { editorSet: Set<string>; fieldSet: Set<string>; weekTimes: Set<number> }>();
  const weekEditors = new Set<string>(), weekBiz = new Set<string>();
  let week = 0, month = 0, published = 0, failed = 0, queued = 0, admin = 0, unread = 0;
  for (const row of rows) {
    const at = editTime(row), isAdmin = row.actorRole === 'admin', inWeek = at > now - OWNER_EDIT_INTERVAL, inMonth = at > now - 30 * DAY;
    if (inWeek) week++;
    if (inMonth) month++;
    if (row.status === 'failed') failed++; else if (row.status === 'applied') published++; else queued++;
    if (isAdmin) admin++;
    if (row.notificationPending) unread++;
    const changes = fieldChanges(row);
    if (inMonth) for (const f of new Set(changes.map(c => c.field))) fieldCount.set(f, (fieldCount.get(f) ?? 0) + 1);
    const editor = isAdmin ? `admin:${row.uid}` : row.uid;
    if (inWeek) { weekEditors.add(editor); weekBiz.add(row.rootId); }
    const b = biz.get(row.rootId) ?? { rootId: row.rootId, title: row.entityTitle, week: 0, month: 0, total: 0, last: 0, editors: [], fields: [], failed: 0, editorSet: new Set(), fieldSet: new Set(), weekTimes: new Set() };
    b.total++; if (inMonth) b.month++; if (inWeek) { b.week++; if (!isAdmin && row.status !== 'failed') b.weekTimes.add(at); }
    if (row.status === 'failed') b.failed++;
    if (at > b.last) { b.last = at; b.title = row.entityTitle || b.title; }
    b.editorSet.add(editor); changes.forEach(c => b.fieldSet.add(c.field));
    biz.set(row.rootId, b);
  }
  const businesses = [...biz.values()].map(({ editorSet, fieldSet, weekTimes, ...b }) => ({ ...b, editors: [...editorSet], fields: [...fieldSet] })).sort((a, b) => b.last - a.last);
  const atLimit = [...biz.values()].filter(b => b.weekTimes.size >= OWNER_EDITS_PER_WEEK).length;
  return { week, month, loaded: rows.length, published, failed, queued, admin, unread, businessesWeek: weekBiz.size, editorsWeek: weekEditors.size, atLimit, fields: [...fieldCount].sort((a, b) => b[1] - a[1]), businesses };
}

/** Short, readable value for the admin diff: no JSON braces for plain text. */
export function showValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v.length > 140 ? v.slice(0, 137) + '…' : v;
  if (Array.isArray(v)) return v.length && v.every(x => typeof x === 'string') ? v.join(', ') : `${v.length} item${v.length === 1 ? '' : 's'}`;
  if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : String(x)}`).join(' · ').slice(0, 200);
  return String(v);
}
