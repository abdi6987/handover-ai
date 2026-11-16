import Link from "next/link";
import { getT } from "@/lib/i18n";
import { loadRental } from "@/lib/page";
import { fullySigned, issuesFor, mediaFor } from "@/lib/rentals";
import { db } from "@/lib/db";
import type { Rental } from "@/lib/types";
import { InviteBox } from "@/components/client";
import { Badge, fmt, fmtMoney } from "@/components/ui";
import { ISSUE_STATUS, ISSUE_TYPES } from "@/lib/types";

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  const { rental: r, role, names } = await loadRental(id);
  const base = `/rentals/${r.id}`;
  const other = role === "owner" ? "tenant" : "owner";
  const otherId = role === "owner" ? r.tenant_id : r.owner_id;
  const moveIn = await mediaFor(r.id, "move_in");
  const issues = await issuesFor(r.id);
  const mySigned = !!r[`${role}_signed_at`];
  const docs = (await mediaFor(r.id, "document")).length;
  const moveOut = (await mediaFor(r.id, "move_out")).length;
  const lastAi = await db().prepare("SELECT c.created_at, (SELECT COUNT(*) FROM comparison_items i WHERE i.comparison_id = c.id AND i.classification = 'new_damage') dmg FROM comparisons c WHERE rental_id = ? AND status = 'done' ORDER BY id DESC LIMIT 1").get(r.id) as { created_at: string; dmg: number } | undefined;
  const cost = role === "owner" ? (await db().prepare("SELECT COALESCE(SUM(repair_cost),0) s FROM issues WHERE rental_id = ?").get(r.id) as { s: number }).s : 0;
  const past = role === "owner" ? (await db().prepare("SELECT * FROM rentals WHERE owner_id = ? AND id != ? AND lower(trim(address)) = lower(trim(?)) ORDER BY created_at DESC").all(r.owner_id, r.id, r.address) as Rental[]) : [];
  const glance: [string, string, string][] = [
    [t("Move-in photos/videos"), `${moveIn.length}${r.movein_status === "approved" ? ` · ${t("sealed")}` : ""}`, "move-in"],
    [t("Lease"), t(fullySigned(r) ? "Signed by both" : r.owner_signed_at || r.tenant_signed_at ? "Partly signed" : "Not signed"), "lease"],
    [t("Issues"), t("{open} open · {done} done", { open: issues.filter((i) => i.status !== "done").length, done: issues.filter((i) => i.status === "done").length }), "issues"],
    [t("Documents"), String(docs), "documents"],
    [t("Move-out"), moveOut ? t("{n} files", { n: moveOut }) + (lastAi ? " · " + t("AI: {n} new damage", { n: lastAi.dmg }) : "") : t("Not started"), "move-out"],
    ...(role === "owner" ? [[t("Repair/upkeep cost"), fmtMoney(cost, r.currency), "issues"] as [string, string, string]] : []),
  ];

  let next: { title: string; text: string; href: string; cta: string } | null = null;
  if (!otherId) next = null;
  else if (r.movein_status === "open" || r.movein_status === "changes_requested")
    next = { title: r.movein_status === "changes_requested" ? "The owner asked for more move-in pictures" : "Record the move-in condition", text: r.movein_status === "changes_requested" ? r.movein_note ?? "" : "Add photos and videos of every room, then submit them to the owner for approval.", href: `${base}/move-in`, cta: "Go to move-in" };
  else if (r.movein_status === "submitted")
    next = role === "owner"
      ? { title: "Review the move-in photos", text: "{n} photos/videos are waiting for your approval. The lease can only be signed after you approve.", href: `${base}/move-in`, cta: "Review and approve" }
      : { title: "Waiting for the owner's approval", text: "The owner is reviewing your move-in photos. You'll get an email when they approve.", href: `${base}/move-in`, cta: "View move-in" };
  else if (!fullySigned(r))
    next = mySigned ? { title: "Waiting for the {other} to sign", text: "You've signed. The lease becomes active once both sides sign.", href: `${base}/lease`, cta: "View lease" }
      : { title: "Sign the lease", text: "The move-in photos are approved and sealed. You can now sign.", href: `${base}/lease`, cta: "Sign the lease" };
  else if (!r.ended_at)
    next = { title: "Lease is active", text: "Report any repair, breakage or wear and tear as it happens. At the end, add move-out photos for the AI comparison.", href: `${base}/issues`, cta: "Report an issue" };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {!otherId && (
          <div className="card space-y-3">
            <h2 className="h2">{t(other === "owner" ? "Invite the landlord" : "Invite the tenant")}</h2>
            <p className="muted">{t("Send them an invite by email or WhatsApp. Once they join, you can start the move-in inspection together.")}</p>
            <InviteBox rentalId={r.id} other={other} />
          </div>
        )}
        {next && (
          <div className="card border-brand-600/30 bg-brand-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{t("Next step")}</p>
            <h2 className="h2 mt-1">{t(next.title, { other: t(other === "owner" ? "landlord" : "tenant") })}</h2>
            {next.text && <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{next.text === r.movein_note ? next.text : t(next.text, { n: moveIn.length })}</p>}
            <Link href={next.href} className="btn-primary mt-3">{t(next.cta)}</Link>
          </div>
        )}
        <div className="card">
          <h2 className="h2">{t("Everything at a glance")}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {glance.map(([label, value, tab]) => (
              <Link key={label} href={`${base}/${tab}`} className="rounded-xl bg-gray-50 p-3 transition hover:bg-brand-50">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="font-semibold">{value}</p>
              </Link>
            ))}
          </div>
        </div>
        {past.length > 0 && (
          <div className="card">
            <h2 className="h2">{t("Past tenancies at this address")}</h2>
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {past.map((p) => <li key={p.id} className="py-2"><Link href={`/rentals/${p.id}`} className="font-medium text-brand-700">{p.name}</Link> <span className="muted">· {fmt(p.start_date, false) || fmt(p.created_at, false)} – {p.ended_at ? fmt(p.ended_at, false) : t("ongoing")}</span></li>)}
            </ul>
          </div>
        )}
        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="h2">{t("Recent issues")}</h2>
            <Link href={`${base}/issues`} className="text-sm font-semibold text-brand-700">{t("All →")}</Link>
          </div>
          {issues.length === 0 ? <p className="muted mt-2">{t("Nothing reported yet.")}</p> : (
            <ul className="mt-2 divide-y divide-gray-100">
              {issues.slice(0, 5).map((i) => (
                <li key={i.id} className="py-2">
                  <Link href={`${base}/issues/${i.id}`} className="flex items-center justify-between gap-2">
                    <span><span className="font-medium">{i.title}</span><span className="muted"> · {t(ISSUE_TYPES[i.type])}{i.room ? ` · ${t(i.room)}` : ""}</span></span>
                    <Badge tone={i.status === "done" ? "green" : i.status === "disputed" ? "red" : "amber"}>{t(ISSUE_STATUS[i.status])}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="card h-fit space-y-2 text-sm">
        <h2 className="h2">{t("Details")}</h2>
        <p><span className="text-gray-500">{t("Owner:")}</span> {names.get(r.owner_id ?? 0) ?? t("not joined yet")}</p>
        <p><span className="text-gray-500">{t("Tenant:")}</span> {names.get(r.tenant_id ?? 0) ?? t("not joined yet")}</p>
        <p><span className="text-gray-500">{t("Rent:")}</span> {fmtMoney(r.rent, r.currency)} {t("/ month")}</p>
        <p><span className="text-gray-500">{t("Deposit:")}</span> {fmtMoney(r.deposit, r.currency)}</p>
        <p><span className="text-gray-500">{t("Period:")}</span> {fmt(r.start_date, false) || "?"} – {fmt(r.end_date, false) || "?"}</p>
        <p><span className="text-gray-500">{t("Move-in media:")}</span> {t("{n} files", { n: moveIn.length })} {r.movein_status === "approved" && <Badge tone="green">{t("sealed")}</Badge>}</p>
        <Link href={`${base}/proof`} className="btn-secondary mt-2 w-full">{t("Proof report")}</Link>
      </div>
    </div>
  );
}
