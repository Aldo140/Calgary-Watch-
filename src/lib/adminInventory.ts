import { adminObject, adminText, adminTimestamp } from "./adminRecord";
import type { DiscoveryEntity } from "../types/discovery";
export type AdminInventoryRow = DiscoveryEntity & {
  revision: number;
  duplicateIds?: string[];
  snapshotOnly?: boolean;
  moderationUnavailable?: boolean;
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
    ...(Array.isArray(e.sources) ? e.sources : []).map((s) => s?.name),
  ]
    .join(" ")
    .toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word));
}

/** Optional metadata may be absent or use Firestore timestamps on older backend rows. */
export function normalizeAdminInventoryRow(
  value: unknown,
  id: string,
  kind: "event" | "market",
): AdminInventoryRow {
  const raw = adminObject(value);
  const iso = (v: unknown) => {
    const ms = adminTimestamp(v);
    return ms === undefined ? undefined : new Date(ms).toISOString();
  };
  const sources = (Array.isArray(raw.sources) ? raw.sources : []).flatMap(
    (v) => {
      const s = adminObject(v);
      return typeof s.url === "string" && /^https?:\/\//i.test(s.url)
        ? [
            {
              name: adminText(s.name, "Official source"),
              url: s.url,
              kind: "official" as const,
            },
          ]
        : [];
    },
  );
  return {
    ...raw,
    id,
    kind,
    moderationUnavailable:
      !["pending", "draft", "published", "archived"].includes(
        String(raw.status),
      ) ||
      sources.length === 0 ||
      typeof raw.title !== "string" ||
      !raw.title.trim() ||
      !Array.isArray(raw.sources) ||
      typeof raw.revision !== "number" ||
      !Number.isInteger(raw.revision) ||
      raw.revision < 0,
    title: adminText(raw.title, `Untitled ${kind}`),
    summary: adminText(raw.summary),
    slug: adminText(raw.slug),
    organizer: adminText(raw.organizer),
    sources,
    status: ["pending", "draft", "published", "archived"].includes(
      String(raw.status),
    )
      ? raw.status
      : "draft",
    revision:
      typeof raw.revision === "number" &&
      Number.isInteger(raw.revision) &&
      raw.revision >= 0
        ? raw.revision
        : 0,
    verifiedAt: iso(raw.verifiedAt),
    fetchedAt: iso(raw.fetchedAt),
    duplicateIds: Array.isArray(raw.duplicateIds)
      ? raw.duplicateIds.filter((v): v is string => typeof v === "string")
      : [],
  } as AdminInventoryRow;
}
