import type { InventorySubmissionInput } from "../types/discovery";
import type { ListingClaim } from "./claims";
import { adminObject, adminText, adminTimestamp } from "./adminRecord";
const textList = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
/** Keep incomplete fields editable, without passing objects into form controls or date formatters. */
export function adminSubmissionInput(
  value: unknown,
): InventorySubmissionInput | undefined {
  const r = adminObject(value);
  if (r.kind !== "event" && r.kind !== "market") return undefined;
  const base = {
    title: adminText(r.title),
    summary: adminText(r.summary),
    description: adminText(r.description),
    address: adminText(r.address),
    venue: adminText(r.venue),
    organizer: adminText(r.organizer),
    sourceUrl: adminText(r.sourceUrl),
    neighbourhood: adminText(r.neighbourhood),
    categories: textList(r.categories),
    tags: textList(r.tags),
  };
  if (r.kind === "event")
    return {
      ...base,
      kind: "event",
      start: adminText(r.start),
      end: adminText(r.end),
      pricing:
        r.pricing === "free" || r.pricing === "paid" ? r.pricing : "unknown",
    };
  return {
    ...base,
    kind: "market",
    amenities: textList(r.amenities),
    parking: adminText(r.parking),
    transit: adminText(r.transit),
    ...(typeof r.petFriendly === "boolean"
      ? { petFriendly: r.petFriendly }
      : {}),
    ...(typeof r.familyFriendly === "boolean"
      ? { familyFriendly: r.familyFriendly }
      : {}),
    occurrences: (Array.isArray(r.occurrences) ? r.occurrences : []).map(
      (v, i) => {
        const o = adminObject(v);
        return {
          sourceRecordId: adminText(o.sourceRecordId, `date-${i}`),
          start: adminText(o.start),
          end: adminText(o.end),
          cancelled: o.cancelled === true,
        };
      },
    ),
  };
}
/** Presentation normalization never invents claim identity or approval authority. */
export function adminClaim(value: unknown): ListingClaim | undefined {
  const r = adminObject(value);
  if (
    typeof r.uid !== "string" ||
    !r.uid ||
    typeof r.entityId !== "string" ||
    !r.entityId ||
    !["pending", "approved", "rejected"].includes(String(r.status))
  )
    return undefined;
  return {
    ...r,
    uid: r.uid,
    entityId: r.entityId,
    status: r.status,
    entityTitle: adminText(r.entityTitle, r.entityId),
    entityPath: adminText(r.entityPath),
    name: adminText(r.name, "Name not recorded"),
    role: adminText(r.role),
    accountEmail: adminText(r.accountEmail),
    workEmail: adminText(r.workEmail),
    phone: adminText(r.phone),
    note: adminText(r.note),
    createdAt: adminTimestamp(r.createdAt) ?? 0,
    reviewedAt: adminTimestamp(r.reviewedAt),
    reviewedBy: adminText(r.reviewedBy),
    reviewNote: adminText(r.reviewNote),
    approvedOrganizationId: adminText(r.approvedOrganizationId) || undefined,
    approvalEmailStatus: adminText(r.approvalEmailStatus) || undefined,
    approvalEmailError: adminText(r.approvalEmailError) || undefined,
  } as ListingClaim;
}
