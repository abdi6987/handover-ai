import { bad, handler, num, str } from "@/lib/api";
import { db, now } from "@/lib/db";
import { rentalForUser } from "@/lib/rentals";
import { saveUpload } from "@/lib/storage";
import { BILL_CATEGORIES } from "@/lib/types";

/** Tenant-only spending tracker. Not written to the shared audit log, so the owner never sees it. */
export const POST = handler(async (req, user, p) => {
  const { rental, role } = await rentalForUser(Number(p.id), user);
  if (role !== "tenant") bad("The spending tracker is only for the tenant");
  const form = await req.formData();
  const category = str(form.get("category"));
  if (!(category in BILL_CATEGORIES)) bad("Pick a category");
  const amount = num(form.get("amount"));
  if (amount === null || amount < 0) bad("Enter the amount");
  const period = str(form.get("period"), 7);
  if (!/^\d{4}-\d{2}$/.test(period)) bad("Pick the month the bill is for");
  const paid = str(form.get("paid")) === "on" || str(form.get("paid")) === "true";
  const info = await db().prepare("INSERT INTO bills (rental_id, user_id, category, amount, period, due_date, paid_at, note, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(rental.id, user.id, category, amount, period, str(form.get("due_date"), 10) || null, paid ? now() : null, str(form.get("note"), 500) || null, now());
  const file = form.get("file");
  if (file instanceof File && file.size > 0) await saveUpload(file, { rentalId: rental.id, context: "bill", refId: Number(info.lastInsertRowid), userId: user.id });
  return { id: Number(info.lastInsertRowid) };
});
