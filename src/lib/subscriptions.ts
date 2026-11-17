import { audit } from "./audit";
import { getUser } from "./auth";
import { addInterval, CURRENCY, GRACE_DAYS, isPaidPlan, paymentsEnabled, plans, subscriptionOf, type Interval, type Subscription } from "./billing";
import { db, tx } from "./db";
import { enqueue } from "./jobs";
import { appUrl, sendEmail } from "./notify";
import { paymentProvider, type Charge, type Payer } from "./payments";
import { HttpError } from "./rentals";
import type { User } from "./types";

export type Payment = {
  id: number; user_id: number; kind: "new" | "renewal"; plan: "pro" | "business"; interval: Interval; amount: number; currency: string;
  status: "initiated" | "paid" | "failed"; provider: string; provider_charge_id: string | null;
  period_start: Date | null; period_end: Date | null; card_brand: string | null; card_last4: string | null;
  error: string | null; created_at: Date; paid_at: Date | null;
};

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const payer = (u: Pick<User, "id" | "name" | "email" | "phone">): Payer => ({ id: u.id, name: u.name, email: u.email, phone: u.phone });
const webhookUrl = () => appUrl("/api/billing/webhook");
export const invoiceNo = (p: Pick<Payment, "id">) => `HA-${String(p.id).padStart(6, "0")}`;

function requireOn() {
  if (!paymentsEnabled()) throw new HttpError(404, "Payments are switched off");
}

/** Start paying for a plan (new, plan change, or paying a renewal by hand). Returns the provider's payment page. */
export async function startCheckout(user: User, plan: string, interval: string): Promise<string> {
  requireOn();
  if (user.account_type !== "owner") throw new HttpError(400, "Plans are for landlords. Tenants use Handover AI for free.");
  if (!isPaidPlan(plan) || (interval !== "month" && interval !== "year")) throw new HttpError(400, "Pick a plan");
  const sub = await subscriptionOf(user.id);
  const live = sub && sub.status !== "expired" && sub.current_period_end.getTime() > Date.now();
  if (live && sub.plan === plan && sub.interval === interval && sub.status === "active" && !sub.cancel_at_period_end)
    throw new HttpError(400, "You're already on this plan");
  const amount = plans()[plan].price[interval];
  const kind = sub && sub.plan === plan && sub.interval === interval ? "renewal" : "new";
  const provider = paymentProvider();
  const { lastInsertRowid: paymentId } = await db().run(
    "INSERT INTO payments (user_id, kind, plan, interval, amount, currency, provider) VALUES (?,?,?,?,?,?,?)",
    user.id, kind, plan, interval, amount, CURRENCY, provider.name,
  );
  const { chargeId, url } = await provider.checkout({
    paymentId, payer: payer(user), amount, currency: CURRENCY,
    description: `Handover AI ${plans()[plan].name} (${interval === "year" ? "yearly" : "monthly"})`,
    returnUrl: appUrl("/api/billing/return"), webhookUrl: webhookUrl(),
  });
  await db().run("UPDATE payments SET provider_charge_id = ? WHERE id = ?", chargeId, paymentId);
  return url;
}

/**
 * Record the outcome of a charge. Safe to call any number of times, from the browser return, the webhook,
 * or a renewal: the payment row is locked and only moves out of "initiated" once.
 */
