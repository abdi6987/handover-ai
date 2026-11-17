import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { paymentsEnabled } from "@/lib/billing";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/notify";
import { settleCharge } from "@/lib/subscriptions";

/** Where the payment page sends the browser back. Tap adds ?tap_id=chg_...; the outcome comes from Tap itself. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get("tap_id") || u.searchParams.get("charge") || "";
  const user = await currentUser();
  if (!paymentsEnabled() || !user || !id) return NextResponse.redirect(appUrl("/billing"));
  const own = await db().get("SELECT 1 FROM payments WHERE provider_charge_id = ? AND user_id = ?", id, user.id);
  if (!own) return NextResponse.redirect(appUrl("/billing"));
  try {
    const p = await settleCharge(id);
    const result = !p ? "pending" : p.status === "paid" ? "paid" : "failed";
    return NextResponse.redirect(appUrl(`/billing?result=${result}`));
  } catch (e) {
    console.error("[billing] return", e);
    return NextResponse.redirect(appUrl("/billing?result=pending"));
  }
}
