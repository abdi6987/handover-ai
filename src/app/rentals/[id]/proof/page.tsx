import { loadRental } from "@/lib/page";
import { getT } from "@/lib/i18n";
import { verifyAuditChain, rentalAudit } from "@/lib/audit";
import { issuesFor, verifyRental } from "@/lib/rentals";
import { Badge, fmt } from "@/components/ui";
import { PrintButton } from "@/components/client";
import { ISSUE_STATUS, ISSUE_TYPES } from "@/lib/types";

export default async function Proof({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  const { rental: r, names } = await loadRental(id);
  const checks = verifyRental(r);
  const chain = verifyAuditChain();
  const allOk = checks.every((c) => c.ok) && chain.ok;
  const manifest = r.movein_manifest ? (JSON.parse(r.movein_manifest) as { files: { id: number; room: string; name: string; sha256: string; uploaded_at: string; uploaded_by: number }[] }) : null;
  const issues = issuesFor(r.id);
  const audit = rentalAudit(r.id);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">{t("Proof report")}</h2>
        <PrintButton />
      </div>
      <div className={`card ${allOk ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}>
        <p className="text-lg font-bold">{t(allOk ? "✅ Record verified: nothing has been altered" : r.movein_seal ? "⚠️ Verification found a problem" : "Move-in media isn't sealed yet")}</p>
        <p className="text-sm text-gray-700">{t("Checked {date}.", { date: fmt(new Date().toISOString()) })} {r.name}, {r.address}. {t("Owner:")} {names.get(r.owner_id ?? 0) ?? "—"}. {t("Tenant:")} {names.get(r.tenant_id ?? 0) ?? "—"}.</p>
      </div>
      <div className="card space-y-2">
        <h3 className="font-semibold">{t("Integrity checks")}</h3>
        <ul className="space-y-1 text-sm">
          {checks.map((c, i) => <li key={i}>{c.ok ? "✅" : "❌"} {t(c.label, c.vars)}{c.detail ? <span className="mono ms-1 text-gray-400">{c.detail}…</span> : null}</li>)}
          <li>{chain.ok ? "✅" : "❌"} {t("Activity log hash chain intact ({n} entries)", { n: chain.count })}{chain.brokenAt ? `, ${t("broken at entry {n}", { n: chain.brokenAt })}` : ""}</li>
        </ul>
      </div>
      {manifest && (
        <div className="card space-y-2">
          <h3 className="font-semibold">{t("Sealed move-in record")}</h3>
          <p className="text-sm">{t("Approved by {name} on {date}.", { name: names.get(r.movein_approved_by ?? 0) ?? "", date: fmt(r.movein_approved_at) })}</p>
          <p className="mono">{t("Seal:")} {r.movein_seal}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="text-gray-500"><tr><th className="py-1 pe-2">{t("Room")}</th><th className="pe-2">{t("File")}</th><th className="pe-2">{t("Uploaded")}</th><th>{t("SHA-256")}</th></tr></thead>
              <tbody>{manifest.files.map((f) => <tr key={f.id} className="border-t border-gray-100"><td className="py-1 pe-2">{t(f.room ?? "")}</td><td className="pe-2"><a className="text-brand-700" href={`/api/media/${f.id}/file`}>{f.name}</a></td><td className="whitespace-nowrap pe-2">{fmt(f.uploaded_at)} · {names.get(f.uploaded_by)}</td><td className="font-mono">{f.sha256}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
      <div className="card space-y-2 text-sm">
        <h3 className="font-semibold">{t("Signatures")}</h3>
        {(["owner", "tenant"] as const).map((s) => <p key={s}><span>{t(s === "owner" ? "Landlord" : "Tenant")}</span>: {r[`${s}_signed_at`] ? <>{t("signed as \"{name}\" on {date}", { name: r[`${s}_sign_name`] ?? "", date: fmt(r[`${s}_signed_at`]) })} <span className="mono text-gray-500">{r[`${s}_sign_hash`]}</span></> : t("not signed")}</p>)}
      </div>
      <div className="card space-y-2">
        <h3 className="font-semibold">{t("Issues logged during the lease ({n})", { n: issues.length })}</h3>
        <table className="w-full text-start text-xs">
          <tbody>{issues.map((i) => <tr key={i.id} className="border-t border-gray-100"><td className="py-1 pe-2">{fmt(i.created_at, false)}</td><td className="pe-2">{i.title}{i.room ? ` (${t(i.room)})` : ""}</td><td className="pe-2">{t(ISSUE_TYPES[i.type])}</td><td className="pe-2">{i.reporter_name}</td><td><Badge tone={i.status === "done" ? "green" : "amber"}>{t(ISSUE_STATUS[i.status])}</Badge>{i.done_at ? ` ${fmt(i.done_at, false)}` : ""}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="card space-y-1">
        <h3 className="font-semibold">{t("Activity log ({n} entries)", { n: audit.length })}</h3>
        <div className="max-h-96 overflow-auto text-xs print:max-h-none">
          {audit.map((a) => <p key={a.id} className="border-t border-gray-100 py-1"><span className="text-gray-500">{fmt(a.created_at)}</span> · {a.actor_name ?? t("System")} · {a.action} <span className="mono text-gray-400">{a.hash}</span></p>)}
        </div>
      </div>
    </div>
  );
}
