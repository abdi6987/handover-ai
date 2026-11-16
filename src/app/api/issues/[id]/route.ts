import { bad, handler, str } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db, now } from "@/lib/db";
import { HttpError, otherPartyId, rentalForUser } from "@/lib/rentals";
import { saveUpload } from "@/lib/storage";
import { notifyUser } from "@/lib/notify";
import { ISSUE_STATUS, type Issue } from "@/lib/types";

export const POST = handler(async (req, user, p) => {
  const issue = db().prepare("SELECT * FROM issues WHERE id = ?").get(Number(p.id)) as Issue | undefined;
  if (!issue) throw new HttpError(404, "Issue not found");
  const { rental, role } = rentalForUser(issue.rental_id, user);
  const form = await req.formData();
  const action = str(form.get("action"));
  const body = str(form.get("body"), 5000) || null;
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  let status: Issue["status"] | null = null;
  const path = `/rentals/${rental.id}/issues/${issue.id}`;
  let subject = "";

  if (action === "comment") {
    if (!body && !files.length) bad("Write a comment or attach a photo");
    subject = `New update on "${issue.title}"`;
  } else if (action === "status") {
    status = str(form.get("status")) as Issue["status"];
    if (!(status in ISSUE_STATUS)) bad("Unknown status");
    if (status === issue.status) bad("The issue already has this status");
    if (status === "done") {
      db().prepare("UPDATE issues SET status='done', done_at=?, done_by=?, confirmed_at=NULL, confirmed_by=NULL WHERE id=?").run(now(), user.id, issue.id);
      subject = `Marked Done: "${issue.title}"`;
    } else {
      db().prepare("UPDATE issues SET status=?, done_at=NULL, done_by=NULL, confirmed_at=NULL, confirmed_by=NULL WHERE id=?").run(status, issue.id);
      subject = issue.status === "done" ? `Reopened: "${issue.title}"` : `"${issue.title}" is now ${ISSUE_STATUS[status].toLowerCase()}`;
    }
  } else if (action === "confirm") {
    if (issue.status !== "done") bad("Only Done issues can be confirmed");
    if (issue.done_by === user.id) bad("The other side confirms the fix");
    db().prepare("UPDATE issues SET confirmed_at=?, confirmed_by=? WHERE id=?").run(now(), user.id, issue.id);
    subject = `Fix confirmed: "${issue.title}"`;
  } else bad("Unknown action");

  const info = db().prepare("INSERT INTO issue_updates (issue_id, user_id, body, status, created_at) VALUES (?,?,?,?,?)")
    .run(issue.id, user.id, action === "confirm" ? (body ?? "Confirmed the fix") : body, status, now());
  const media = [];
  for (const f of files) {
    const m = await saveUpload(f, { rentalId: rental.id, context: "issue", refId: issue.id, room: issue.room, title: `update:${info.lastInsertRowid}`, userId: user.id });
    media.push({ id: m.id, sha256: m.sha256, name: m.original_name });
  }
  audit(rental.id, user.id, `issue.${action}`, { issue_id: issue.id, status, body, media });
  await notifyUser(otherPartyId(rental, role), subject, `${user.name}: ${subject}${body ? `\n\n${body}` : ""}`, path);
});
