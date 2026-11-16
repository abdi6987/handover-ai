import { db } from "./db";
import { fullySigned, listRentals, stage } from "./rentals";
import type { Issue, Rental, Role, User } from "./types";

export type Todo = { href: string; title: string; text: string; tone: "amber" | "red" | "blue" | "green" };

export function dashboardData(user: User, role: Role) {
  const rentals = listRentals(user.id).filter((r) => (role === "owner" ? r.owner_id : r.tenant_id) === user.id);
  const ids = rentals.length ? rentals.map((r) => r.id) : [0];
  const q = ids.map(() => "?").join(",");
  const issues = db().prepare(`SELECT i.*, u.name reporter_name, r.name rental_name FROM issues i JOIN users u ON u.id = i.reported_by JOIN rentals r ON r.id = i.rental_id WHERE i.rental_id IN (${q}) ORDER BY i.created_at DESC`).all(...ids) as (Issue & { reporter_name: string; rental_name: string })[];
  const pendingItems = db().prepare(`SELECT c.rental_id, COUNT(*) n FROM comparison_items ci JOIN comparisons c ON c.id = ci.comparison_id
    WHERE c.rental_id IN (${q}) AND ci.${role}_response IS NULL AND c.id = (SELECT MAX(id) FROM comparisons WHERE rental_id = c.rental_id AND status='done') GROUP BY c.rental_id`).all(...ids) as { rental_id: number; n: number }[];
  const names = new Map((db().prepare(`SELECT id, name FROM users WHERE id IN (SELECT owner_id FROM rentals WHERE id IN (${q}) UNION SELECT tenant_id FROM rentals WHERE id IN (${q}))`).all(...ids, ...ids) as { id: number; name: string }[]).map((u) => [u.id, u.name]));

  const todos: Todo[] = [];
  for (const r of rentals) {
    const base = `/rentals/${r.id}`;
    const otherId = role === "owner" ? r.tenant_id : r.owner_id;
    if (!otherId) todos.push({ href: base, title: `Invite the ${role === "owner" ? "tenant" : "landlord"}`, text: r.name, tone: "blue" });
    else if (r.movein_status === "submitted" && role === "owner") todos.push({ href: `${base}/move-in`, title: "Approve move-in photos", text: `${r.name}: the lease can't be signed until you approve`, tone: "amber" });
    else if (r.movein_status === "changes_requested" && role === "tenant") todos.push({ href: `${base}/move-in`, title: "Add the move-in pictures the landlord asked for", text: r.movein_note ?? r.name, tone: "red" });
    else if (r.movein_status === "open" && role === "tenant") todos.push({ href: `${base}/move-in`, title: "Record the move-in condition", text: `${r.name}: photos and videos of every room`, tone: "amber" });
    else if (r.movein_status === "approved" && !r[`${role}_signed_at`]) todos.push({ href: `${base}/lease`, title: "Sign the lease", text: r.name, tone: "amber" });
    const p = pendingItems.find((x) => x.rental_id === r.id);
    if (p) todos.push({ href: `${base}/move-out`, title: `Review ${p.n} AI move-out finding${p.n > 1 ? "s" : ""}`, text: r.name, tone: "amber" });
  }
  for (const i of issues) {
    const href = `/rentals/${i.rental_id}/issues/${i.id}`;
    if (i.status === "reported" && i.reported_by !== user.id) todos.push({ href, title: `New report: ${i.title}`, text: `${i.rental_name} · by ${i.reporter_name}`, tone: "red" });
    if (i.status === "done" && !i.confirmed_at && i.done_by !== user.id) todos.push({ href, title: `Confirm the fix: ${i.title}`, text: i.rental_name, tone: "green" });
  }
  return { rentals, issues, todos, names, openIssues: issues.filter((i) => i.status !== "done") };
}

export function rentalStage(r: Rental) { return { ...stage(r), active: fullySigned(r) && !r.ended_at }; }
