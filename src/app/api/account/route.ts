import { handler } from "@/lib/api";
import { db } from "@/lib/db";

/** Switch which dashboard (tenant or landlord) the user sees by default. */
export const POST = handler(async (req, user) => {
  const b = await req.json();
  const t = b.accountType === "owner" ? "owner" : "tenant";
  db().prepare("UPDATE users SET account_type = ? WHERE id = ?").run(t, user.id);
  return { redirect: t === "owner" ? "/dashboard/landlord" : "/dashboard/tenant" };
});
