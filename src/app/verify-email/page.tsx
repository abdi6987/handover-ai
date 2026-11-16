import { redirect } from "next/navigation";
import Link from "next/link";
import { getT } from "@/lib/i18n";
import { requireUser } from "@/lib/auth";
import { VerifyForm } from "@/components/auth";
import { LogoutButton } from "@/components/client";

export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const t = await getT();
  const user = await requireUser({ allowUnverified: true });
  const { next: n } = await searchParams;
  const next = n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
  if (user.email_verified_at) redirect(next);
  const live = !!process.env.RESEND_API_KEY;
  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <p className="text-5xl">📬</p>
      <h1 className="h1">{t("Check your email")}</h1>
      <p className="muted">{t("We sent a 6-digit code to {email}. Enter it below to finish creating your account.", { email: user.email })}</p>
      <div className="card"><VerifyForm next={next} email={user.email} /></div>
      {!live && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{t("Test mode: email sending isn't connected yet, so the code is on your")} <Link href="/inbox" className="font-semibold underline">{t("Emails page")}</Link>.</p>}
      <div className="flex items-center gap-2 text-sm text-gray-600">{t("Wrong email?")} <LogoutButton /></div>
    </div>
  );
}
