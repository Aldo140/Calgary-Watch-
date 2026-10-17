type SourceRecord = { id: string; sourceId?: unknown; sourceRecordId?: unknown; verification?: unknown };

/** A hand-reviewed replacement wins over an older stored copy of that exact source record. */
export function isReviewedReplacement(reviewed: SourceRecord | undefined, stored: SourceRecord): boolean {
  return Boolean(reviewed
    && reviewed.verification === 'source-checked'
    && reviewed.sourceId === stored.sourceId
    && reviewed.sourceRecordId === stored.sourceRecordId);
}
