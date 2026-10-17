import { TimeAgo } from "./ui";
export function AdminSnapshotNotice({ updatedAt }: { updatedAt?: number }) {
  if (!updatedAt || Date.now() - updatedAt < 48 * 3_600_000) return null;
  return (
    <p role="status" className="admin-read-warning">
      This snapshot was updated <TimeAgo ts={updatedAt} /> and is more than two
      days old. Recheck the source before acting on it.
    </p>
  );
}
