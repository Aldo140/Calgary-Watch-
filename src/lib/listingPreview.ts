/** Preserve read-only member inspection when following a managed listing. */
export function listingManagementPath(entityId: string, previewUid?: string | null): string {
  return `/claim/${encodeURIComponent(entityId)}${previewUid ? `?as=${encodeURIComponent(previewUid)}` : ''}`;
}
