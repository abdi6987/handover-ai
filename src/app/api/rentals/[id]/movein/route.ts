import { bad, handler, str } from "@/lib/api";
import { audit } from "@/lib/audit";
import { db, now } from "@/lib/db";
import { buildManifest, mediaFor, rentalForUser, sealOf } from "@/lib/rentals";
import { notifyUser } from "@/lib/notify";

export const POST = handler(async (req, user, p) => {
  const { rental, role } = rentalForUser(Number(p.id), user);
  const b = await req.json();
  const action = str(b.action), note = str(b.note, 2000) || null;
  const media = mediaFor(rental.id, "move_in");
  const path = `/rentals/${rental.id}/move-in`;
  if (!rental.owner_id || !rental.tenant_id) bad("Both owner and tenant need to join first");

  if (action === "submit") {
    if (!["open", "changes_requested"].includes(rental.movein_status)) bad("Already submitted");
    if (!media.length) bad("Add photos or videos first");
    db().prepare("UPDATE rentals SET movein_status = 'submitted', movein_note = ? WHERE id = ?").run(note, rental.id);
    audit(rental.id, user.id, "movein.submitted", { files: media.length, note });
    if (role === "tenant")
      await notifyUser(rental.owner_id, `Move-in photos ready for approval: "${rental.name}"`, `${user.name} submitted ${media.length} move-in photos/videos. Review and approve them so the lease can be signed.${note ? `\n\nNote: ${note}` : ""}`, path);
    else
      await notifyUser(rental.tenant_id, `Move-in photos submitted: "${rental.name}"`, `${user.name} submitted the move-in photos/videos for approval.`, path);
    return;
  }
  if (role !== "owner") bad("Only the owner can approve or ask for changes");
  if (rental.movein_status !== "submitted") bad("Move-in media hasn't been submitted for approval");

  if (action === "request_changes") {
    if (!note) bad("Tell the tenant what's missing");
    db().prepare("UPDATE rentals SET movein_status = 'changes_requested', movein_note = ? WHERE id = ?").run(note, rental.id);
    audit(rental.id, user.id, "movein.changes_requested", { note });
    await notifyUser(rental.tenant_id, `More move-in pictures needed: "${rental.name}"`, `${user.name} asked for changes before approving:\n\n${note}`, path);
    return;
  }
  if (action === "approve") {
    const at = now();
    const manifest = buildManifest(rental, media);
    const seal = sealOf(manifest, at, user.id);
    db().prepare("UPDATE rentals SET movein_status='approved', movein_seal=?, movein_manifest=?, movein_approved_at=?, movein_approved_by=?, movein_note=? WHERE id=?")
      .run(seal, JSON.stringify(manifest), at, user.id, note, rental.id);
    audit(rental.id, user.id, "movein.approved", { seal, files: media.length });
    await notifyUser(rental.tenant_id, `Move-in photos approved: "${rental.name}"`, `${user.name} approved the move-in photos and videos. They're now sealed as proof of the apartment's condition, and the lease is ready to sign.`, `/rentals/${rental.id}/lease`);
    return { seal };
  }
  bad("Unknown action");
});
