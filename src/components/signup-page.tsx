import Link from "next/link";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { currentUser } from "@/lib/auth";
import { googleEnabled } from "@/lib/google";
import { OWNER, TENANT } from "@/lib/benefits";
import { SignupForm } from "./auth";

export async function SignupPage({ role }: { role: "owner" | "tenant" }) {
  const t = await getT();
  if (await currentUser()) redirect("/dashboard");
  const owner = role === "owner";
  return (
    <div className="grid gap-6 py-4 lg:grid-cols-5 lg:gap-10 lg:py-8">
      <section className="space-y-4 lg:col-span-2 lg:pt-6">
        <p className="text-5xl">{owner ? "🏢" : "🏠"}</p>
        <h1 className="text-3xl font-bold tracking-tight">{t(owner ? "Create your landlord account" : "Create your tenant account")}</h1>
        <p className="text-gray-600">{t(owner ? "Keep every property, inspection, repair and tenant complaint in one tamper-evident record." : "Protect your deposit with timestamped proof of the apartment, from move-in to move-out.")}</p>
        <ul className="space-y-2 text-sm text-gray-700">
          {(owner ? OWNER : TENANT).map((p) => <li key={p} className="flex gap-2"><span className="text-brand-600">✓</span>{t(p)}</li>)}
        </ul>
        <p className="rounded-xl bg-white p-3 text-sm text-gray-600 ring-1 ring-gray-200">
          {t(owner ? "Are you a tenant?" : "Are you a landlord?")}{" "}
          <Link href={owner ? "/signup/tenant" : "/signup/landlord"} className="font-semibold text-brand-700">{t(owner ? "Tenant sign up" : "Landlord sign up")} →</Link>
        </p>
      </section>
      <section className="lg:col-span-3">
        <div className="card mx-auto max-w-lg !p-6"><SignupForm role={role} google={googleEnabled()} /></div>
        <p className="muted mx-auto mt-4 max-w-lg text-center">{t("Already have an account?")} <Link className="font-semibold text-brand-700" href="/login">{t("Log in")}</Link></p>
      </section>
    </div>
  );
}
