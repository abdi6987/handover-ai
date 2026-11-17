import { bad, handler, str } from "@/lib/api";
import { audit } from "@/lib/audit";
import { isStage, signReport } from "@/lib/inspections";
import { rentalForUser } from "@/lib/rentals";
import { notifyUser } from "@/lib/notify";

/** Sign the move-in or move-out inspection report. */
export const POST = handler(async (req, user, p) => {
  const { rental, role } = await rentalForUser(Number(p.id), user);
  const b = await req.json();
  if (!isStage(b.stage)) bad("Unknown inspection");
  const name = str(b.name, 120);
  if (!name || b.agree !== true) bad("Type your full name and tick the box to sign");
  const res = await signReport(rental, b.stage, role, user.id, name);
  const label = b.stage === "move_in" ? "move-in" : "move-out";
  await audit(rental.id, user.id, "report.signed", { stage: b.stage, role, name, report: res.hash, signature: res.signature });
  await notifyUser(role === "owner" ? rental.tenant_id : rental.owner_id,
    res.done ? `The ${label} report is signed by both sides: "${rental.name}"` : `${user.name} signed the ${label} report for "${rental.name}"`,
    res.done ? `Both sides have signed the ${label} inspection report. It's saved as part of your shared record.` : `${user.name} signed the ${label} inspection report. Please check it and sign too.`,
    `/rentals/${rental.id}/report/${b.stage === "move_in" ? "move-in" : "move-out"}`);
  return { signature: res.signature };
});
