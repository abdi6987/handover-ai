import { bad, handler, str } from "@/lib/api";
import { paymentsEnabled } from "@/lib/billing";
import { db } from "@/lib/db";

/** Test mode only: the stand-in payment page reports what the "customer" did. */
export const POST = handler(async (req, user) => {
  if (!paymentsEnabled() || process.env.PAYMENTS_PROVIDER !== "fake") bad("Test payments are off");
  const b = (await req.json()) as Record<string, unknown>;
  const charge = str(b.charge, 100), outcome = str(b.outcome, 10);
  const own = await db().get("SELECT 1 FROM payments WHERE provider_charge_id = ? AND user_id = ?", charge, user.id);
  if (!own) bad("Unknown payment");
  const last4 = outcome === "decline" ? null : outcome === "0341" ? "0341" : "4242";
  await db().run("UPDATE test_charges SET status = ?, card_last4 = ? WHERE id = ? AND status = 'pending'", outcome === "decline" ? "failed" : "paid", last4, charge);
  return { redirect: `/api/billing/return?charge=${encodeURIComponent(charge)}` };
});
