import Link from "next/link";
import { getT } from "@/lib/i18n";
import { AuthForm } from "@/components/client";

export default async function Login({ searchParams }: { searchParams: Promise<{ invite?: string; staff?: string }> }) {
  const t = await getT();
  const { invite, staff } = await searchParams;
  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <h1 className="h1">{t("Log in")}</h1>
      <div className="card"><AuthForm mode="login" staff={staff} invite={invite} /></div>
      <p className="muted">{t("No account?")} <Link className="font-semibold text-brand-700" href={`/signup${invite ? `?invite=${invite}` : staff ? `?staff=${staff}` : ""}`}>{t("Sign up")}</Link></p>
    </div>
  );
}
