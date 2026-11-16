import { bad, handler, num, str } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { rentalForUser } from "@/lib/rentals";
import { notifyUser } from "@/lib/notify";

/** Edit lease details. Allowed only until someone signs. */
export const PATCH = handler(async (req, user, p) => {
  const { rental, role } = await rentalForUser(Number(p.id), user);
  if (rental.owner_signed_at || rental.tenant_signed_at) bad("The lease has been signed and can no longer be edited");
  const b = await req.json();
  const fields = {
    name: str(b.name, 120) || rental.name, address: str(b.address, 300) || rental.address,
    rent: num(b.rent), currency: str(b.currency, 8) || rental.currency, deposit: num(b.deposit),
    start_date: str(b.start_date, 10) || null, end_date: str(b.end_date, 10) || null, terms: str(b.terms, 20000),
  };
  await db().prepare(`UPDATE rentals SET name=@name, address=@address, rent=@rent, currency=@currency, deposit=@deposit, start_date=@start_date, end_date=@end_date, terms=@terms WHERE id=${rental.id}`).run(fields);
  await audit(rental.id, user.id, "lease.edited", fields);
  await notifyUser(role === "owner" ? rental.tenant_id : rental.owner_id, `Lease details updated for "${fields.name}"`, `${user.name} updated the lease details. Please review them before signing.`, `/rentals/${rental.id}/lease`);
});
