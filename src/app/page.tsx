import Link from "next/link";
import { getT } from "@/lib/i18n";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { OWNER, TENANT } from "@/lib/benefits";


export default async function Home() {
  const t = await getT();
  if (await currentUser()) redirect("/dashboard");
  return (
    <div className="space-y-8 py-4">
      <section className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("Who are you?")}</h1>
        <p className="mx-auto max-w-xl text-gray-600">{t("Handover AI keeps move-in proof, the lease, repairs and move-out checks in one shared, timestamped record.")}</p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        {([["tenant", "🏠", "I'm a tenant", "Renting a place", TENANT], ["owner", "🏢", "I'm a landlord", "Renting out a property", OWNER]] as const).map(([as, icon, title, sub, points]) => (
          <div key={as} className="card flex flex-col gap-4 !p-6">
            <div>
              <div className="text-4xl">{icon}</div>
              <h2 className="mt-2 text-xl font-bold">{t(title)}</h2>
              <p className="muted">{t(sub)}</p>
            </div>
            <ul className="flex-1 space-y-1.5 text-sm text-gray-700">
              {points.map((p) => <li key={p} className="flex gap-2"><span className="text-brand-600">✓</span>{t(p)}</li>)}
            </ul>
            <div className="flex gap-2">
              <Link href={as === "owner" ? "/signup/landlord" : "/signup/tenant"} className="btn-primary flex-1">{t(as === "owner" ? "Sign up as landlord" : "Sign up as tenant")}</Link>
              <Link href="/login" className="btn-secondary">{t("Log in")}</Link>
            </div>
          </div>
        ))}
      </section>
      <section className="card">
        <h2 className="h2">{t("How it works")}</h2>
        <ol className="mt-3 grid gap-3 text-sm sm:grid-cols-5">
          {["Record move-in photos and videos", "Landlord approves and the set is sealed", "Then the lease is signed", "Log repairs, breakages and wear and tear", "AI compares at move-out"].map((s, i) => (
            <li key={s} className="rounded-xl bg-gray-50 p-3"><span className="font-bold text-brand-700">{i + 1}.</span> {t(s)}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
