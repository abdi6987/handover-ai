import { handler } from "@/lib/api";
import { landlordLog } from "@/lib/maintenance";
import { ISSUE_CATEGORIES, ISSUE_STATUS, ISSUE_TYPES } from "@/lib/types";

/** CSV export of the landlord's maintenance log across all properties. */
export const GET = handler(async (_req, user) => {
  const { rows } = await landlordLog(user.id);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Property", "Reported", "Type", "Category", "Urgency", "Room", "Title", "Description", "Reported by", "Status", "Assigned to", "Done", "Cost", "Cost note"];
  const lines = rows.map((r) => [r.rental_name, r.created_at, ISSUE_TYPES[r.type], r.category ? ISSUE_CATEGORIES[r.category]?.label : "", r.urgency, r.room, r.title, r.description, `${r.reporter_name} (${r.reporter_role === "owner" ? "landlord" : "tenant"})`, ISSUE_STATUS[r.status], r.assignee_name, r.done_at, r.repair_cost, r.cost_note].map(esc).join(","));
  return new Response([head.join(","), ...lines].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="maintenance-log.csv"' } });
});
