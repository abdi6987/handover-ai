import crypto from "node:crypto";
import { db, now } from "./db";
import { audit } from "./audit";
import { getRental, HttpError } from "./rentals";
import { appUrl, notifyUser, sendEmail, whatsappLink } from "./notify";
import type { Rental, Role, User } from "./types";

export type Invite = { token: string; rental_id: number; role: Role; email: string | null; created_by: number; created_at: string; accepted_at: string | null };

export function getInvite(token: string) {
  return (db().prepare("SELECT * FROM invites WHERE token = ?").get(token) as Invite) ?? null;
}

export function inviteText(r: Rental, inviter: User, role: Role, link: string) {
  return `${inviter.name} invited you to join "${r.name}" (${r.address}) on Handover AI as the ${role}. Move-in photos, the lease, repairs and reports are all kept in one shared, timestamped record.\n\nJoin here: ${link}`;
}

export async function createInvite(r: Rental, inviter: User, role: Role, email: string | null) {
  const token = crypto.randomBytes(18).toString("base64url");
  db().prepare("INSERT INTO invites (token, rental_id, role, email, created_by, created_at) VALUES (?,?,?,?,?,?)")
    .run(token, r.id, role, email?.toLowerCase() || null, inviter.id, now());
  const path = `/invite/${token}`;
  const link = appUrl(path);
  const text = inviteText(r, inviter, role, link);
  audit(r.id, inviter.id, "invite.created", { role, email: email || null, via: email ? "email" : "link" });
  if (email) await sendEmail(email, `${inviter.name} invited you to "${r.name}" on Handover AI`, text.replace(`\n\nJoin here: ${link}`, ""), path);
  return { token, link, whatsapp: whatsappLink(text), emailed: !!email };
}

export async function acceptInvite(token: string, user: User): Promise<number> {
  const inv = getInvite(token);
  if (!inv) throw new HttpError(404, "This invite link is not valid");
  const r = getRental(inv.rental_id)!;
  const slot = inv.role === "owner" ? "owner_id" : "tenant_id";
  if (r.owner_id === user.id || r.tenant_id === user.id) {
    if (r[slot] === user.id) return r.id; // already joined
    throw new HttpError(400, "You are already the other party on this rental. Ask them to share the invite with the right person.");
  }
  if (r[slot]) throw new HttpError(400, `This rental already has a ${inv.role}.`);
  db().prepare(`UPDATE rentals SET ${slot} = ? WHERE id = ?`).run(user.id, r.id);
  db().prepare("UPDATE invites SET accepted_at = ?, accepted_by = ? WHERE token = ?").run(now(), user.id, token);
  audit(r.id, user.id, "invite.accepted", { role: inv.role });
  await notifyUser(inv.created_by, `${user.name} joined "${r.name}"`, `${user.name} accepted your invite and joined "${r.name}" as the ${inv.role}.`, `/rentals/${r.id}`);
  return r.id;
}
