import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { dashboardData, rentalStage } from "@/lib/dashboard";
import { AddRental, IssueList, Stat, SwitchView, Todos } from "@/components/dashboard";
import { Badge, fmtMoney } from "@/components/ui";

export default async function LandlordDashboard() {
  const user = await requireUser();
  const { rentals, todos, openIssues, names } = dashboardData(user, "owner");
  const active = rentals.filter((r) => rentalStage(r).active);
  const income = active.reduce((s, r) => s + (r.rent ?? 0), 0);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Landlord dashboard</p>
          <h1 className="h1">Hi {user.name.split(" ")[0]}</h1>
        </div>
        <SwitchView to="tenant" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Properties" value={rentals.length} />
        <Stat label="Active leases" value={active.length} />
        <Stat label="Open issues" value={openIssues.length} tone={openIssues.length ? "text-amber-700" : ""} />
        <Stat label="Monthly rent (active)" value={<span className="text-lg">{fmtMoney(income, rentals[0]?.currency ?? "QAR")}</span>} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Todos todos={todos} />
        <IssueList issues={openIssues} title="Open issues across your properties" />
      </div>
      <div className="space-y-2">
        <h2 className="h2">Your properties</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {rentals.map((r) => {
            const s = rentalStage(r);
            const n = openIssues.filter((i) => i.rental_id === r.id).length;
            return (
              <Link key={r.id} href={`/rentals/${r.id}`} className="card block transition hover:border-brand-600">
                <div className="flex items-start justify-between gap-2">
                  <div><h3 className="font-semibold">{r.name}</h3><p className="muted">{r.address}</p></div>
                  {s.active ? <Badge tone="green">Active</Badge> : r.ended_at ? <Badge>Closed</Badge> : <Badge tone="amber">Setting up</Badge>}
                </div>
                <p className="mt-2 text-sm">{s.label}</p>
                <p className="muted mt-1">Tenant: {names.get(r.tenant_id ?? 0) ?? "not joined yet"} · {fmtMoney(r.rent, r.currency)}/mo{n ? ` · ${n} open issue${n > 1 ? "s" : ""}` : ""}</p>
              </Link>
            );
          })}
        </div>
      </div>
      <AddRental role="owner" open={rentals.length === 0} />
    </div>
  );
}
