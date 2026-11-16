import { loadRental } from "@/lib/page";
import { verifyAuditChain, rentalAudit } from "@/lib/audit";
import { issuesFor, verifyRental } from "@/lib/rentals";
import { Badge, fmt } from "@/components/ui";
import { PrintButton } from "@/components/client";
import { ISSUE_STATUS, ISSUE_TYPES } from "@/lib/types";

export default async function Proof({ params }: { params: Promise<{ id: string }> }) {
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
        <h2 className="h2">Proof report</h2>
        <PrintButton />
      </div>
      <div className={`card ${allOk ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}>
        <p className="text-lg font-bold">{allOk ? "✅ Record verified: nothing has been altered" : r.movein_seal ? "⚠️ Verification found a problem" : "Move-in media isn't sealed yet"}</p>
        <p className="text-sm text-gray-700">Checked {fmt(new Date().toISOString())}. {r.name}, {r.address}. Owner: {names.get(r.owner_id ?? 0) ?? "—"}. Tenant: {names.get(r.tenant_id ?? 0) ?? "—"}.</p>
      </div>
      <div className="card space-y-2">
        <h3 className="font-semibold">Integrity checks</h3>
        <ul className="space-y-1 text-sm">
          {checks.map((c, i) => <li key={i}>{c.ok ? "✅" : "❌"} {c.label}{c.detail ? <span className="mono ml-1 text-gray-400">{c.detail}…</span> : null}</li>)}
          <li>{chain.ok ? "✅" : "❌"} Activity log hash chain intact ({chain.count} entries){chain.brokenAt ? `, broken at entry ${chain.brokenAt}` : ""}</li>
        </ul>
      </div>
      {manifest && (
        <div className="card space-y-2">
          <h3 className="font-semibold">Sealed move-in record</h3>
          <p className="text-sm">Approved by {names.get(r.movein_approved_by ?? 0)} on {fmt(r.movein_approved_at)}.</p>
          <p className="mono">Seal: {r.movein_seal}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-gray-500"><tr><th className="py-1 pr-2">Room</th><th className="pr-2">File</th><th className="pr-2">Uploaded</th><th>SHA-256</th></tr></thead>
              <tbody>{manifest.files.map((f) => <tr key={f.id} className="border-t border-gray-100"><td className="py-1 pr-2">{f.room}</td><td className="pr-2"><a className="text-brand-700" href={`/api/media/${f.id}/file`}>{f.name}</a></td><td className="whitespace-nowrap pr-2">{fmt(f.uploaded_at)} · {names.get(f.uploaded_by)}</td><td className="font-mono">{f.sha256}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
      <div className="card space-y-2 text-sm">
        <h3 className="font-semibold">Signatures</h3>
        {(["owner", "tenant"] as const).map((s) => <p key={s}><span className="capitalize">{s}</span>: {r[`${s}_signed_at`] ? <>signed as &quot;{r[`${s}_sign_name`]}&quot; on {fmt(r[`${s}_signed_at`])} <span className="mono text-gray-500">{r[`${s}_sign_hash`]}</span></> : "not signed"}</p>)}
      </div>
      <div className="card space-y-2">
        <h3 className="font-semibold">Issues logged during the lease ({issues.length})</h3>
        <table className="w-full text-left text-xs">
          <tbody>{issues.map((i) => <tr key={i.id} className="border-t border-gray-100"><td className="py-1 pr-2">{fmt(i.created_at, false)}</td><td className="pr-2">{i.title}{i.room ? ` (${i.room})` : ""}</td><td className="pr-2">{ISSUE_TYPES[i.type]}</td><td className="pr-2">by {i.reporter_name}</td><td><Badge tone={i.status === "done" ? "green" : "amber"}>{ISSUE_STATUS[i.status]}</Badge>{i.done_at ? ` ${fmt(i.done_at, false)}` : ""}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="card space-y-1">
        <h3 className="font-semibold">Activity log ({audit.length} entries)</h3>
        <div className="max-h-96 overflow-auto text-xs print:max-h-none">
          {audit.map((a) => <p key={a.id} className="border-t border-gray-100 py-1"><span className="text-gray-500">{fmt(a.created_at)}</span> · {a.actor_name ?? "System"} · {a.action} <span className="mono text-gray-400">{a.hash}</span></p>)}
        </div>
      </div>
    </div>
  );
}
