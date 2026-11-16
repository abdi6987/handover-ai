import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { SignupForm } from "@/components/auth";
import { getInvite } from "@/lib/invites";
import { googleEnabled } from "@/lib/google";

/** Invite and staff sign ups stay here; everyone else picks the tenant or landlord page. */
export default async function Signup({ searchParams }: { searchParams: Promise<{ invite?: string; as?: string; staff?: string }> }) {
  const t = await getT();
  const { invite, as, staff } = await searchParams;
  if (!invite && !staff && as) redirect(as === "owner" ? "/signup/landlord" : "/signup/tenant");
  if (!invite && !staff) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-6">
        <h1 className="h1 text-center">{t("Who are you?")}</h1>
        <div className="grid gap-3 sm:grid-cols-2">
          {([["/signup/tenant", "🏠", "I'm a tenant", "Renting a place"], ["/signup/landlord", "🏢", "I'm a landlord", "Renting out a property"]] as const).map(([href, icon, title, sub]) => (
            <Link key={href} href={href} className="card block !p-6 text-center transition hover:border-brand-600">
              <p className="text-4xl">{icon}</p><p className="mt-2 text-lg font-bold">{t(title)}</p><p className="muted">{t(sub)}</p>
            </Link>
          ))}
        </div>
        <p className="muted text-center">{t("Already have an account?")} <Link className="font-semibold text-brand-700" href="/login">{t("Log in")}</Link></p>
      </div>
    );
  }
  const inv = invite ? await getInvite(invite) : null;
  const role = inv?.role === "owner" ? "owner" : "tenant";
  return (
    <div className="mx-auto max-w-lg space-y-4 py-6">
      <h1 className="h1">{t(staff ? "Create your staff account" : "Create your account")}</h1>
      {inv && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{t(role === "owner" ? "You'll join the rental as the landlord right after signing up." : "You'll join the rental as the tenant right after signing up.")}</p>}
      <div className="card !p-6"><SignupForm role={role} invite={invite} staff={staff} email={inv?.email ?? undefined} google={googleEnabled()} /></div>
      <p className="muted">{t("Already have an account?")} <Link className="font-semibold text-brand-700" href={`/login${invite ? `?invite=${invite}` : `?staff=${staff}`}`}>{t("Log in")}</Link></p>
    </div>
  );
}
