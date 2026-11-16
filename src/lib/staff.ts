import crypto from "node:crypto";
import { db, now } from "./db";
import { audit } from "./audit";
import { getRental, HttpError } from "./rentals";
import { appUrl, notifyUser, sendEmail, whatsappLink } from "./notify";
import type { Issue, Rental, Staff, User } from "./types";

export function staffOf(ownerId: number) {
  return db().prepare("SELECT * FROM staff WHERE owner_id = ? AND removed_at IS NULL ORDER BY name").all(ownerId) as Staff[];
}
export function getStaff(id: number | null | undefined) {
  return id ? ((db().prepare("SELECT * FROM staff WHERE id = ?").get(id) as Staff) ?? null) : null;
}
export function staffByToken(token: string) {
  return (db().prepare("SELECT * FROM staff WHERE token = ? AND removed_at IS NULL").get(token) as Staff) ?? null;
}
/** Staff memberships of a logged-in staff user (they could work for several landlords). */
export function membershipsOf(userId: number) {
  return db().prepare("SELECT s.*, u.name owner_name FROM staff s JOIN users u ON u.id = s.owner_id WHERE s.user_id = ? AND s.removed_at IS NULL").all(userId) as (Staff & { owner_name: string })[];
}

export function staffInviteText(owner: User, s: Pick<Staff, "name" | "trade">, link: string) {
  return `Hi ${s.name}, ${owner.name} added you as ${s.trade || "maintenance"} staff on Handover AI. You'll see repair requests and tenant complaints for their properties and can update and close jobs from your phone.\n\nJoin here: ${link}`;
}

export async function createStaff(owner: User, input: { name: string; email: string | null; phone: string | null; trade: string | null }) {
  const token = crypto.randomBytes(18).toString("base64url");
  const info = db().prepare("INSERT INTO staff (owner_id, name, email, phone, trade, token, created_at) VALUES (?,?,?,?,?,?,?)")
    .run(owner.id, input.name, input.email, input.phone, input.trade, token, now());
  const link = appUrl(`/staff-invite/${token}`);
  const text = staffInviteText(owner, input, link);
  if (input.email) await sendEmail(input.email, `${owner.name} added you as staff on Handover AI`, text.replace(`\n\nJoin here: ${link}`, ""), `/staff-invite/${token}`);
  audit(null, owner.id, "staff.invited", { staff_id: Number(info.lastInsertRowid), name: input.name, trade: input.trade });
  return { id: Number(info.lastInsertRowid), link, whatsapp: whatsappLink(text, input.phone), emailed: !!input.email };
}

export async function acceptStaff(token: string, user: User) {
  const s = staffByToken(token);
  if (!s) throw new HttpError(404, "This staff invite isn't valid");
  if (s.user_id && s.user_id !== user.id) throw new HttpError(400, "This invite was already used by someone else");
  if (s.owner_id === user.id) throw new HttpError(400, "You can't add yourself as staff");
  db().prepare("UPDATE staff SET user_id = ?, accepted_at = COALESCE(accepted_at, ?) WHERE id = ?").run(user.id, now(), s.id);
  db().prepare("UPDATE users SET account_type = 'staff' WHERE id = ? AND id NOT IN (SELECT owner_id FROM rentals WHERE owner_id IS NOT NULL UNION SELECT tenant_id FROM rentals WHERE tenant_id IS NOT NULL)").run(user.id);
  audit(null, user.id, "staff.joined", { staff_id: s.id, owner_id: s.owner_id });
  await notifyUser(s.owner_id, `${user.name} joined your team`, `${user.name} accepted your staff invite. You can now assign repair requests to them.`, "/dashboard/landlord/staff");
}

export type IssueRole = "owner" | "tenant" | "staff";

/** Who may see/act on an issue: the rental's owner and tenant, plus the owner's active staff. */
export function issueAccess(issueId: number, user: Pick<User, "id">): { issue: Issue; rental: Rental; role: IssueRole; staff: Staff | null } {
  const issue = db().prepare("SELECT * FROM issues WHERE id = ?").get(issueId) as Issue | undefined;
  if (!issue) throw new HttpError(404, "Issue not found");
  const rental = getRental(issue.rental_id)!;
  if (rental.owner_id === user.id) return { issue, rental, role: "owner", staff: null };
  if (rental.tenant_id === user.id) return { issue, rental, role: "tenant", staff: null };
  const staff = db().prepare("SELECT * FROM staff WHERE owner_id = ? AND user_id = ? AND removed_at IS NULL").get(rental.owner_id, user.id) as Staff | undefined;
  if (staff) return { issue, rental, role: "staff", staff };
  throw new HttpError(403, "You don't have access to this issue");
}

/** Issues across all properties of the landlords this staff member works for. */
export function staffJobs(userId: number) {
  return db().prepare(`SELECT i.*, r.name rental_name, r.address, u.name reporter_name, s.name assignee_name, s.user_id assignee_user
    FROM issues i JOIN rentals r ON r.id = i.rental_id JOIN users u ON u.id = i.reported_by LEFT JOIN staff s ON s.id = i.assigned_to
    WHERE r.owner_id IN (SELECT owner_id FROM staff WHERE user_id = ? AND removed_at IS NULL)
    ORDER BY CASE WHEN i.status = 'done' THEN 1 ELSE 0 END, i.created_at DESC`).all(userId) as (Issue & { rental_name: string; address: string; reporter_name: string; assignee_name: string | null; assignee_user: number | null })[];
}
