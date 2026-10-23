import type { ProspectStatus } from "./schemas";

const CHEAP_EXACT = new Set([
  "Missing email",
  "Missing website",
  "Email bounced",
]);

export function isCheapReason(reason: string | null): boolean {
  if (!reason) return false;
  return (
    CHEAP_EXACT.has(reason) ||
    reason.startsWith("Email not verified") ||
    reason.startsWith("Qualify Contact")
  );
}

const LOCKED = new Set<ProspectStatus>(["sent", "replied"]);

/**
 * Re-uploading a sheet must not duplicate a person or rewind a sent email.
 * Cheap rejects apply until the message has already gone out.
 * A model reject stays rejected until a person changes it by preparing again
 * only when the stored reason was a cheap rule and the new row passes.
 */
export function applyImportStatus(
  current: { status: ProspectStatus; rejectReason: string | null },
  cheapReject: string | null,
): { status: ProspectStatus; rejectReason: string | null } {
  if (LOCKED.has(current.status)) {
    return { status: current.status, rejectReason: current.rejectReason };
  }
  if (cheapReject) {
    return { status: "rejected", rejectReason: cheapReject };
  }
  if (current.status === "rejected" && isCheapReason(current.rejectReason)) {
    return { status: "imported", rejectReason: null };
  }
  return { status: current.status, rejectReason: current.rejectReason };
}
