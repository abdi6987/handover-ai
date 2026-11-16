import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dashboardData, rentalStage } from "@/lib/dashboard";
import { AddRental, IssueList, Stat, SwitchView, Todos } from "@/components/dashboard";
import { Badge, fmt, fmtMoney } from "@/components/ui";
import { BILL_CATEGORIES } from "@/lib/types";

export default async function TenantDashboard() {
  const user = await requireUser();
  const { rentals, todos, openIssues, names } = dashboardData(user, "tenant");
  const month = new Date().toISOString().slice(0, 7);
  const bills = db().prepare("SELECT category, SUM(amount) total FROM bills WHERE user_id = ? AND period = ? GROUP BY category").all(user.id, month) as { category: keyof typeof BILL_CATEGORIES; total: number }[];
  const unpaid = (db().prepare("SELECT COALESCE(SUM(amount),0) s, COUNT(*) n FROM bills WHERE user_id = ? AND paid_at IS NULL").get(user.id) as { s: number; n: number });
  const monthTotal = bills.reduce((s, b) => s + b.total, 0);
  const home = rentals.find((r) => !r.ended_at) ?? rentals[0];
  const cur = home?.currency ?? "QAR";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Tenant dashboard</p>
          <h1 className="h1">Hi {user.name.split(" ")[0]}</h1>
        </div>
        <SwitchView to="owner" />
      </div>

      {home && (
        <Link href={`/rentals/${home.id}`} className="card block border-brand-600/30 bg-brand-50 transition hover:border-brand-600">
          <div className="flex items-start justify-between gap-2">
            <div><p className="text-xs font-semibold uppercase text-brand-700">My home</p><h2 className="text-xl font-bold">{home.name}</h2><p className="muted">{home.address}</p></div>
            {rentalStage(home).active ? <Badge tone="green">Lease active</Badge> : <Badge tone="amber">Setting up</Badge>}
          </div>
          <p className="mt-2 text-sm">{rentalStage(home).label}</p>
          <p className="muted mt-1">Landlord: {names.get(home.owner_id ?? 0) ?? "not joined yet"} · Rent {fmtMoney(home.rent, cur)}/mo{home.end_date ? ` · until ${fmt(home.end_date, false)}` : ""}</p>
        </Link>
      )}

      {home && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Link href={`/rentals/${home.id}/issues`} className="btn-secondary">🛠️ Report an issue</Link>
          <Link href={`/rentals/${home.id}/spending`} className="btn-secondary">💡 Add a bill</Link>
          <Link href={`/rentals/${home.id}/move-in`} className="btn-secondary">📸 Move-in photos</Link>
          <Link href={`/rentals/${home.id}/proof`} className="btn-secondary">🔒 My proof</Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Todos todos={todos} />
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="h2">My bills this month</h2>
            <span className="text-xs text-gray-500">🔒 only you see this</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Total" value={<span className="text-lg">{fmtMoney(monthTotal, cur)}</span>} />
            <Stat label={`Unpaid (${unpaid.n})`} value={<span className="text-lg">{fmtMoney(unpaid.s, cur)}</span>} tone={unpaid.s ? "text-red-700" : ""} />
          </div>
          <ul className="space-y-1 text-sm">
            {Object.entries(BILL_CATEGORIES).map(([k, v]) => <li key={k} className="flex justify-between"><span>{v}</span><span className="font-medium">{fmtMoney(bills.find((b) => b.category === k)?.total ?? 0, cur)}</span></li>)}
          </ul>
          {home && <Link href={`/rentals/${home.id}/spending`} className="text-sm font-semibold text-brand-700">Open spending tracker →</Link>}
        </div>
      </div>
      <IssueList issues={openIssues} title="My open issues and repairs" />
      {rentals.length > 1 && (
        <div className="space-y-2">
          <h2 className="h2">All my rentals</h2>
          {rentals.map((r) => <Link key={r.id} href={`/rentals/${r.id}`} className="card block"><span className="font-medium">{r.name}</span> <span className="muted">· {rentalStage(r).label}</span></Link>)}
        </div>
      )}
      <AddRental role="tenant" open={rentals.length === 0} />
    </div>
  );
}