export async function settleCharge(chargeId: string, known?: Charge): Promise<Payment | null> {
  const charge = known ?? (await paymentProvider().getCharge(chargeId));
  if (charge.status === "pending") return null;
  let receipt: Payment | null = null;
  const result = await tx(async () => {
    const p = (await db().get("SELECT * FROM payments WHERE provider_charge_id = ? FOR UPDATE", chargeId)) as Payment | undefined;
    if (!p) return null;
    if (p.status !== "initiated") return p;
    if (charge.status === "failed") {
      await db().run("UPDATE payments SET status = 'failed', error = ? WHERE id = ?", charge.error, p.id);
      return { ...p, status: "failed" as const };
    }
    // Paid. A renewal continues from the end of the current period (so paying early loses nothing);
    // a new plan or plan change starts today.
    const sub = (await db().get("SELECT * FROM subscriptions WHERE user_id = ? FOR UPDATE", p.user_id)) as Subscription | undefined;
    const now = new Date();
    const start = p.kind === "renewal" && sub && sub.current_period_end > now ? sub.current_period_end : now;
    const end = addInterval(start, p.interval);
    await db().run(
      "UPDATE payments SET status = 'paid', paid_at = now(), period_start = ?, period_end = ?, card_brand = ?, card_last4 = ? WHERE id = ?",
      start, end, charge.cardBrand, charge.cardLast4, p.id,
    );
    await db().run(
      `INSERT INTO subscriptions (user_id, plan, interval, status, current_period_end, provider, customer_id, card_id, card_brand, card_last4, agreement_id)
       VALUES (?,?,?, 'active', ?,?,?,?,?,?,?)
       ON CONFLICT (user_id) DO UPDATE SET plan = excluded.plan, interval = excluded.interval, status = 'active',
         current_period_end = excluded.current_period_end, cancel_at_period_end = false, grace_until = NULL, next_attempt_at = NULL,
         renew_attempts = 0, provider = excluded.provider, updated_at = now(),
         customer_id = COALESCE(excluded.customer_id, subscriptions.customer_id), card_id = COALESCE(excluded.card_id, subscriptions.card_id),
         card_brand = COALESCE(excluded.card_brand, subscriptions.card_brand), card_last4 = COALESCE(excluded.card_last4, subscriptions.card_last4),
         agreement_id = COALESCE(excluded.agreement_id, subscriptions.agreement_id)`,
      p.user_id, p.plan, p.interval, end, p.provider, charge.customerId, charge.cardId, charge.cardBrand, charge.cardLast4, charge.agreementId,
    );
    await audit(null, p.user_id, "billing.paid", { payment: invoiceNo(p), plan: p.plan, interval: p.interval, amount: Number(p.amount), currency: p.currency, until: fmtDate(end) });
    receipt = { ...p, status: "paid", period_start: start, period_end: end, card_brand: charge.cardBrand, card_last4: charge.cardLast4 };
    return receipt;
  });
  if (receipt) await sendReceipt(receipt);
  return result;
}

async function sendReceipt(p: Payment) {
  const u = await getUser(p.user_id);
  if (!u) return;
  const plan = plans()[p.plan].name;
  await sendEmail(u.email, `Receipt ${invoiceNo(p)}: Handover AI ${plan}`,
    `Thank you. We received ${Number(p.amount).toFixed(2)} ${p.currency} for Handover AI ${plan} (${p.interval === "year" ? "yearly" : "monthly"}).\n` +
    `Paid with ${p.card_brand ?? "card"}${p.card_last4 ? ` ending ${p.card_last4}` : ""}. Your plan runs until ${fmtDate(p.period_end!)}.`,
    `/billing/invoice/${p.id}`);
}

export async function setCancel(user: User, cancel: boolean) {
  requireOn();
  const sub = await subscriptionOf(user.id);
  if (!sub || sub.status === "expired") throw new HttpError(400, "You don't have a paid plan");
  await db().run("UPDATE subscriptions SET cancel_at_period_end = ?, updated_at = now() WHERE user_id = ?", cancel, user.id);
  await audit(null, user.id, cancel ? "billing.canceled" : "billing.resumed", { plan: sub.plan, until: fmtDate(sub.current_period_end) });
}

