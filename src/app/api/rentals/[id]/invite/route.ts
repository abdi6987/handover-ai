import { bad, handler, str } from "@/lib/api";
import { createInvite } from "@/lib/invites";
import { rentalForUser } from "@/lib/rentals";

export const POST = handler(async (req, user, p) => {
  const { rental, role } = rentalForUser(Number(p.id), user);
  const other = role === "owner" ? "tenant" : "owner";
  if ((other === "owner" ? rental.owner_id : rental.tenant_id)) bad(`The ${other} has already joined`);
  const b = await req.json().catch(() => ({}));
  return createInvite(rental, user, other, str(b.email, 200) || null);
});
