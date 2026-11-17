import { db } from "./db";
import { HttpError } from "./rentals";
import type { User } from "./types";

/**
 * Paid plans for landlords. Tenants and staff are always free.
 *
 * PAYMENTS_ENABLED is off by default: then nobody sees prices or the billing page, and every landlord gets every
 * feature with no limits, exactly as before. Turning it on starts enforcing the Free plan's limits.
 */
export const paymentsEnabled = () => process.env.PAYMENTS_ENABLED === "1" || process.env.PAYMENTS_ENABLED === "true";

export type PlanId = "free" | "pro" | "business";
export type Interval = "month" | "year";
export type Plan = {
  id: PlanId;
  name: string;
  properties: number; // active rentals the landlord can own (Infinity = unlimited)
  aiReports: boolean;
  staff: boolean;
  price: Record<Interval, number>; // QAR
};

const env = (k: string, d: number) => (Number.isFinite(Number(process.env[k])) && process.env[k] ? Number(process.env[k]) : d);

export function plans(): Record<PlanId, Plan> {
  return {
    free: { id: "free", name: "Free", properties: 1, aiReports: false, staff: false, price: { month: 0, year: 0 } },
    pro: { id: "pro", name: "Pro", properties: 10, aiReports: true, staff: true, price: { month: env("PRICE_PRO_MONTH", 49), year: env("PRICE_PRO_YEAR", 490) } },
    business: { id: "business", name: "Business", properties: Infinity, aiReports: true, staff: true, price: { month: env("PRICE_BUSINESS_MONTH", 199), year: env("PRICE_BUSINESS_YEAR", 1990) } },
  };
}
export const CURRENCY = "QAR";
export const GRACE_DAYS = 7;
export const isPaidPlan = (p: string): p is "pro" | "business" => p === "pro" || p === "business";
export const isInterval = (i: string): i is Interval => i === "month" || i === "year";

export type Subscription = {
  user_id: number;
  plan: "pro" | "business";
  interval: Interval;
  status: "active" | "past_due" | "canceled" | "expired";
  current_period_end: Date;
  cancel_at_period_end: boolean;
  grace_until: Date | null;
  provider: string;
  customer_id: string | null;
  card_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  agreement_id: string | null;
  renew_attempts: number;
};

export async function subscriptionOf(userId: number): Promise<Subscription | null> {
  return ((await db().get("SELECT * FROM subscriptions WHERE user_id = ?", userId)) as Subscription | undefined) ?? null;
}

/** Which plan's features this landlord gets right now. */
export async function planFor(userId: number | null | undefined): Promise<Plan> {
  const all = plans();
  if (!paymentsEnabled()) return { ...all.business, name: "Free" }; // payments off: everything included
  if (!userId) return all.free;
  const s = await subscriptionOf(userId);
  if (!s) return all.free;
  const now = Date.now();
  const paidUp = (s.status === "active" || s.status === "canceled") && s.current_period_end.getTime() > now;
  const inGrace = s.status === "past_due" && !!s.grace_until && s.grace_until.getTime() > now;
  return paidUp || inGrace ? all[s.plan] : all.free;
}

const upgradeHint = "Upgrade on the Billing page.";

/** Before a landlord takes on another property. */
export async function assertCanAddProperty(owner: Pick<User, "id">) {
  const plan = await planFor(owner.id);
  if (plan.properties === Infinity) return;
  const { n } = (await db().get("SELECT COUNT(*) n FROM rentals WHERE owner_id = ? AND ended_at IS NULL", owner.id)) as { n: number };
  if (n >= plan.properties)
    throw new HttpError(402, plan.id === "free"
      ? `The Free plan includes 1 property. ${upgradeHint}`
      : `Your ${plan.name} plan includes ${plan.properties} properties. ${upgradeHint}`);
}

/** AI move-out reports follow the landlord's plan, whoever starts them. */
export async function assertAiReports(ownerId: number | null) {
  if (!(await planFor(ownerId)).aiReports) throw new HttpError(402, "AI move-out reports are part of the landlord's Pro plan.");
}

export async function assertStaff(owner: Pick<User, "id">) {
  if (!(await planFor(owner.id)).staff) throw new HttpError(402, `Staff accounts are part of the Pro plan. ${upgradeHint}`);
}

/** End of a billing period that starts at `from`. Month-ends roll back (31 Jan + 1 month = 28/29 Feb). */
export function addInterval(from: Date, interval: Interval): Date {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  if (interval === "year") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}
