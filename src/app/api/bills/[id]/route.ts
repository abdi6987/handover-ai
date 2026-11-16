import { handler } from "@/lib/api";
import { db, now } from "@/lib/db";
import { HttpError } from "@/lib/rentals";

type Bill = { id: number; user_id: number; paid_at: string | null };
function own(id: number, userId: number) {
  const b = db().prepare("SELECT * FROM bills WHERE id = ?").get(id) as Bill | undefined;
  if (!b || b.user_id !== userId) throw new HttpError(404, "Bill not found");
  return b;
}
export const PATCH = handler(async (req, user, p) => {
  const b = own(Number(p.id), user.id);
  const body = await req.json();
  db().prepare("UPDATE bills SET paid_at = ? WHERE id = ?").run(body.paid ? (b.paid_at ?? now()) : null, b.id);
});
export const DELETE = handler(async (_req, user, p) => {
  const b = own(Number(p.id), user.id);
  db().prepare("UPDATE media SET deleted_at = ? WHERE context = 'bill' AND ref_id = ?").run(now(), b.id);
  db().prepare("DELETE FROM bills WHERE id = ?").run(b.id);
});
