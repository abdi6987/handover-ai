import { bad, handler, str } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db, now } from "@/lib/db";
import { getRental, rentalForUser, signatureHash } from "@/lib/rentals";
import { notifyUser } from "@/lib/notify";

export const POST = handler(async (req, user, p) => {
  const { rental, role } = rentalForUser(Number(p.id), user);
  const b = await req.json();
  // Core rule: no signature until the owner has approved and sealed the move-in media.
  if (rental.movein_status !== "approved" || !rental.movein_seal) bad("The lease can only be signed after the owner approves the move-in photos and videos");
  if (rental[`${role}_signed_at`]) bad("You already signed");
  const name = str(b.name, 120);
  if (!name || b.agree !== true) bad("Type your full name and tick the box to sign");
  const at = now();
  const hash = signatureHash(rental, user.id, name, at);
  db().prepare(`UPDATE rentals SET ${role}_signed_at=?, ${role}_sign_name=?, ${role}_sign_hash=? WHERE id=?`).run(at, name, hash, rental.id);
  audit(rental.id, user.id, "lease.signed", { role, name, signature: hash, movein_seal: rental.movein_seal });
  const updated = getRental(rental.id)!;
  const both = updated.owner_signed_at && updated.tenant_signed_at;
  await notifyUser(role === "owner" ? rental.tenant_id : rental.owner_id,
    both ? `Lease fully signed: "${rental.name}"` : `${user.name} signed the lease for "${rental.name}"`,
    both ? `Both sides have signed. The lease is active, and the sealed move-in photos are your shared proof of the starting condition.` : `${user.name} signed the lease. It's your turn to sign.`,
    `/rentals/${rental.id}/lease`);
});
