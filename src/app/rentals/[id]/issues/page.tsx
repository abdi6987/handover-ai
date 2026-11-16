import Link from "next/link";
import { getT } from "@/lib/i18n";
import { loadRental } from "@/lib/page";
import { db } from "@/lib/db";
import { issuesFor } from "@/lib/rentals";
import { IssueReportForm } from "@/components/client";
import { Badge, fmt } from "@/components/ui";
import { ISSUE_CATEGORIES, ISSUE_STATUS, ISSUE_TYPES, ROOMS, URGENCY } from "@/lib/types";

const statusTone = (s: string) => (s === "done" ? "green" : s === "disputed" ? "red" : s === "reported" ? "amber" : "blue") as "green" | "red" | "amber" | "blue";

export default async function Issues({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ filter?: string }> }) {
  const t = await getT();
  const { id } = await params;
  const { filter = "all" } = await searchParams;
  const { rental: r, role } = await loadRental(id);
  const all = await issuesFor(r.id);
  const shown = all.filter((i) => filter === "all" || (filter === "open" ? i.status !== "done" : filter === "done" ? i.status === "done" : i.type === filter));
  const counts = new Map(((await db().all("SELECT ref_id, COUNT(*) n FROM media WHERE rental_id = ? AND context='issue' AND deleted_at IS NULL GROUP BY ref_id", r.id)) as { ref_id: number; n: number }[]).map((c) => [c.ref_id, c.n]));
  const photoCount = (iid: number) => counts.get(iid) ?? 0;
  const base = `/rentals/${r.id}/issues`;
  const filters = [["all", "All"], ["open", "Open"], ["done", "Done"], ["maintenance", "Maintenance"], ["damage", "Breakage"], ["wear_tear", "Wear & tear"], ["upkeep", "Upkeep"]];
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-3 lg:col-span-3">
        <div className="flex flex-wrap gap-1.5">
          {filters.map(([k, l]) => <Link key={k} href={`${base}?filter=${k}`} className={`badge px-3 py-1 ${filter === k ? "bg-gray-900 text-white" : "bg-white ring-1 ring-gray-200"}`}>{t(l)}</Link>)}
        </div>
        <p className="muted">{t("Every report stays in this log for the whole lease, including Done items, with photos, comments and dates.")}</p>
        {shown.length === 0 && <p className="muted">{t("Nothing here.")}</p>}
        {shown.map((i) => (
          <Link key={i.id} href={`${base}/${i.id}`} className="card block transition hover:border-brand-600">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{i.category ? `${ISSUE_CATEGORIES[i.category]?.icon ?? ""} ` : ""}{i.title}{i.urgency === "urgent" && i.status !== "done" ? <span className="ms-2 badge bg-red-600 text-white">{t("Urgent")}</span> : null}</p>
                <p className="muted">{i.category ? `${t(ISSUE_CATEGORIES[i.category]?.label ?? "")} · ` : ""}{t(ISSUE_TYPES[i.type])}{i.room ? ` · ${t(i.room)}` : ""} · {t("Reported {date} by {name}", { date: fmt(i.created_at), name: i.reporter_name })}</p>
              </div>
              <Badge tone={statusTone(i.status)}>{t(ISSUE_STATUS[i.status])}{i.status === "done" && i.confirmed_at ? " ✓" : ""}</Badge>
            </div>
            {i.description && <p className="mt-2 line-clamp-2 text-sm text-gray-700">{i.description}</p>}
            <p className="mt-1 text-xs text-gray-500">{t("{n} attachments", { n: photoCount(i.id) })}{i.done_at ? ` · ${t("Done {date}", { date: fmt(i.done_at) })}` : ""}</p>
          </Link>
        ))}
      </div>
      <div className="card h-fit space-y-3 lg:col-span-2">
        <h2 className="h2">{t("Report an issue")}</h2>
        <IssueReportForm rentalId={r.id} role={role} currency={r.currency} rooms={ROOMS.map((x) => t(x))} types={Object.fromEntries(Object.entries(ISSUE_TYPES).map(([k, v]) => [k, t(v)]))} categories={Object.fromEntries(Object.entries(ISSUE_CATEGORIES).map(([k, c]) => [k, { ...c, label: t(c.label), hint: t(c.hint) }]))} urgency={Object.fromEntries(Object.entries(URGENCY).map(([k, v]) => [k, t(v)]))} />
        <p className="muted">{t(role === "owner" ? "The tenant gets an email right away, and you can send it to their WhatsApp in one tap." : "The landlord gets an email right away, and you can send it to their WhatsApp in one tap.")}</p>
      </div>
    </div>
  );
}