/** Run by the worker every few minutes: queue renewals that are due and end plans whose time is up. */
export async function billingTick() {
  if (!paymentsEnabled()) return;
  const d = db();
  // Cancelled plans end quietly at the end of the paid period.
  await d.run("UPDATE subscriptions SET status = 'expired', updated_at = now() WHERE cancel_at_period_end AND status IN ('active', 'past_due') AND current_period_end <= now()");
  // Unpaid past the grace period: back to Free (records are never deleted).
  const lapsed = (await d.all(
    "UPDATE subscriptions SET status = 'expired', updated_at = now() WHERE status = 'past_due' AND grace_until <= now() RETURNING user_id, plan",
  )) as { user_id: number; plan: string }[];
  for (const l of lapsed) {
    await audit(null, l.user_id, "billing.downgraded", { from: l.plan });
    const u = await getUser(l.user_id);
    if (u) await sendEmail(u.email, "Your Handover AI plan has ended", `We couldn't take the payment for your ${plans()[l.plan as "pro"].name} plan, so your account is now on the Free plan.\n\nAll your rentals, photos and records are still here. Pick a plan again any time to get the paid features back.`, "/billing");
  }
  // Claim due renewals (next_attempt_at stops two workers, or two ticks, from charging the same plan twice).
  const due = (await d.all(
    `UPDATE subscriptions SET next_attempt_at = now() + interval '1 hour', updated_at = now()
     WHERE user_id IN (SELECT user_id FROM subscriptions WHERE status IN ('active', 'past_due') AND NOT cancel_at_period_end
       AND current_period_end <= now() + interval '1 hour' AND (next_attempt_at IS NULL OR next_attempt_at <= now())
       ORDER BY current_period_end LIMIT 500 FOR UPDATE SKIP LOCKED)
     RETURNING user_id`,
  )) as { user_id: number }[];
  for (const r of due) await enqueue("renew", { userId: r.user_id });
  return { renewing: due.length, lapsed: lapsed.length };
}

/** Charge the saved card for one landlord's next period. */
export async function renew(userId: number) {
  if (!paymentsEnabled()) return;
  const sub = await subscriptionOf(userId);
  const u = await getUser(userId);
  if (!sub || !u || sub.cancel_at_period_end || !["active", "past_due"].includes(sub.status)) return;
  if (sub.current_period_end.getTime() > Date.now() + 3600_000) return; // paid by hand in the meantime
  const plan = plans()[sub.plan];
  const amount = plan.price[sub.interval];
  const provider = paymentProvider();
  let charge: Charge | null = null;
  let error = "No saved card";
  if (sub.card_id && sub.customer_id && sub.agreement_id) {
    const { lastInsertRowid: paymentId } = await db().run(
      "INSERT INTO payments (user_id, kind, plan, interval, amount, currency, provider) VALUES (?, 'renewal', ?,?,?,?,?)",
      userId, sub.plan, sub.interval, amount, CURRENCY, provider.name,
    );
    try {
      charge = await provider.chargeSaved({
        paymentId, payer: payer(u), amount, currency: CURRENCY, description: `Handover AI ${plan.name} renewal`,
        customerId: sub.customer_id, cardId: sub.card_id, agreementId: sub.agreement_id, webhookUrl: webhookUrl(),
      });
      await db().run("UPDATE payments SET provider_charge_id = ? WHERE id = ?", charge.id, paymentId);
      if (charge.status !== "pending") await settleCharge(charge.id, charge);
      if (charge.status === "paid") return;
      if (charge.status === "pending") return; // the webhook finishes it
      error = charge.error ?? "Declined";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      await db().run("UPDATE payments SET status = 'failed', error = ? WHERE id = ? AND status = 'initiated'", error.slice(0, 500), paymentId);
    }
  }
  // Didn't go through: keep the plan for a grace period, retry daily, and tell the landlord.
  const graceUntil = sub.grace_until ?? new Date(Date.now() + GRACE_DAYS * 86400_000);
  await db().run(
    "UPDATE subscriptions SET status = 'past_due', grace_until = ?, renew_attempts = renew_attempts + 1, next_attempt_at = now() + interval '1 day', updated_at = now() WHERE user_id = ?",
    graceUntil, userId,
  );
  if (sub.renew_attempts === 0 || sub.renew_attempts === 3)
    await sendEmail(u.email, `Payment needed for Handover AI ${plan.name}`,
      `We couldn't renew your ${plan.name} plan (${error}).\n\nYour plan keeps working until ${fmtDate(graceUntil)}. Pay with Apple Pay or a card on the Billing page to keep it.`, "/billing");
}

export async function paymentsOf(userId: number) {
  return (await db().all("SELECT * FROM payments WHERE user_id = ? AND status <> 'initiated' ORDER BY id DESC LIMIT 50", userId)) as Payment[];
}

export async function payment(id: number, userId: number) {
  return ((await db().get("SELECT * FROM payments WHERE id = ? AND user_id = ? AND status = 'paid'", id, userId)) as Payment | undefined) ?? null;
}
