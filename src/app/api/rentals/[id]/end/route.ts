import { bad, handler } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db, now } from "@/lib/db";
import { fullySigned, rentalForUser } from "@/lib/rentals";
import { notifyUser } from "@/lib/notify";

export const POST = handler(async (_req, user, p) => {
  const { rental, role } = rentalForUser(Number(p.id), user);
  if (role !== "owner") bad("Only the owner can close the rental");
  if (!fullySigned(rental)) bad("The lease isn't active yet");
  db().prepare("UPDATE rentals SET ended_at = ? WHERE id = ?").run(now(), rental.id);
  audit(rental.id, user.id, "rental.closed", {});
  await notifyUser(rental.tenant_id, `"${rental.name}" was closed`, `${user.name} closed the rental after move-out. The full record stays available in Handover AI.`, `/rentals/${rental.id}`);
});
