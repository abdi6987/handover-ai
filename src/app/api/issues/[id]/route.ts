import { bad, handler, num, str } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db, now } from "@/lib/db";
import { saveUpload } from "@/lib/storage";
import { notifyUser } from "@/lib/notify";
import { getStaff, issueAccess } from "@/lib/staff";
import { ISSUE_STATUS, type Issue } from "@/lib/types";

export const POST = handler(async (req, user, p) => {
  const { issue, rental, role } = issueAccess(Number(p.id), user);
  const form = await req.formData();
  const action = str(form.get("action"));
  const body = str(form.get("body"), 5000) || null;
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  let status: Issue["status"] | null = null;
  let subject = "";

  if (action === "cost") {
    if (role !== "owner") bad("Only the landlord records costs");
    db().prepare("UPDATE issues SET repair_cost = ?, cost_note = ? WHERE id = ?").run(num(form.get("repair_cost")), body, issue.id);
    return; // private to the landlord: not shared in the activity log
  }
  if (action === "assign") {
    if (role !== "owner") bad("Only the landlord assigns staff");
    const sid = num(form.get("staff_id"));
    const s = sid ? getStaff(sid) : null;
    if (sid && (!s || s.owner_id !== user.id || s.removed_at)) bad("Unknown staff member");
    db().prepare("UPDATE issues SET assigned_to = ? WHERE id = ?").run(s?.id ?? null, issue.id);
    audit(rental.id, user.id, "issue.assigned", { issue_id: issue.id, staff: s?.name ?? null });
    if (s?.user_id) await notifyUser(s.user_id, `New job: ${issue.title}`, `${user.name} assigned you a job at "${rental.name}" (${rental.address})${issue.room ? `, ${issue.room}` : ""}:\n\n${issue.title}\n${issue.description}`, `/jobs/${issue.id}`);
    if (s) await notifyUser(rental.tenant_id, `${s.name} will handle "${issue.title}"`, `${user.name} assigned ${s.name}${s.trade ? ` (${s.trade})` : ""} to your report "${issue.title}". They may contact you to arrange a visit.`, `/rentals/${rental.id}/issues/${issue.id}`);
    return;
  }
  if (action === "comment") {
    if (!body && !files.length) bad("Write a comment or attach a photo");
    subject = `New update on "${issue.title}"`;
  } else if (action === "status") {
    status = str(form.get("status")) as Issue["status"];
    if (!(status in ISSUE_STATUS)) bad("Unknown status");
    if (status === issue.status) bad("The issue already has this status");
    if (role === "staff" && status === "disputed") bad("Staff can't dispute a report");
    if (status === "done") {
      db().prepare("UPDATE issues SET status='done', done_at=?, done_by=?, confirmed_at=NULL, confirmed_by=NULL WHERE id=?").run(now(), user.id, issue.id);
      subject = `Marked Done: "${issue.title}"`;
    } else {
      db().prepare("UPDATE issues SET status=?, done_at=NULL, done_by=NULL, confirmed_at=NULL, confirmed_by=NULL WHERE id=?").run(status, issue.id);
      subject = issue.status === "done" ? `Reopened: "${issue.title}"` : `"${issue.title}" is now ${ISSUE_STATUS[status].toLowerCase()}`;
    }
  } else if (action === "confirm") {
    if (role === "staff") bad("The tenant or landlord confirms the fix");
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
  audit(rental.id, user.id, `issue.${action}`, { issue_id: issue.id, status, body, media, by_staff: role === "staff" || undefined });

  // Everyone involved hears about it, except the person who acted.
  const msg = `${user.name}${role === "staff" ? " (staff)" : ""}: ${subject}${body ? `\n\n${body}` : ""}`;
  const path = `/rentals/${rental.id}/issues/${issue.id}`;
  if (rental.owner_id !== user.id) await notifyUser(rental.owner_id, subject, msg, path);
  if (rental.tenant_id !== user.id) await notifyUser(rental.tenant_id, subject, msg, path);
  const assignee = getStaff(issue.assigned_to);
  if (assignee?.user_id && assignee.user_id !== user.id) await notifyUser(assignee.user_id, subject, msg, `/jobs/${issue.id}`);
});
