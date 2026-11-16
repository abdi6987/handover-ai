import { handler } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db, now } from "@/lib/db";
import { HttpError } from "@/lib/rentals";
import { getStaff } from "@/lib/staff";

/** Remove a staff member: they lose access; their past updates stay in the log. */
export const DELETE = handler(async (_req, user, p) => {
  const s = getStaff(Number(p.id));
  if (!s || s.owner_id !== user.id) throw new HttpError(404, "Staff member not found");
  db().prepare("UPDATE staff SET removed_at = ? WHERE id = ?").run(now(), s.id);
  db().prepare("UPDATE issues SET assigned_to = NULL WHERE assigned_to = ? AND status != 'done'").run(s.id);
  audit(null, user.id, "staff.removed", { staff_id: s.id, name: s.name });
});
