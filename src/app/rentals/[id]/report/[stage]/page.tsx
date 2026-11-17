import Link from "next/link";
import { notFound } from "next/navigation";
import { getT } from "@/lib/i18n";
import { loadRental } from "@/lib/page";
import { getUser } from "@/lib/auth";
import { appUrl } from "@/lib/notify";
import { buildReport, CONDITIONS, daysBetween, dueDate, dueText, localDate, ratingsOf, reportDone, reportHasContent, reportHash, reportRow, roomsOf, signBlocker, type Condition, type Stage } from "@/lib/inspections";
import { Form, PrintButton } from "@/components/client";
import { Badge, fmt, WhatsAppLink } from "@/components/ui";

const TONE = { good: "green", fair: "amber", damaged: "red", na: "gray" } as const;

export default async function InspectionReport({ params }: { params: Promise<{ id: string; stage: string }> }) {
  const t = await getT();
  const { id, stage: slug } = await params;
  const stage: Stage | null = slug === "move-in" ? "move_in" : slug === "move-out" ? "move_out" : null;
  if (!stage) notFound();
  const { user, rental: r, role, names } = await loadRental(id);
  const report = await buildReport(r, stage);
  const row = await reportRow(r.id, stage);
  const hash = row?.report_hash ?? reportHash(report);
  const block = signBlocker(r, stage, reportHasContent(report));
  const rooms = await roomsOf(r.id);
  const before = stage === "move_out" ? await ratingsOf(r.id, "move_in") : null;
  const beforeByName = new Map<string, Condition>();
  if (before) for (const room of rooms) for (const it of room.items) { const b = before.get(it.id); if (b) beforeByName.set(`${room.name}\u0000${it.name}`, b.condition); }
  const mine = row?.[`${role}_signed_at`];
  const other = role === "owner" ? "tenant" : "owner";
  const due = dueDate(r, stage);
  const done = reportDone(row);
  const title = t(stage === "move_in" ? "Move-in inspection report" : "Move-out inspection report");
  const back = `/rentals/${r.id}/${slug}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">{title}</h2>
        <div className="no-print flex gap-2"><Link href={back} className="btn-secondary">{t(stage === "move_in" ? "Back to move-in" : "Back to move-out")}</Link><PrintButton /></div>
      </div>
      <div className="card space-y-1 text-sm">
        <p><span className="text-gray-500">{t("Property:")}</span> {r.name}, {r.address}</p>
        <p><span className="text-gray-500">{t("Landlord:")}</span> {names.get(r.owner_id ?? 0) ?? "—"} · <span className="text-gray-500">{t("Tenant:")}</span> {names.get(r.tenant_id ?? 0) ?? "—"}</p>
        {due && <p><span className="text-gray-500">{t("Due:")}</span> {fmt(due, false)}{!done && <> · {dueText(daysBetween(localDate(), due), t)}</>}</p>}
        {stage === "move_in" && r.movein_seal && <p className="mono">{t("Move-in seal:")} {r.movein_seal}</p>}
        <p className="mono">{t("Report fingerprint:")} {hash}</p>
      </div>

      {report.rooms.map((room) => (
        <section key={room.name} className="card space-y-2">
          <h3 className="font-semibold">{t(room.name)} <span className="muted">📷 {report.files.filter((f) => f.room === room.name || f.room === t(room.name)).length}</span></h3>
          <table className="w-full table-fixed text-sm">
            <thead className="text-start text-xs text-gray-500"><tr><th className="w-[34%] py-1 pe-2 text-start">{t("Item")}</th>{before && <th className="w-[18%] pe-2 text-start">{t("At move-in")}</th>}<th className="w-[18%] pe-2 text-start">{t("Condition")}</th><th className="text-start">{t("Note")}</th></tr></thead>
            <tbody>
              {room.items.map((it) => {
                const b = beforeByName.get(`${room.name}\u0000${it.name}`);
                return (
                  <tr key={it.name} className="border-t border-gray-100 align-top">
                    <td className="break-words py-1.5 pe-2">{t(it.name)}</td>
                    {before && <td className="pe-2">{b ? t(CONDITIONS[b]) : "—"}</td>}
                    <td className="pe-2">{it.condition ? <Badge tone={TONE[it.condition]}>{t(CONDITIONS[it.condition])}</Badge> : <span className="text-gray-400">{t("Not rated")}</span>}</td>
                    <td className="break-words text-gray-700">{it.note ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      <details className="card">
        <summary className="cursor-pointer font-semibold">{t("Photos and videos in this report ({n})", { n: report.files.length })}</summary>
        <table className="mt-2 w-full text-start text-xs">
          <tbody>{report.files.map((f) => <tr key={f.id} className="border-t border-gray-100"><td className="py-1 pe-2">{t(f.room ?? "")}</td><td className="pe-2"><a className="text-brand-700" href={`/api/media/${f.id}/file`}>{f.name}</a></td><td className="font-mono">{f.sha256}</td></tr>)}</tbody>
        </table>
      </details>

      <div className="card space-y-3">
        <h3 className="font-semibold">{t("Signatures")}</h3>
        {(["owner", "tenant"] as const).map((side) => (
          <div key={side} className="flex items-start justify-between gap-2 rounded-lg bg-gray-50 p-3 text-sm">
            <div>
              <p className="font-medium">{t(side === "owner" ? "Landlord" : "Tenant")}</p>
              {row?.[`${side}_signed_at`] ? <p className="text-gray-600">{t("Signed as \"{name}\" on {date}", { name: row[`${side}_sign_name`] ?? "", date: fmt(row[`${side}_signed_at`]) })}<span className="mono block text-gray-400">{row[`${side}_sign_hash`]}</span></p> : <p className="text-gray-500">{t("Not signed yet")}</p>}
            </div>
            {row?.[`${side}_signed_at`] ? <Badge tone="green">{t("Signed")}</Badge> : <Badge>{t("Pending")}</Badge>}
          </div>
        ))}
      </div>

      {block ? (
        <p className="no-print rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t(block)}</p>
      ) : !mine ? (
        <div className="card no-print space-y-3">
          <h3 className="font-semibold">{t("Sign this report")}</h3>
          <p className="text-sm text-gray-700">{t("Your signature covers every room, rating, note and photo above (fingerprint {hash}). Once someone signs, the report can't be changed.", { hash: `${hash.slice(0, 16)}…` })}</p>
          <Form url={`/api/rentals/${r.id}/report`} submitLabel={t("Sign report")} extra={{ stage }}>
            <div><label className="label">{t("Type your full name")}</label><input name="name" required defaultValue={user.name} className="input" /></div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="agree" required className="mt-1" /> {t(stage === "move_in" ? "I confirm this report shows the property's condition at move-in." : "I confirm this report shows the property's condition at move-out.")}</label>
          </Form>
        </div>
      ) : !row?.[`${other}_signed_at`] && (
        <div className="card no-print flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">{t(other === "owner" ? "You signed. Waiting for the landlord." : "You signed. Waiting for the tenant.")}</p>
          <WhatsAppLink text={`I've signed the ${stage === "move_in" ? "move-in" : "move-out"} inspection report for "${r.name}" on Handover AI. Your turn: ${appUrl(`/rentals/${r.id}/report/${slug}`)}`} label={t("Remind on WhatsApp")} phone={(await getUser(role === "owner" ? r.tenant_id : r.owner_id))?.phone} />
        </div>
      )}
    </div>
  );
}
