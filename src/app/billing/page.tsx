import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { paymentsEnabled, planFor, plans, subscriptionOf, type Interval, type Plan } from "@/lib/billing";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { invoiceNo, paymentsOf } from "@/lib/subscriptions";
import { ActionButton } from "@/components/client";
import { Badge, fmt, fmtMoney } from "@/components/ui";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ interval?: string; result?: string }> }) {
  if (!paymentsEnabled()) notFound();
  const t = await getT();
  const user = await requireUser();
  const sp = await searchParams;
  if (user.account_type !== "owner")
    return <div className="card space-y-2"><h1 className="h1">{t("Billing")}</h1><p>{t("Handover AI is free for tenants and maintenance staff.")}</p></div>;

  const interval: Interval = sp.interval === "year" ? "year" : "month";
  const all = plans();
  const [sub, plan, history] = await Promise.all([subscriptionOf(user.id), planFor(user.id), paymentsOf(user.id)]);
  const { n: used } = (await db().get("SELECT COUNT(*) n FROM rentals WHERE owner_id = ? AND ended_at IS NULL", user.id)) as { n: number };
  const live = sub && sub.status !== "expired";
  const day = (d: Date) => fmt(d.toISOString(), false);
  const banner = { paid: ["green", "Payment received. Your plan is active."], failed: ["red", "The payment didn't go through. You were not charged."], pending: ["amber", "We're confirming your payment with the bank. Refresh this page in a minute."] }[sp.result ?? ""] as [string, string] | undefined;
  const features = (p: Plan) => [
    p.properties === Infinity ? t("Unlimited properties") : p.properties === 1 ? t("1 property") : t("Up to {n} properties", { n: p.properties }),
    t("Move-in proof, lease signing, repairs and documents"),
    ...(p.aiReports ? [t("AI move-out reports")] : []),
    ...(p.staff ? [t("Staff accounts for maintenance")] : []),
  ];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard/landlord" className="text-sm font-semibold text-brand-700">{t("← Landlord dashboard")}</Link>
        <h1 className="h1">{t("Billing")}</h1>
        <p className="muted">{t("Pay with Apple Pay on iPhone, iPad and Mac, or with a debit or credit card. Tenants always use Handover AI for free.")}</p>
      </div>
      {banner && <p className={`rounded-lg p-3 text-sm ${banner[0] === "green" ? "bg-green-50 text-green-800" : banner[0] === "red" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>{t(banner[1])}</p>}

      <div className="card space-y-2" id="current-plan">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t("Your plan:")} {t(plan.name)}</h2>
          {live && sub.status === "past_due" ? <Badge tone="red">{t("Payment needed")}</Badge>
            : live && sub.cancel_at_period_end ? <Badge tone="amber">{t("Ends soon")}</Badge>
            : live ? <Badge tone="green">{t("Active")}</Badge> : <Badge>{t("Free")}</Badge>}
        </div>
        <p className="text-sm">{plan.properties === Infinity ? t("{n} properties", { n: used }) : t("{used} of {max} properties used", { used, max: plan.properties })}</p>
        {live && sub.status === "past_due" && sub.grace_until && (
          <div className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            <p>{t("We couldn't renew your plan. It keeps working until {date}. Pay now to keep it.", { date: day(sub.grace_until) })}</p>
            <ActionButton url="/api/billing/checkout" body={{ plan: sub.plan, interval: sub.interval }} label="Pay now" className="btn-primary" hardRedirect />
          </div>
        )}
        {live && sub.status !== "past_due" && (
          <p className="text-sm text-gray-600">
            {sub.cancel_at_period_end ? t("Your plan ends on {date}. After that you're on the Free plan; nothing is deleted.", { date: day(sub.current_period_end) })
              : t("Renews on {date} for {amount}.", { date: day(sub.current_period_end), amount: fmtMoney(all[sub.plan].price[sub.interval], "QAR") })}
            {sub.card_last4 ? ` ${t("Card ending {last4}.", { last4: sub.card_last4 })}` : ""}
          </p>
        )}
        {live && sub.status === "active" && (sub.cancel_at_period_end
          ? <ActionButton url="/api/billing/cancel" body={{ resume: true }} label="Keep my plan" className="btn-primary" />
          : <ActionButton url="/api/billing/cancel" body={{}} label="Cancel plan" confirmText={t("Cancel your plan? It keeps working until the end of the period you paid for.")} />)}
      </div>

      <div className="flex gap-2" role="tablist">
        {(["month", "year"] as const).map((i) => (
          <Link key={i} href={`/billing?interval=${i}`} className={`badge px-3 py-1 ${interval === i ? "bg-gray-900 text-white" : "bg-white ring-1 ring-gray-200"}`}>
            {i === "month" ? t("Monthly") : t("Yearly (2 months free)")}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(["free", "pro", "business"] as const).map((id) => {
          const p = all[id];
          const current = (live ? sub.plan : "free") === id && (id === "free" || sub?.interval === interval);
          return (
            <div key={id} className={`card flex flex-col gap-3 ${id === "pro" ? "border-brand-600 ring-1 ring-brand-600" : ""}`}>
              <div>
                <h3 className="text-lg font-bold">{t(p.name)}</h3>
                <p className="text-2xl font-bold">{id === "free" ? t("Free") : fmtMoney(p.price[interval], "QAR")}
                  {id !== "free" && <span className="text-sm font-normal text-gray-500"> / {interval === "month" ? t("month") : t("year")}</span>}</p>
              </div>
              <ul className="flex-1 space-y-1 text-sm">{features(p).map((f) => <li key={f}>✓ {f}</li>)}</ul>
              {current ? <span className="badge justify-center bg-gray-100 py-2">{t("Current plan")}</span>
                : id === "free" ? null
                : <ActionButton url="/api/billing/checkout" body={{ plan: id, interval }} label={id === "pro" ? "Choose Pro" : "Choose Business"} className="btn-primary w-full" hardRedirect />}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-500">{t("Prices in Qatari riyals. Changing plan starts a new period from today. You can cancel any time; your rentals and records are never deleted.")}</p>

      <div className="card space-y-2">
        <h2 className="font-semibold">{t("Payments")}</h2>
        {history.length === 0 ? <p className="muted">{t("No payments yet.")}</p> : (
          <ul className="divide-y divide-gray-100 text-sm">
            {history.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{fmt(p.created_at.toISOString(), false)} · {t(all[p.plan].name)} ({p.interval === "month" ? t("monthly") : t("yearly")})</span>
                <span className="flex items-center gap-2">
                  {fmtMoney(Number(p.amount), p.currency)}
                  {p.status === "paid" ? <Link className="font-semibold text-brand-700" href={`/billing/invoice/${p.id}`}>{t("Receipt")} {invoiceNo(p)}</Link> : <Badge tone="red">{t("Failed")}</Badge>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
