import Link from "next/link";
import { getT } from "@/lib/i18n";
import { ForgotForm } from "@/components/auth";

export default async function Forgot() {
  const t = await getT();
  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <h1 className="h1">{t("Forgot your password?")}</h1>
      <p className="muted">{t("Enter your email and we'll send you a link to choose a new password.")}</p>
      <div className="card"><ForgotForm /></div>
      <p className="muted"><Link href="/login" className="font-semibold text-brand-700">{t("Back to log in")}</Link></p>
    </div>
  );
}
