import Link from "next/link";
import { loadRental } from "@/lib/page";
import { rentalAudit } from "@/lib/audit";
import { fmt } from "@/components/ui";

const LABELS: Record<string, string> = {
  "rental.created": "created the rental", "invite.created": "sent an invite", "invite.accepted": "joined the rental",
  "media.uploaded": "uploaded a file", "media.removed": "removed a file", "movein.submitted": "submitted move-in media for approval",
  "movein.changes_requested": "asked for more move-in pictures", "movein.approved": "approved and sealed the move-in media",
  "lease.edited": "edited the lease details", "lease.signed": "signed the lease", "issue.reported": "reported an issue",
  "issue.comment": "commented on an issue", "issue.status": "changed an issue's status", "issue.confirm": "confirmed a fix",
  "comparison.started": "started the AI comparison", "comparison.completed": "AI comparison finished", "comparison.failed": "AI comparison failed",
  "comparison_item.agree": "agreed with an AI finding", "comparison_item.dispute": "disputed an AI finding", "rental.closed": "closed the rental", "issue.assigned": "assigned an issue to staff",
};

function detail(action: string, d: Record<string, unknown>) {
  if (action === "media.uploaded" || action === "media.removed") return `${d.context === "move_in" ? "Move-in" : d.context === "move_out" ? "Move-out" : d.context === "issue" ? "Issue" : "Document"}${d.room ? ` · ${d.room}` : ""} · ${d.name}`;
  if (action === "issue.assigned") return d.staff ? `→ ${d.staff}` : "unassigned";
  if (action === "issue.reported") return `${d.title}${d.room ? ` (${d.room})` : ""}`;
  if (action === "issue.status") return `→ ${d.status}${d.body ? `: ${d.body}` : ""}`;
  if (action.startsWith("issue.")) return String(d.body ?? "");
  if (action === "movein.approved") return `${d.files} files · seal ${String(d.seal).slice(0, 16)}…`;
  if (action === "movein.changes_requested") return String(d.note ?? "");
  if (action === "lease.signed") return `as "${d.name}"`;
  if (action === "comparison.completed") return `${d.findings} finding(s)`;
  if (action.startsWith("comparison_item")) return `${d.title}${d.note ? `: ${d.note}` : ""}`;
  return "";
}

export default async function Timeline({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { rental: r } = await loadRental(id);
  const rows = rentalAudit(r.id);
  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">Timeline</h2>
        <Link href={`/rentals/${r.id}/proof`} className="btn-secondary">Verify proof</Link>
      </div>
      <p className="muted">Every action is recorded with a timestamp and chained to the previous entry with a SHA-256 hash, so editing or deleting history is detectable.</p>
      <ol className="space-y-3 border-l-2 border-gray-200 pl-4">
        {rows.map((a) => {
          const d = JSON.parse(a.details) as Record<string, unknown>;
          const text = detail(a.action, d);
          return (
            <li key={a.id} className="text-sm">
              <p><span className="font-medium">{a.actor_name ?? "System"}</span> {LABELS[a.action] ?? a.action}</p>
              {text && <p className="text-gray-600">{text}</p>}
              <p className="text-xs text-gray-400">{fmt(a.created_at)} · <span className="font-mono">#{a.hash.slice(0, 10)}</span></p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
