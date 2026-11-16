import { bad, handler } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db, now } from "@/lib/db";
import { HttpError, moveInLocked, rentalForUser } from "@/lib/rentals";
import type { Media } from "@/lib/types";

/** Files are never physically deleted: they're hidden and the removal is logged. */
export const DELETE = handler(async (_req, user, p) => {
  const m = await db().prepare("SELECT * FROM media WHERE id = ? AND deleted_at IS NULL").get(Number(p.id)) as Media | undefined;
  if (!m) throw new HttpError(404, "File not found");
  const { rental } = await rentalForUser(m.rental_id, user);
  if (m.uploaded_by !== user.id) bad("Only the person who uploaded a file can remove it");
  if (m.context === "move_in" && moveInLocked(rental)) bad("Move-in media is locked");
  if (m.context === "issue") bad("Report attachments are part of the permanent log");
  await db().prepare("UPDATE media SET deleted_at = ? WHERE id = ?").run(now(), m.id);
  await audit(rental.id, user.id, "media.removed", { media_id: m.id, context: m.context, name: m.original_name, sha256: m.sha256 });
});
