import { bad, handler, num, str } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db, now } from "@/lib/db";
import { createInvite } from "@/lib/invites";
import { getRental } from "@/lib/rentals";
import type { Role } from "@/lib/types";

export const POST = handler(async (req, user) => {
  const b = await req.json();
  const role: Role = b.myRole === "tenant" ? "tenant" : "owner";
  const name = str(b.name, 120), address = str(b.address, 300);
  if (!name || !address) bad("Give the rental a name and address");
  const otherEmail = str(b.otherEmail, 200).toLowerCase();
  if (otherEmail && otherEmail === user.email) bad("Invite the other side, not yourself");
  const info = db().prepare(
    `INSERT INTO rentals (name, address, owner_id, tenant_id, created_by, rent, currency, deposit, start_date, end_date, terms, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(name, address, role === "owner" ? user.id : null, role === "tenant" ? user.id : null, user.id,
    num(b.rent), str(b.currency, 8) || "QAR", num(b.deposit), str(b.start_date, 10) || null, str(b.end_date, 10) || null, str(b.terms, 20000), now());
  const id = Number(info.lastInsertRowid);
  audit(id, user.id, "rental.created", { role, name, address });
  const invite = await createInvite(getRental(id)!, user, role === "owner" ? "tenant" : "owner", otherEmail || null);
  return { id, invite };
});
