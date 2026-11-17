import { NextResponse } from "next/server";
import { paymentsEnabled } from "@/lib/billing";
import { paymentProvider } from "@/lib/payments";
import { settleCharge } from "@/lib/subscriptions";

/**
 * Tap calls this when a charge finishes, even if the customer closed the browser.
 * The signature is checked, and the charge is then fetched from Tap again rather than trusting the body.
 */
export async function POST(req: Request) {
  if (!paymentsEnabled()) return NextResponse.json({ ok: true });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.id !== "string" || !paymentProvider().verifyWebhook(req.headers, body))
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  try {
    await settleCharge(body.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[billing] webhook", e);
    return NextResponse.json({ error: "Try again" }, { status: 500 }); // Tap retries
  }
}
