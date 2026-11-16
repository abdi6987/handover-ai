import { after } from "next/server";
import { bad, handler } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db, now } from "@/lib/db";
import { fullySigned, mediaFor, rentalForUser } from "@/lib/rentals";
import { runComparison } from "@/lib/ai";

export const POST = handler(async (_req, user, p) => {
  const { rental } = await rentalForUser(Number(p.id), user);
  if (!fullySigned(rental) || !rental.movein_seal) bad("Comparison needs a signed lease and sealed move-in media");
  if (!(await mediaFor(rental.id, "move_out")).length) bad("Add move-out photos or videos first");
  const running = await db().prepare("SELECT id FROM comparisons WHERE rental_id = ? AND status = 'running'").get(rental.id);
  if (running) bad("A comparison is already running");
  const info = await db().prepare("INSERT INTO comparisons (rental_id, created_by, created_at, status) VALUES (?,?,?, 'running')").run(rental.id, user.id, now());
  const id = Number(info.lastInsertRowid);
  await audit(rental.id, user.id, "comparison.started", { comparison_id: id });
  after(() => runComparison(id, rental, user.id));
  return { id };
});
