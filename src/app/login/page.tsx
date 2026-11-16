import Link from "next/link";
import { getT } from "@/lib/i18n";
import { LoginForm } from "@/components/auth";
import { googleEnabled } from "@/lib/google";

const ERRORS: Record<string, string> = {
  google_off: "Google sign-in isn't switched on yet. Use your email and password.",
  google_state: "Google sign-in timed out. Please try again.",
  google_token: "Google sign-in didn't complete. Please try again.",
  google_email: "Your Google account's email isn't verified, so we can't use it to sign in.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ invite?: string; staff?: string; error?: string }> }) {
  const t = await getT();
  const { invite, staff, error } = await searchParams;
  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <h1 className="h1">{t("Log in")}</h1>
      {error && ERRORS[error] && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{t(ERRORS[error])}</p>}
      <div className="card"><LoginForm invite={invite} staff={staff} google={googleEnabled()} /></div>
      <p className="muted">{t("No account?")} <Link className="font-semibold text-brand-700" href={invite ? `/signup?invite=${invite}` : staff ? `/signup?staff=${staff}` : "/signup"}>{t("Sign up")}</Link></p>
    </div>
  );
}
