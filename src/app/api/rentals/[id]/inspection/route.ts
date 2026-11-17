import { bad, handler, str } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db, now, tx } from "@/lib/db";
import { isCondition, isStage, ratingsOf, ratingsOpen, reportRow, roomsOf } from "@/lib/inspections";
import { rentalForUser } from "@/lib/rentals";

/**
 * Save the ratings for one room. The form sends `c_<item id>` (good, fair, damaged, na) and `n_<item id>` (note).
 * Unrated items are left alone, so two people can rate different rooms at the same time.
 */
export const POST = handler(async (req, user, p) => {
  const { rental } = await rentalForUser(Number(p.id), user);
  const b = (await req.json()) as Record<string, unknown>;
  const stage = b.stage;
  if (!isStage(stage)) bad("Unknown inspection");
  if (!ratingsOpen(rental, stage, await reportRow(rental.id, stage)))
    bad(stage === "move_in" ? "The move-in inspection is submitted or sealed, so ratings can't change" : "Move-out ratings open once the lease is signed, and lock when someone signs the move-out report");
  const rooms = await roomsOf(rental.id);
  const items = new Map(rooms.flatMap((r) => r.items.map((i) => [i.id, r.name] as const)));
  const before = await ratingsOf(rental.id, stage);
  const changes: { id: number; condition: string; note: string | null }[] = [];
  for (const [k, v] of Object.entries(b)) {
    const m = /^c_(\d+)$/.exec(k);
    if (!m || !items.has(Number(m[1]))) continue;
    if (!isCondition(v)) bad("Pick good, fair, damaged or not applicable");
    const id = Number(m[1]);
    const note = str(b[`n_${id}`], 500) || null;
    const old = before.get(id);
    if (old && old.condition === v && (old.note ?? null) === note) continue;
    changes.push({ id, condition: v, note });
  }
  if (!changes.length) return { saved: 0 };
  const at = now();
  await tx(async () => {
    for (const c of changes)
      await db().run(
        `INSERT INTO inspection_ratings (rental_id, stage, item_id, condition, note, rated_by, rated_at) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT (rental_id, stage, item_id) DO UPDATE SET condition = EXCLUDED.condition, note = EXCLUDED.note, rated_by = EXCLUDED.rated_by, rated_at = EXCLUDED.rated_at`,
        rental.id, stage, c.id, c.condition, c.note, user.id, at,
      );
  });
  const roomNames = [...new Set(changes.map((c) => items.get(c.id)))];
  await audit(rental.id, user.id, "inspection.rated", { stage, rooms: roomNames, items: changes.length, damaged: changes.filter((c) => c.condition === "damaged").length });
  return { saved: changes.length };
});
