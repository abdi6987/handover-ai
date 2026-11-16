import Link from "next/link";
import { loadRental } from "@/lib/page";
import { fullySigned, issuesFor, mediaFor } from "@/lib/rentals";
import { InviteBox } from "@/components/client";
import { Badge, fmt, fmtMoney } from "@/components/ui";
import { ISSUE_STATUS, ISSUE_TYPES } from "@/lib/types";

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rental: r, role, names } = await loadRental(id);
  const base = `/rentals/${r.id}`;
  const other = role === "owner" ? "tenant" : "owner";
  const otherId = role === "owner" ? r.tenant_id : r.owner_id;
  const moveIn = mediaFor(r.id, "move_in");
  const issues = issuesFor(r.id);
  const mySigned = !!r[`${role}_signed_at`];

  let next: { title: string; text: string; href: string; cta: string } | null = null;
  if (!otherId) next = null;
  else if (r.movein_status === "open" || r.movein_status === "changes_requested")
    next = { title: r.movein_status === "changes_requested" ? "The owner asked for more move-in pictures" : "Record the move-in condition", text: r.movein_status === "changes_requested" ? r.movein_note ?? "" : "Add photos and videos of every room, then submit them to the owner for approval.", href: `${base}/move-in`, cta: "Go to move-in" };
  else if (r.movein_status === "submitted")
    next = role === "owner"
      ? { title: "Review the move-in photos", text: `${moveIn.length} photos/videos are waiting for your approval. The lease can only be signed after you approve.`, href: `${base}/move-in`, cta: "Review and approve" }
      : { title: "Waiting for the owner's approval", text: "The owner is reviewing your move-in photos. You'll get an email when they approve.", href: `${base}/move-in`, cta: "View move-in" };
  else if (!fullySigned(r))
    next = mySigned ? { title: `Waiting for the ${other} to sign`, text: "You've signed. The lease becomes active once both sides sign.", href: `${base}/lease`, cta: "View lease" }
      : { title: "Sign the lease", text: "The move-in photos are approved and sealed. You can now sign.", href: `${base}/lease`, cta: "Sign the lease" };
  else if (!r.ended_at)
    next = { title: "Lease is active", text: "Report any repair, breakage or wear and tear as it happens. At the end, add move-out photos for the AI comparison.", href: `${base}/issues`, cta: "Report an issue" };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {!otherId && (
          <div className="card space-y-3">
            <h2 className="h2">Invite the {other}</h2>
            <p className="muted">Send them an invite by email or WhatsApp. Once they join, you can start the move-in inspection together.</p>
            <InviteBox rentalId={r.id} other={other} />
          </div>
        )}
        {next && (
          <div className="card border-brand-600/30 bg-brand-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Next step</p>
            <h2 className="h2 mt-1">{next.title}</h2>
            {next.text && <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{next.text}</p>}
            <Link href={next.href} className="btn-primary mt-3">{next.cta}</Link>
          </div>
        )}
        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="h2">Recent issues</h2>
            <Link href={`${base}/issues`} className="text-sm font-semibold text-brand-700">All →</Link>
          </div>
          {issues.length === 0 ? <p className="muted mt-2">Nothing reported yet.</p> : (
            <ul className="mt-2 divide-y divide-gray-100">
              {issues.slice(0, 5).map((i) => (
                <li key={i.id} className="py-2">
                  <Link href={`${base}/issues/${i.id}`} className="flex items-center justify-between gap-2">
                    <span><span className="font-medium">{i.title}</span><span className="muted"> · {ISSUE_TYPES[i.type]}{i.room ? ` · ${i.room}` : ""}</span></span>
                    <Badge tone={i.status === "done" ? "green" : i.status === "disputed" ? "red" : "amber"}>{ISSUE_STATUS[i.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="card h-fit space-y-2 text-sm">
        <h2 className="h2">Details</h2>
        <p><span className="text-gray-500">Owner:</span> {names.get(r.owner_id ?? 0) ?? "not joined yet"}</p>
        <p><span className="text-gray-500">Tenant:</span> {names.get(r.tenant_id ?? 0) ?? "not joined yet"}</p>
        <p><span className="text-gray-500">Rent:</span> {fmtMoney(r.rent, r.currency)} / month</p>
        <p><span className="text-gray-500">Deposit:</span> {fmtMoney(r.deposit, r.currency)}</p>
        <p><span className="text-gray-500">Period:</span> {fmt(r.start_date, false) || "?"} – {fmt(r.end_date, false) || "?"}</p>
        <p><span className="text-gray-500">Move-in media:</span> {moveIn.length} files {r.movein_status === "approved" && <Badge tone="green">sealed</Badge>}</p>
        <Link href={`${base}/proof`} className="btn-secondary mt-2 w-full">Proof report</Link>
      </div>
    </div>
  );
}
