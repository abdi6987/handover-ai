import { loadRental } from "@/lib/page";
import { mediaFor, moveInLocked } from "@/lib/rentals";
import { appUrl } from "@/lib/notify";
import { Form, UploadBox } from "@/components/client";
import { Badge, fmt, groupByRoom, MediaGrid, WhatsAppLink } from "@/components/ui";
import { ROOMS } from "@/lib/types";

export default async function MoveIn({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, rental: r, role, names } = await loadRental(id);
  const media = mediaFor(r.id, "move_in");
  const locked = moveInLocked(r);
  const byRoom = groupByRoom(media);
  const both = r.owner_id && r.tenant_id;
  const link = appUrl(`/rentals/${r.id}/move-in`);
  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">Move-in condition</h2>
          {r.movein_status === "approved" ? <Badge tone="green">Approved and sealed</Badge>
            : r.movein_status === "submitted" ? <Badge tone="amber">Waiting for owner approval</Badge>
            : r.movein_status === "changes_requested" ? <Badge tone="red">Owner asked for changes</Badge>
            : <Badge>Open for uploads</Badge>}
        </div>
        <p className="muted">Photograph and film every room, including walls, floors, appliances, windows and any existing marks. Each file is fingerprinted (SHA-256) and timestamped the moment it&apos;s uploaded, and both sides can see everything.</p>
        {r.movein_status === "changes_requested" && r.movein_note && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800"><b>Owner&apos;s note:</b> {r.movein_note}</p>}
        {r.movein_status === "approved" && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-900">
            Approved by {names.get(r.movein_approved_by ?? 0)} on {fmt(r.movein_approved_at)}. {media.length} files sealed.
            <div className="mono mt-1">Seal: {r.movein_seal}</div>
          </div>
        )}
      </div>

      {!locked && (
        <div className="card space-y-3">
          <h2 className="h2">Add photos and videos</h2>
          <UploadBox rentalId={r.id} context="move_in" rooms={ROOMS} />
        </div>
      )}

      {[...byRoom.entries()].map(([room, items]) => (
        <div key={room} className="card space-y-3">
          <h3 className="font-semibold">{room} <span className="muted">({items.length})</span></h3>
          <MediaGrid media={items} names={names} canDelete={(m) => !locked && m.uploaded_by === user.id} />
        </div>
      ))}
      {media.length === 0 && <p className="muted">No move-in photos yet.</p>}

      {both && !locked && media.length > 0 && (
        <div className="card space-y-3">
          <h2 className="h2">Send for approval</h2>
          <p className="muted">Once submitted, uploads are paused until the owner approves or asks for more.</p>
          <Form url={`/api/rentals/${r.id}/movein`} submitLabel="Submit for owner approval" extra={{ action: "submit" }}>
            <textarea name="note" rows={2} className="input" placeholder="Optional note, e.g. 'small scratch on kitchen counter already there'" />
          </Form>
        </div>
      )}
      {!both && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">You can start uploading now. Submitting for approval opens once both the owner and the tenant have joined.</p>}

      {r.movein_status === "submitted" && role === "owner" && (
        <div className="card space-y-4 border-amber-300">
          <h2 className="h2">Your decision</h2>
          <p className="text-sm text-gray-700">Approving seals these {media.length} files as the agreed move-in condition. After that they can&apos;t be changed, and the lease can be signed.</p>
          <Form url={`/api/rentals/${r.id}/movein`} submitLabel="Approve and seal" extra={{ action: "approve" }}>
            <input name="note" className="input" placeholder="Optional note" />
          </Form>
          <hr />
          <Form url={`/api/rentals/${r.id}/movein`} submitLabel="Ask for more pictures" buttonClass="btn-secondary" extra={{ action: "request_changes" }}>
            <textarea name="note" rows={2} required className="input" placeholder="What's missing? e.g. 'Please add close-ups of the bathroom tiles'" />
          </Form>
        </div>
      )}
      {r.movein_status === "submitted" && role === "tenant" && (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">Waiting for {names.get(r.owner_id ?? 0) ?? "the owner"} to approve. They&apos;ve been emailed.</p>
          <WhatsAppLink text={`Hi, I've uploaded the move-in photos for "${r.name}" on Handover AI. Please review and approve them so we can sign the lease: ${link}`} label="Remind on WhatsApp" />
        </div>
      )}
    </div>
  );
}
