import type { DiscoveryEntity } from "../types/discovery";
export type AdminInventoryRow = DiscoveryEntity & {
  revision: number;
  duplicateIds?: string[];
  snapshotOnly?: boolean;
};
/** Backend rows win, including drafts/archives, so an older release cannot resurrect them. */
export function adminInventory(
  backend: readonly AdminInventoryRow[],
  published: readonly DiscoveryEntity[],
): AdminInventoryRow[] {
  const byId = new Map<string, AdminInventoryRow>();
  for (const e of published)
    if (
      ["event", "market", "business"].includes(e.kind) &&
      e.status === "published" &&
      !e.developmentOnly
    )
      byId.set(e.id, { ...e, revision: 0, snapshotOnly: true });
  for (const e of backend) byId.set(e.id, { ...e, snapshotOnly: false });
  return [...byId.values()];
}
export function matchesAdminInventory(
  e: DiscoveryEntity,
  query: string,
): boolean {
  const text = [
    e.title,
    e.summary,
    e.kind,
    "organizer" in e ? e.organizer : "",
    ...e.sources.map((s) => s.name),
  ]
    .join(" ")
    .toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
}
