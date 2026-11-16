import Link from "next/link";
import { getT } from "@/lib/i18n";
import { requireUser } from "@/lib/auth";
import { daysBetween, landlordLog } from "@/lib/maintenance";
import { staffOf } from "@/lib/staff";
import { Badge, fmt, fmtMoney } from "@/components/ui";
import { ISSUE_CATEGORIES, ISSUE_STATUS, ISSUE_TYPES, type Issue } from "@/lib/types";

type SP = { property?: string; status?: string; type?: string; from?: string; staff?: string; cat?: string };
const tone = (s: string) => (s === "done" ? "green" : s === "disputed" ? "red" : s === "reported" ? "amber" : "blue") as "green" | "red" | "amber" | "blue";

export default async function MaintenanceLog({ searchParams }: { searchParams: Promise<SP> }) {
  const t = await getT();
  const user = await requireUser();
  const sp = await searchParams;
  const { rentals, rows } = await landlordLog(user.id);
  const team = await staffOf(user.id);
  const year = new Date().getFullYear().toString();
  const cur = rentals[0]?.currency ?? "QAR";
  const shown = rows.filter((r) =>
    (!sp.cat || r.category === sp.cat) &&
    (!sp.property || String(r.rental_id) === sp.property) &&
    (!sp.status || sp.status === "all" || (sp.status === "open" ? r.status !== "done" : r.status === sp.status)) &&
    (!sp.type || r.type === sp.type) &&
    (!sp.from || r.reporter_role === sp.from) &&
    (!sp.staff || (sp.staff === "none" ? !r.assigned_to : String(r.assigned_to) === sp.staff)));
  const q = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `?${p.toString()}`;
  };
  const chip = (label: string, patch: Partial<SP>, active: boolean) => (
    <Link key={label} href={q(patch)} className={`badge px-3 py-1 ${active ? "bg-gray-900 text-white" : "bg-white ring-1 ring-gray-200"}`}>{t(label)}</Link>
  );
  const sum = (list: typeof rows) => list.reduce((s, r) => s + (r.repair_cost ?? 0), 0);
  const avgFix = (() => { const d = rows.filter((r) => r.done_at); return d.length ? Math.round(d.reduce((s, r) => s + daysBetween(r.created_at, r.done_at), 0) / d.length) : null; })();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/dashboard/landlord" className="text-sm font-semibold text-brand-700">{t("← Landlord dashboard")}</Link>
          <h1 className="h1">{t("Maintenance and complaints")}</h1>
          <p className="muted">{t("Every repair, upkeep job and tenant complaint across all your properties.")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/landlord/staff" className="btn-secondary">{t("🧰 Staff")}</Link>
          <a href="/api/landlord/maintenance" className="btn-secondary">{t("Download CSV")}</a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card !p-3"><p className="muted">{t("Open items")}</p><p className="text-2xl font-bold text-amber-700">{rows.filter((r) => r.status !== "done").length}</p></div>
        <div className="card !p-3"><p className="muted">{t("Open tenant complaints")}</p><p className="text-2xl font-bold text-red-700">{rows.filter((r) => r.status !== "done" && r.reporter_role === "tenant").length}</p></div>
        <div className="card !p-3"><p className="muted">{t("Avg. days to fix")}</p><p className="text-2xl font-bold">{avgFix ?? "—"}</p></div>
        <div className="card !p-3"><p className="muted">{t("Upkeep and repair cost")} {year}</p><p className="text-lg font-bold">{fmtMoney(sum(rows.filter((r) => r.created_at.startsWith(year))), cur)}</p></div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="h2 mb-2">{t("By property")}</h2>
        <table className="w-full min-w-[560px] text-start text-sm">
          <thead className="text-xs text-gray-500"><tr><th className="py-1">{t("Property")}</th><th>{t("Open")}</th><th>{t("Tenant complaints (open)")}</th><th>{t("Done")}</th><th>{t("Cost")} {year}</th><th>{t("Last activity")}</th></tr></thead>
          <tbody>
            {rentals.map((p) => {
              const mine = rows.filter((r) => r.rental_id === p.id);
              return (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="py-2"><Link href={q({ property: String(p.id) })} className="font-medium text-brand-700">{p.name}</Link></td>
                  <td>{mine.filter((r) => r.status !== "done").length}</td>
                  <td>{mine.filter((r) => r.status !== "done" && r.reporter_role === "tenant").length}</td>
                  <td>{mine.filter((r) => r.status === "done").length}</td>
                  <td>{fmtMoney(sum(mine.filter((r) => r.created_at.startsWith(year))), p.currency)}</td>
                  <td className="text-gray-500">{mine[0] ? fmt(mine[0].last_activity, false) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {chip("All properties", { property: undefined }, !sp.property)}
          {rentals.map((p) => chip(p.name, { property: String(p.id) }, sp.property === String(p.id)))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chip("Open", { status: "open" }, sp.status === "open")}
          {chip("Done", { status: "done" }, sp.status === "done")}
          {chip("Any status", { status: undefined }, !sp.status)}
          <span className="w-2" />
          {chip("Tenant complaints", { from: "tenant" }, sp.from === "tenant")}
          {chip("Logged by me", { from: "owner" }, sp.from === "owner")}
          {chip("Anyone", { from: undefined }, !sp.from)}
          <span className="w-2" />
          {chip("Unassigned", { staff: "none" }, sp.staff === "none")}
          {team.map((t) => chip(`🧰 ${t.name}`, { staff: String(t.id) }, sp.staff === String(t.id)))}
          {chip("Any staff", { staff: undefined }, !sp.staff)}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chip("All types", { type: undefined }, !sp.type)}
          {(Object.keys(ISSUE_TYPES) as Issue["type"][]).map((t) => chip(ISSUE_TYPES[t], { type: t }, sp.type === t))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chip("All categories", { cat: undefined }, !sp.cat)}
          {Object.entries(ISSUE_CATEGORIES).filter(([k]) => rows.some((r) => r.category === k)).map(([k, c]) => chip(`${c.icon} ${t(c.label)}`, { cat: k }, sp.cat === k))}
        </div>
      </div>

      <div className="space-y-2">
        {shown.length === 0 && <p className="muted">{t("Nothing matches these filters.")}</p>}
        {shown.map((r) => (
          <Link key={r.id} href={`/rentals/${r.rental_id}/issues/${r.id}`} className="card block !p-4 transition hover:border-brand-600">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{r.category ? `${ISSUE_CATEGORIES[r.category]?.icon} ` : ""}{r.title}</p>
                <p className="muted">{r.rental_name} · {t(ISSUE_TYPES[r.type])}{r.room ? ` · ${t(r.room)}` : ""}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {r.urgency === "urgent" && r.status !== "done" && <span className="badge bg-red-600 text-white">{t("Urgent")}</span>}
                {r.reporter_role === "tenant" && <Badge tone="red">{t("Tenant complaint")}</Badge>}
                <Badge tone={tone(r.status)}>{t(ISSUE_STATUS[r.status])}</Badge>
              </div>
            </div>
            <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-gray-500">
              <span>{t("Reported {date} by {name}", { date: fmt(r.created_at), name: r.reporter_name })}</span>
              {r.done_at ? <span>{t("Done {date} ({n} days)", { date: fmt(r.done_at, false), n: daysBetween(r.created_at, r.done_at) })}</span> : <span>{t("Open {n} days", { n: daysBetween(r.created_at) })}</span>}
              <span>{t("{n} updates", { n: r.updates })}</span>
              <span>{r.assignee_name ? `🧰 ${r.assignee_name}` : r.status !== "done" ? t("Unassigned") : ""}</span>
              {r.repair_cost !== null && <span className="font-medium text-gray-700">{fmtMoney(r.repair_cost, cur)}{r.cost_note ? ` · ${r.cost_note}` : ""}</span>}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
