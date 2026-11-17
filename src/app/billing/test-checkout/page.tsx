import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { paymentsEnabled } from "@/lib/billing";
import { getT } from "@/lib/i18n";
import { ActionButton } from "@/components/client";
import { fmtMoney } from "@/components/ui";

/** Test mode only (PAYMENTS_PROVIDER=fake): stands in for Tap's payment page. No money moves. */
export default async function TestCheckout({ searchParams }: { searchParams: Promise<{ charge?: string; amount?: string }> }) {
  if (!paymentsEnabled() || process.env.PAYMENTS_PROVIDER !== "fake") notFound();
  const t = await getT();
  await requireUser();
  const { charge = "", amount = "0" } = await searchParams;
  return (
    <div className="card mx-auto max-w-sm space-y-3 text-center">
      <p className="badge mx-auto bg-amber-100 text-amber-800">{t("Test mode: no money is taken")}</p>
      <h1 className="h1">{fmtMoney(Number(amount), "QAR")}</h1>
      <ActionButton url="/api/billing/test-checkout" body={{ charge, outcome: "4242" }} label=" Pay (test)" className="btn-primary w-full !bg-black" hardRedirect />
      <ActionButton url="/api/billing/test-checkout" body={{ charge, outcome: "0341" }} label="Card that declines renewals (test)" className="btn-secondary w-full" hardRedirect />
      <ActionButton url="/api/billing/test-checkout" body={{ charge, outcome: "decline" }} label="Decline (test)" className="btn-secondary w-full" hardRedirect />
    </div>
  );
}
