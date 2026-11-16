import { db } from "./db";
import { fullySigned, listRentals, stage } from "./rentals";
import type { Issue, Rental, Role, User } from "./types";

export type Todo = { href: string; title: string; text: string; tone: "amber" | "red" | "blue" | "green" };

export async function dashboardData(user: User, role: Role, t: (s: string, v?: Record<string, string | number>) => string = (s) => s) {
  const rentals = (await listRentals(user.id)).filter((r) => (role === "owner" ? r.owner_id : r.tenant_id) === user.id);
  const ids = rentals.length ? rentals.map((r) => r.id) : [0];
  const q = ids.map(() => "?").join(",");
  const issues = await db().prepare(`SELECT i.*, u.name reporter_name, r.name rental_name FROM issues i JOIN users u ON u.id = i.reported_by JOIN rentals r ON r.id = i.rental_id WHERE i.rental_id IN (${q}) ORDER BY i.created_at DESC`).all(...ids) as (Issue & { reporter_name: string; rental_name: string })[];
  const pendingItems = await db().prepare(`SELECT c.rental_id, COUNT(*) n FROM comparison_items ci JOIN comparisons c ON c.id = ci.comparison_id
    WHERE c.rental_id IN (${q}) AND ci.${role}_response IS NULL AND c.id = (SELECT MAX(id) FROM comparisons WHERE rental_id = c.rental_id AND status='done') GROUP BY c.rental_id`).all(...ids) as { rental_id: number; n: number }[];
  const names = new Map((await db().prepare(`SELECT id, name FROM users WHERE id IN (SELECT owner_id FROM rentals WHERE id IN (${q}) UNION SELECT tenant_id FROM rentals WHERE id IN (${q}))`).all(...ids, ...ids) as { id: number; name: string }[]).map((u) => [u.id, u.name]));

  const todos: Todo[] = [];
  for (const r of rentals) {
    const base = `/rentals/${r.id}`;
    const otherId = role === "owner" ? r.tenant_id : r.owner_id;
    if (!otherId) todos.push({ href: base, title: role === "owner" ? t("Invite the tenant") : t("Invite the landlord"), text: r.name, tone: "blue" });
    else if (r.movein_status === "submitted" && role === "owner") todos.push({ href: `${base}/move-in`, title: t("Approve move-in photos"), text: t("{name}: the lease can't be signed until you approve", { name: r.name }), tone: "amber" });
    else if (r.movein_status === "changes_requested" && role === "tenant") todos.push({ href: `${base}/move-in`, title: t("Add the move-in pictures the landlord asked for"), text: r.movein_note ?? r.name, tone: "red" });
    else if (r.movein_status === "open" && role === "tenant") todos.push({ href: `${base}/move-in`, title: t("Record the move-in condition"), text: t("{name}: photos and videos of every room", { name: r.name }), tone: "amber" });
    else if (r.movein_status === "approved" && !r[`${role}_signed_at`]) todos.push({ href: `${base}/lease`, title: t("Sign the lease"), text: r.name, tone: "amber" });
    const p = pendingItems.find((x) => x.rental_id === r.id);
    if (p) todos.push({ href: `${base}/move-out`, title: t("Review {n} AI move-out findings", { n: p.n }), text: r.name, tone: "amber" });
  }
  for (const i of issues) {
    const href = `/rentals/${i.rental_id}/issues/${i.id}`;
    if (i.status === "reported" && i.reported_by !== user.id) todos.push({ href, title: t("New report: {title}", { title: i.title }), text: t("{rental} · by {name}", { rental: i.rental_name, name: i.reporter_name }), tone: "red" });
    if (i.status === "done" && !i.confirmed_at && i.done_by !== user.id) todos.push({ href, title: t("Confirm the fix: {title}", { title: i.title }), text: i.rental_name, tone: "green" });
  }
  return { rentals, issues, todos, names, openIssues: issues.filter((i) => i.status !== "done") };
}

export function rentalStage(r: Rental) { return { ...stage(r), active: fullySigned(r) && !r.ended_at }; }
