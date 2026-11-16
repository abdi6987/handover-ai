import { db } from "./db";
import type { Issue, Rental } from "./types";

export type LogRow = Issue & { assignee_name: string | null; rental_name: string; reporter_name: string; reporter_role: "tenant" | "owner"; updates: number; last_activity: string };

/** Every issue across all properties the landlord owns, with who reported it and latest activity. */
export async function landlordLog(ownerId: number) {
  const rentals = await db().prepare("SELECT * FROM rentals WHERE owner_id = ? ORDER BY name").all(ownerId) as Rental[];
  const rows = await db().prepare(`
    SELECT i.*, r.name rental_name, u.name reporter_name, (SELECT name FROM staff s WHERE s.id = i.assigned_to) assignee_name,
      CASE WHEN i.reported_by = r.owner_id THEN 'owner' ELSE 'tenant' END reporter_role,
      (SELECT COUNT(*) FROM issue_updates x WHERE x.issue_id = i.id) updates,
      COALESCE((SELECT MAX(created_at) FROM issue_updates x WHERE x.issue_id = i.id), i.created_at) last_activity
    FROM issues i JOIN rentals r ON r.id = i.rental_id JOIN users u ON u.id = i.reported_by
    WHERE r.owner_id = ? ORDER BY last_activity DESC`).all(ownerId) as LogRow[];
  return { rentals, rows };
}

export function daysBetween(a: string, b?: string | null) {
  return Math.max(0, Math.round(((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime()) / 86400000));
}
