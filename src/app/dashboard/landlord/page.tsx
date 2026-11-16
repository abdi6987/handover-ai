import Link from "next/link";
import { getT } from "@/lib/i18n";
import { requireUser } from "@/lib/auth";
import { dashboardData, rentalStage } from "@/lib/dashboard";
import { landlordLog } from "@/lib/maintenance";
import { AddRental, IssueList, Stat, SwitchView, Todos } from "@/components/dashboard";
import { Badge, fmtMoney } from "@/components/ui";

export default async function LandlordDashboard() {
  const t = await getT();
  const user = await requireUser();
  const { rentals, todos, openIssues, names } = await dashboardData(user, "owner", t);
  const active = rentals.filter((r) => rentalStage(r).active);
  const income = active.reduce((s, r) => s + (r.rent ?? 0), 0);
  const { rows: log } = await landlordLog(user.id);
  const year = new Date().getFullYear().toString();
  const yearCost = (id: number) => log.filter((l) => l.rental_id === id && l.created_at.startsWith(year)).reduce((s, l) => s + (l.repair_cost ?? 0), 0);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{t("Landlord dashboard")}</p>
          <h1 className="h1">{t("Hi")} {user.name.split(" ")[0]}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/landlord/maintenance" className="btn-primary">{t("🛠️ Maintenance log")}</Link>
          <Link href="/dashboard/landlord/staff" className="btn-secondary">{t("🧰 Staff")}</Link>
          <SwitchView to="tenant" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("Properties")} value={rentals.length} />
        <Stat label={t("Active leases")} value={active.length} />
        <Stat label={t("Open issues")} value={openIssues.length} tone={openIssues.length ? "text-amber-700" : ""} />
        <Stat label={t("Monthly rent (active)")} value={<span className="text-lg">{fmtMoney(income, rentals[0]?.currency ?? "QAR")}</span>} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Todos todos={todos} />
        <IssueList issues={openIssues} title={t("Open issues across your properties")} />
      </div>
      <div className="space-y-2">
        <h2 className="h2">{t("Your properties")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {rentals.map((r) => {
            const s = rentalStage(r);
            const n = openIssues.filter((i) => i.rental_id === r.id).length;
            const complaints = openIssues.filter((i) => i.rental_id === r.id && i.reported_by !== user.id).length;
            return (
              <Link key={r.id} href={`/rentals/${r.id}`} className="card block transition hover:border-brand-600">
                <div className="flex items-start justify-between gap-2">
                  <div><h3 className="font-semibold">{r.name}</h3><p className="muted">{r.address}</p></div>
                  {s.active ? <Badge tone="green">{t("Active")}</Badge> : r.ended_at ? <Badge>{t("Closed")}</Badge> : <Badge tone="amber">{t("Setting up")}</Badge>}
                </div>
                <p className="mt-2 text-sm">{t(s.label)}</p>
                <p className="muted mt-1">{t("Tenant:")} {names.get(r.tenant_id ?? 0) ?? t("not joined yet")} · {fmtMoney(r.rent, r.currency)}{t("/mo")}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <Badge tone={n ? "amber" : "gray"}>{t("{n} open", { n })}</Badge>
                  {complaints > 0 && <Badge tone="red">{t("{n} tenant complaints", { n: complaints })}</Badge>}
                  <Badge>{t("Upkeep")} {year}: {fmtMoney(yearCost(r.id), r.currency)}</Badge>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
      <AddRental role="owner" open={rentals.length === 0} />
    </div>
  );
}
