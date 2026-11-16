import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

const TENANT = ["Photo and video proof of the apartment before you move in", "Sign only after the landlord approves that proof", "Report repairs and breakages with photos, tracked until Done", "Private tracker for electricity, water and internet bills", "AI move-out check so you don't pay for damage you didn't cause"];
const OWNER = ["Approve the move-in condition before the lease is signed", "Tamper-evident, timestamped record of every room", "All repair and damage reports for each property in one log", "Invite tenants by email or WhatsApp", "AI compares move-out with move-in and flags new damage"];

export default async function Home() {
  if (await currentUser()) redirect("/dashboard");
  return (
    <div className="space-y-8 py-4">
      <section className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Who are you?</h1>
        <p className="mx-auto max-w-xl text-gray-600">Handover AI keeps move-in proof, the lease, repairs and move-out checks in one shared, timestamped record.</p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        {([["tenant", "🏠", "I'm a tenant", "Renting a place", TENANT], ["owner", "🏢", "I'm a landlord", "Renting out a property", OWNER]] as const).map(([as, icon, title, sub, points]) => (
          <div key={as} className="card flex flex-col gap-4 !p-6">
            <div>
              <div className="text-4xl">{icon}</div>
              <h2 className="mt-2 text-xl font-bold">{title}</h2>
              <p className="muted">{sub}</p>
            </div>
            <ul className="flex-1 space-y-1.5 text-sm text-gray-700">
              {points.map((p) => <li key={p} className="flex gap-2"><span className="text-brand-600">✓</span>{p}</li>)}
            </ul>
            <div className="flex gap-2">
              <Link href={`/signup?as=${as}`} className="btn-primary flex-1">Sign up as {as === "owner" ? "landlord" : "tenant"}</Link>
              <Link href="/login" className="btn-secondary">Log in</Link>
            </div>
          </div>
        ))}
      </section>
      <section className="card">
        <h2 className="h2">How it works</h2>
        <ol className="mt-3 grid gap-3 text-sm sm:grid-cols-5">
          {["Record move-in photos and videos", "Landlord approves and the set is sealed", "Then the lease is signed", "Log repairs, breakages and wear and tear", "AI compares at move-out"].map((s, i) => (
            <li key={s} className="rounded-xl bg-gray-50 p-3"><span className="font-bold text-brand-700">{i + 1}.</span> {s}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
