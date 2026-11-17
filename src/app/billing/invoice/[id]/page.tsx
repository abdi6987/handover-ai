import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { paymentsEnabled, plans } from "@/lib/billing";
import { getT } from "@/lib/i18n";
import { invoiceNo, payment } from "@/lib/subscriptions";
import { PrintButton } from "@/components/client";
import { fmt, fmtMoney } from "@/components/ui";

/** A printable receipt. */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  if (!paymentsEnabled()) notFound();
  const t = await getT();
  const user = await requireUser();
  const p = await payment(Number((await params).id), user.id);
  if (!p) notFound();
  const day = (d: Date | null) => (d ? fmt(d.toISOString(), false) : "");
  return (
    <div className="card mx-auto max-w-xl space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Handover AI</p>
          <h1 className="h1">{t("Receipt")} {invoiceNo(p)}</h1>
        </div>
        <PrintButton />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-gray-500">{t("Paid on")}</dt><dd>{day(p.paid_at)}</dd>
        <dt className="text-gray-500">{t("Billed to")}</dt><dd>{user.name}<br />{user.email}</dd>
        <dt className="text-gray-500">{t("Plan")}</dt><dd>{t(plans()[p.plan].name)} ({p.interval === "month" ? t("monthly") : t("yearly")})</dd>
        <dt className="text-gray-500">{t("Period")}</dt><dd>{day(p.period_start)} – {day(p.period_end)}</dd>
        <dt className="text-gray-500">{t("Paid with")}</dt><dd>{p.card_brand ?? t("Card")}{p.card_last4 ? ` •••• ${p.card_last4}` : ""}</dd>
        <dt className="text-gray-500 font-semibold">{t("Total")}</dt><dd className="font-semibold">{fmtMoney(Number(p.amount), p.currency)}</dd>
      </dl>
    </div>
  );
}
