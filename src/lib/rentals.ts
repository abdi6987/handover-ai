import { db, now } from "./db";
import { canonical, sha256 } from "./hash";
import { hashFileOnDisk } from "./storage";
import type { Issue, Media, Rental, Role, User } from "./types";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function getRental(id: number): Promise<Rental | null> {
  return (await db().prepare("SELECT * FROM rentals WHERE id = ?").get(id) as Rental) ?? null;
}

export function roleOf(r: Rental, user: Pick<User, "id">): Role | null {
  if (r.owner_id === user.id) return "owner";
  if (r.tenant_id === user.id) return "tenant";
  return null;
}

export async function rentalForUser(id: number, user: Pick<User, "id">): Promise<{ rental: Rental; role: Role }> {
  const rental = await getRental(id);
  if (!rental) throw new HttpError(404, "Rental not found");
  const role = roleOf(rental, user);
  if (!role) throw new HttpError(403, "You are not part of this rental");
  return { rental, role };
}

export function otherPartyId(r: Rental, role: Role) {
  return role === "owner" ? r.tenant_id : r.owner_id;
}

export async function listRentals(userId: number) {
  return await db()
    .prepare("SELECT * FROM rentals WHERE owner_id = ? OR tenant_id = ? ORDER BY created_at DESC")
    .all(userId, userId) as Rental[];
}

export async function mediaFor(rentalId: number, context: Media["context"], refId?: number) {
  if (refId !== undefined)
    return await db().prepare("SELECT * FROM media WHERE rental_id = ? AND context = ? AND ref_id = ? AND deleted_at IS NULL ORDER BY id").all(rentalId, context, refId) as Media[];
  return await db().prepare("SELECT * FROM media WHERE rental_id = ? AND context = ? AND deleted_at IS NULL ORDER BY room, id").all(rentalId, context) as Media[];
}

export function moveInLocked(r: Rental) {
  return r.movein_status === "submitted" || r.movein_status === "approved";
}

export function fullySigned(r: Rental) {
  return !!(r.owner_signed_at && r.tenant_signed_at);
}

/** Manifest = exact list of files (and their fingerprints) the owner approved. */
export function buildManifest(rental: Rental, media: Media[]) {
  return {
    rental_id: rental.id,
    files: media.map((m) => ({ id: m.id, room: m.room, kind: m.kind, name: m.original_name, size: m.size, sha256: m.sha256, uploaded_by: m.uploaded_by, uploaded_at: m.uploaded_at })),
  };
}

export function sealOf(manifest: unknown, approvedAt: string, approvedBy: number) {
  return sha256(canonical({ manifest, approved_at: approvedAt, approved_by: approvedBy }));
}

export function leaseTerms(r: Rental) {
  return { name: r.name, address: r.address, rent: r.rent, currency: r.currency, deposit: r.deposit, start_date: r.start_date, end_date: r.end_date, terms: r.terms, owner_id: r.owner_id, tenant_id: r.tenant_id };
}

export function signatureHash(r: Rental, userId: number, name: string, at: string) {
  return sha256(canonical({ lease: leaseTerms(r), movein_seal: r.movein_seal, signer: userId, name, signed_at: at }));
}

/** Full integrity check used by the proof page. */
export async function verifyRental(r: Rental) {
  const checks: { label: string; ok: boolean; detail?: string; vars?: Record<string, string> }[] = [];
  if (r.movein_seal && r.movein_manifest && r.movein_approved_at && r.movein_approved_by) {
    const manifest = JSON.parse(r.movein_manifest) as ReturnType<typeof buildManifest>;
    const sealOk = sealOf(manifest, r.movein_approved_at, r.movein_approved_by) === r.movein_seal;
    checks.push({ label: "Move-in seal matches the approved file list", ok: sealOk });
    const current = await mediaFor(r.id, "move_in");
    const sameSet = canonical(current.map((m) => m.id).sort()) === canonical(manifest.files.map((f) => f.id).sort());
    checks.push({ label: "No move-in files added or removed after approval", ok: sameSet });
    for (const f of manifest.files) {
      const m = await db().prepare("SELECT * FROM media WHERE id = ?").get(f.id) as Media | undefined;
      const disk = m ? hashFileOnDisk(m) : null;
      checks.push({ label: "File \"{name}\" ({room}) unchanged", vars: { name: f.name, room: f.room ?? "" }, ok: disk === f.sha256 && m?.sha256 === f.sha256, detail: f.sha256.slice(0, 16) });
    }
  } else {
    checks.push({ label: "Move-in media not yet approved", ok: false });
  }
  for (const side of ["owner", "tenant"] as const) {
    const at = r[`${side}_signed_at`], nm = r[`${side}_sign_name`], h = r[`${side}_sign_hash`];
    const uid = side === "owner" ? r.owner_id : r.tenant_id;
    if (at && nm && h && uid) checks.push({ label: side === "owner" ? "Owner signature valid for these lease terms and seal" : "Tenant signature valid for these lease terms and seal", ok: signatureHash(r, uid, nm, at) === h });
  }
  return checks;
}

export async function issuesFor(rentalId: number) {
  return await db()
    .prepare(`SELECT i.*, u.name AS reporter_name FROM issues i JOIN users u ON u.id = i.reported_by WHERE i.rental_id = ? ORDER BY i.created_at DESC`)
    .all(rentalId) as (Issue & { reporter_name: string })[];
}

export function stage(r: Rental): { step: number; label: string } {
  if (!r.owner_id || !r.tenant_id) return { step: 0, label: "Waiting for the other side to join" };
  if (r.movein_status !== "approved") return { step: 1, label: r.movein_status === "submitted" ? "Move-in photos waiting for owner approval" : "Move-in photos and videos" };
  if (!fullySigned(r)) return { step: 2, label: "Ready to sign the lease" };
  if (!r.ended_at) return { step: 3, label: "Lease active" };
  return { step: 4, label: "Moved out" };
}

export { now };
