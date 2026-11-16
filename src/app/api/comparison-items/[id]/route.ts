import { bad, handler, str } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { HttpError, rentalForUser } from "@/lib/rentals";
import { notifyUser } from "@/lib/notify";

type Item = { id: number; comparison_id: number; title: string; owner_response: string | null; tenant_response: string | null };

export const POST = handler(async (req, user, p) => {
  const item = db().prepare("SELECT * FROM comparison_items WHERE id = ?").get(Number(p.id)) as Item | undefined;
  if (!item) throw new HttpError(404, "Item not found");
  const { rental_id } = db().prepare("SELECT rental_id FROM comparisons WHERE id = ?").get(item.comparison_id) as { rental_id: number };
  const { rental, role } = rentalForUser(rental_id, user);
  const b = await req.json();
  const response = str(b.response);
  if (!["agree", "dispute"].includes(response)) bad("Agree or dispute");
  const note = str(b.note, 2000) || null;
  db().prepare(`UPDATE comparison_items SET ${role}_response = ?, ${role}_note = ? WHERE id = ?`).run(response, note, item.id);
  const fresh = db().prepare("SELECT * FROM comparison_items WHERE id = ?").get(item.id) as Item;
  const status = fresh.owner_response === "agree" && fresh.tenant_response === "agree" ? "agreed" : fresh.owner_response === "dispute" || fresh.tenant_response === "dispute" ? "disputed" : "pending";
  db().prepare("UPDATE comparison_items SET status = ? WHERE id = ?").run(status, item.id);
  audit(rental.id, user.id, `comparison_item.${response}`, { item_id: item.id, title: item.title, note });
  if (response === "dispute")
    await notifyUser(role === "owner" ? rental.tenant_id : rental.owner_id, `${user.name} disputed "${item.title}"`, `${user.name} disputed an item in the move-out report${note ? `:\n\n${note}` : "."}`, `/rentals/${rental.id}/move-out`);
});
