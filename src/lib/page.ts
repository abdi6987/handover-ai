import { notFound } from "next/navigation";
import { requireUser } from "./auth";
import { db } from "./db";
import { getRental, roleOf } from "./rentals";

/** Load the rental for a page, 404 if the viewer isn't part of it. */
export async function loadRental(idParam: string) {
  const user = await requireUser();
  const rental = getRental(Number(idParam));
  if (!rental) notFound();
  const role = roleOf(rental, user);
  if (!role) notFound();
  const names = new Map((db().prepare("SELECT id, name FROM users WHERE id IN (?, ?)").all(rental.owner_id ?? 0, rental.tenant_id ?? 0) as { id: number; name: string }[]).map((u) => [u.id, u.name]));
  return { user, rental, role, names };
}
