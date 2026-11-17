import { loadRental } from "@/lib/page";
import { getT } from "@/lib/i18n";
import { getUser } from "@/lib/auth";
import { mediaFor, moveInLocked } from "@/lib/rentals";
import { appUrl } from "@/lib/notify";
import { Form, UploadBox } from "@/components/client";
import { Badge, fmt, WhatsAppLink } from "@/components/ui";
import { InspectionRooms, ReportCard, RoomEditor, roomOptions } from "@/components/inspection";
import { roomsOf } from "@/lib/inspections";

export default async function MoveIn({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  const { user, rental: r, role, names } = await loadRental(id);
  const media = await mediaFor(r.id, "move_in");
  const locked = moveInLocked(r);
  const rooms = await roomsOf(r.id);
  const both = r.owner_id && r.tenant_id;
  const link = appUrl(`/rentals/${r.id}/move-in`);
  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">{t("Move-in condition")}</h2>
          {r.movein_status === "approved" ? <Badge tone="green">{t("Approved and sealed")}</Badge>
            : r.movein_status === "submitted" ? <Badge tone="amber">{t("Waiting for owner approval")}</Badge>
            : r.movein_status === "changes_requested" ? <Badge tone="red">{t("Owner asked for changes")}</Badge>
            : <Badge>{t("Open for uploads")}</Badge>}
        </div>
        <p className="muted">{t("Photograph and film every room, including walls, floors, appliances, windows and any existing marks. Each file is fingerprinted (SHA-256) and timestamped the moment it's uploaded, and both sides can see everything.")}</p>
        <p className="muted">{t("Then rate each item in the room-by-room checklist. The landlord's approval seals the photos and the ratings together.")}</p>
        {r.movein_status === "changes_requested" && r.movein_note && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800"><b>{t("Owner's note:")}</b> {r.movein_note}</p>}
        {r.movein_status === "approved" && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-900">
            {t("Approved by {name} on {date}. {n} files sealed.", { name: names.get(r.movein_approved_by ?? 0) ?? "", date: fmt(r.movein_approved_at), n: media.length })}
            <div className="mono mt-1">{t("Seal:")} {r.movein_seal}</div>
          </div>
        )}
      </div>

      {r.movein_status === "approved" && <ReportCard r={r} stage="move_in" />}

      {!locked && (
        <div className="card space-y-3">
          <h2 className="h2">{t("Add photos and videos")}</h2>
          <UploadBox rentalId={r.id} context="move_in" rooms={await roomOptions(rooms)} />
        </div>
      )}

      <RoomEditor r={r} rooms={rooms} userId={user.id} />
      <InspectionRooms r={r} stage="move_in" rooms={rooms} media={media} names={names} open={!locked} canDelete={(m) => !locked && m.uploaded_by === user.id} />
      {media.length === 0 && <p className="muted">{t("No move-in photos yet.")}</p>}

      {both && !locked && media.length > 0 && (
        <div className="card space-y-3">
          <h2 className="h2">{t("Send for approval")}</h2>
          <p className="muted">{t("Once submitted, uploads are paused until the owner approves or asks for more.")}</p>
          <Form url={`/api/rentals/${r.id}/movein`} submitLabel={t("Submit for owner approval")} extra={{ action: "submit" }}>
            <textarea name="note" rows={2} className="input" placeholder={t("Optional note, e.g. 'small scratch on kitchen counter already there'")} />
          </Form>
        </div>
      )}
      {!both && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t("You can start uploading now. Submitting for approval opens once both the owner and the tenant have joined.")}</p>}

      {r.movein_status === "submitted" && role === "owner" && (
        <div className="card space-y-4 border-amber-300">
          <h2 className="h2">{t("Your decision")}</h2>
          <p className="text-sm text-gray-700">{t("Approving seals these")} {media.length} {t("files as the agreed move-in condition. After that they can't be changed, and the lease can be signed.")}</p>
          <Form url={`/api/rentals/${r.id}/movein`} submitLabel={t("Approve and seal")} extra={{ action: "approve" }}>
            <input name="note" className="input" placeholder={t("Optional note")} />
          </Form>
          <hr />
          <Form url={`/api/rentals/${r.id}/movein`} submitLabel={t("Ask for more pictures")} buttonClass="btn-secondary" extra={{ action: "request_changes" }}>
            <textarea name="note" rows={2} required className="input" placeholder={t("What's missing? e.g. 'Please add close-ups of the bathroom tiles'")} />
          </Form>
        </div>
      )}
      {r.movein_status === "submitted" && role === "tenant" && (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">{t("Waiting for")} {names.get(r.owner_id ?? 0) ?? "the owner"} {t("to approve. They've been emailed.")}</p>
          <WhatsAppLink text={`Hi, I've uploaded the move-in photos for "${r.name}" on Handover AI. Please review and approve them so we can sign the lease: ${link}`} label={t("Remind on WhatsApp")} phone={(await getUser(r.owner_id))?.phone} />
        </div>
      )}
    </div>
  );
}
