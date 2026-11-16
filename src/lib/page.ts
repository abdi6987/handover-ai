import { notFound } from "next/navigation";
import { requireUser, userNames } from "./auth";
import { getRental, roleOf } from "./rentals";

/** Load the rental for a page, 404 if the viewer isn't part of it. */
export async function loadRental(idParam: string) {
  const user = await requireUser();
  const rental = await getRental(Number(idParam));
  if (!rental) notFound();
  const role = roleOf(rental, user);
  if (!role) notFound();
  const names = await userNames([rental.owner_id, rental.tenant_id]);
  return { user, rental, role, names };
}
