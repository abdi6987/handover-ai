import Link from "next/link";
import { loadRental } from "@/lib/page";
import { appUrl } from "@/lib/notify";
import { db } from "@/lib/db";
import { Form } from "@/components/client";
import { Badge, fmt, fmtMoney, MediaTile, WhatsAppLink } from "@/components/ui";
import type { Media } from "@/lib/types";

export default async function Lease({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, rental: r, role, names } = await loadRental(id);
  const anySigned = !!(r.owner_signed_at || r.tenant_signed_at);
  const approved = r.movein_status === "approved";
  const mine = r[`${role}_signed_at`];
  const leaseDocs = db().prepare("SELECT * FROM media WHERE rental_id = ? AND context = 'document' AND deleted_at IS NULL AND lower(title) LIKE '%lease%' ORDER BY id DESC").all(r.id) as Media[];
  const other = role === "owner" ? "tenant" : "owner";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="card space-y-2 text-sm">
          <h2 className="h2">Lease</h2>
          <p><span className="text-gray-500">Property:</span> {r.name}, {r.address}</p>
          <p><span className="text-gray-500">Owner:</span> {names.get(r.owner_id ?? 0) ?? "—"} · <span className="text-gray-500">Tenant:</span> {names.get(r.tenant_id ?? 0) ?? "—"}</p>
          <p><span className="text-gray-500">Rent:</span> {fmtMoney(r.rent, r.currency)} / month · <span className="text-gray-500">Deposit:</span> {fmtMoney(r.deposit, r.currency)}</p>
          <p><span className="text-gray-500">From</span> {fmt(r.start_date, false) || "?"} <span className="text-gray-500">to</span> {fmt(r.end_date, false) || "?"}</p>
          {r.terms && <div className="whitespace-pre-line rounded-lg bg-gray-50 p-3">{r.terms}</div>}
          {leaseDocs.length > 0 && <div className="grid grid-cols-2 gap-2 pt-2">{leaseDocs.map((m) => <MediaTile key={m.id} m={m} uploader={names.get(m.uploaded_by)} />)}</div>}
          <p className="muted">Upload the lease PDF under <Link href={`/rentals/${r.id}/documents`} className="font-semibold text-brand-700">Documents</Link> (put &quot;lease&quot; in the title to show it here).</p>
        </div>
        {!anySigned && (
          <details className="card">
            <summary className="cursor-pointer font-semibold">Edit lease details</summary>
            <Form url={`/api/rentals/${r.id}`} method="PATCH" submitLabel="Save changes" className="mt-3" resetOnSuccess={false}>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className="label">Name</label><input name="name" defaultValue={r.name} className="input" /></div>
                <div className="col-span-2"><label className="label">Address</label><input name="address" defaultValue={r.address} className="input" /></div>
                <div><label className="label">Rent</label><input name="rent" type="number" step="any" defaultValue={r.rent ?? ""} className="input" /></div>
                <div><label className="label">Currency</label><input name="currency" defaultValue={r.currency} className="input" /></div>
                <div><label className="label">Deposit</label><input name="deposit" type="number" step="any" defaultValue={r.deposit ?? ""} className="input" /></div>
                <div />
                <div><label className="label">Start</label><input name="start_date" type="date" defaultValue={r.start_date ?? ""} className="input" /></div>
                <div><label className="label">End</label><input name="end_date" type="date" defaultValue={r.end_date ?? ""} className="input" /></div>
              </div>
              <div><label className="label">Terms</label><textarea name="terms" rows={5} defaultValue={r.terms} className="input" /></div>
            </Form>
          </details>
        )}
      </div>

      <div className="space-y-4">
        <div className="card space-y-3">
          <h2 className="h2">Signatures</h2>
          {(["owner", "tenant"] as const).map((side) => (
            <div key={side} className="flex items-start justify-between gap-2 rounded-lg bg-gray-50 p-3 text-sm">
              <div>
                <p className="font-medium capitalize">{side}</p>
                {r[`${side}_signed_at`] ? <p className="text-gray-600">Signed as &quot;{r[`${side}_sign_name`]}&quot; on {fmt(r[`${side}_signed_at`])}<span className="mono block text-gray-400">{r[`${side}_sign_hash`]}</span></p> : <p className="text-gray-500">Not signed yet</p>}
              </div>
              {r[`${side}_signed_at`] ? <Badge tone="green">Signed</Badge> : <Badge>Pending</Badge>}
            </div>
          ))}
        </div>

        {!approved ? (
          <div className="card space-y-2 border-amber-300 bg-amber-50">
            <h2 className="h2">🔒 Signing is locked</h2>
            <p className="text-sm text-amber-900">The lease can only be signed after the owner approves the move-in photos and videos. This protects both sides: you agree on the apartment&apos;s condition before committing.</p>
            <Link href={`/rentals/${r.id}/move-in`} className="btn-primary">Go to move-in</Link>
          </div>
        ) : !mine ? (
          <div className="card space-y-3">
            <h2 className="h2">Sign the lease</h2>
            <p className="text-sm text-gray-700">Your signature covers the lease details on this page and the sealed move-in record (seal <span className="mono">{r.movein_seal?.slice(0, 16)}…</span>).</p>
            <Form url={`/api/rentals/${r.id}/sign`} submitLabel="Sign lease">
              <div><label className="label">Type your full name</label><input name="name" required defaultValue={user.name} className="input" /></div>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="agree" required className="mt-1" /> I agree to the lease terms and confirm the approved move-in photos and videos show the apartment&apos;s condition at the start of the lease.</label>
            </Form>
          </div>
        ) : !r[`${other}_signed_at`] && (
          <div className="card flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">You signed. Waiting for the {other}.</p>
            <WhatsAppLink text={`I've signed the lease for "${r.name}" on Handover AI. Your turn: ${appUrl(`/rentals/${r.id}/lease`)}`} label="Remind on WhatsApp" />
          </div>
        )}
      </div>
    </div>
  );
}
