import { bad, handler, num, str } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db, now } from "@/lib/db";
import { otherPartyId, rentalForUser } from "@/lib/rentals";
import { saveUpload } from "@/lib/storage";
import { notifyUser } from "@/lib/notify";
import { ISSUE_CATEGORIES, ISSUE_TYPES, URGENCY, type Issue } from "@/lib/types";

export const POST = handler(async (req, user, p) => {
  const { rental, role } = await rentalForUser(Number(p.id), user);
  const form = await req.formData();
  const type = str(form.get("type")) as Issue["type"];
  if (!(type in ISSUE_TYPES)) bad("Pick what kind of issue this is");
  const title = str(form.get("title"), 150), description = str(form.get("description"), 5000), room = str(form.get("room"), 60) || null;
  const category = str(form.get("category"), 30) || "other";
  if (!(category in ISSUE_CATEGORIES)) bad("Pick a category");
  const urgency = (["urgent", "normal", "low"].includes(str(form.get("urgency"))) ? str(form.get("urgency")) : "normal") as keyof typeof URGENCY;
  if (!title) bad("Give the issue a short title");
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (role === "tenant" && !description && !files.length) bad("Describe the problem or attach a photo, video or voice note");
  const info = await db().prepare("INSERT INTO issues (rental_id, type, category, urgency, room, title, description, reported_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(rental.id, type, category, urgency, room, title, description, user.id, now());
  const id = Number(info.lastInsertRowid);
  if (role === "owner") {
    // Landlord-only fields: what the repair/upkeep cost, and logging work that's already finished.
    const cost = num(form.get("repair_cost"));
    if (cost !== null) await db().prepare("UPDATE issues SET repair_cost = ?, cost_note = ? WHERE id = ?").run(cost, str(form.get("cost_note"), 300) || null, id);
    if (str(form.get("already_done")) === "true") await db().prepare("UPDATE issues SET status='done', done_at=?, done_by=? WHERE id=?").run(now(), user.id, id);
  }
  const media = [];
  for (const f of files) {
    const m = await saveUpload(f, { rentalId: rental.id, context: "issue", refId: id, room, userId: user.id });
    media.push({ id: m.id, sha256: m.sha256, name: m.original_name });
  }
  await audit(rental.id, user.id, "issue.reported", { issue_id: id, type, category, urgency, room, title, description, media });
  await notifyUser(otherPartyId(rental, role), `${urgency === "urgent" ? "URGENT: " : ""}${ISSUE_CATEGORIES[category].icon} ${title} (${ISSUE_CATEGORIES[category].label})`,
    `${user.name} reported an issue at "${rental.name}"${room ? ` (${room})` : ""}:\n\n${title}\n${description}`, `/rentals/${rental.id}/issues/${id}`);
  return { id, redirect: `/rentals/${rental.id}/issues/${id}?new=1` };
});
