import { bad, handler, str } from "@/lib/api";
import { audit } from "@/lib/audit";
import { fullySigned, moveInLocked, rentalForUser } from "@/lib/rentals";
import { saveUpload } from "@/lib/storage";
import type { Media } from "@/lib/types";

export const POST = handler(async (req, user, p) => {
  const { rental } = rentalForUser(Number(p.id), user);
  const form = await req.formData();
  const context = str(form.get("context")) as Media["context"];
  const room = str(form.get("room"), 60) || null;
  const title = str(form.get("title"), 150) || null;
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) bad("Choose at least one file");
  if (context === "move_in") {
    if (moveInLocked(rental)) bad(rental.movein_status === "approved" ? "Move-in media is sealed and can't be changed" : "Move-in media is waiting for approval. The owner can ask for more pictures.");
    if (!room) bad("Pick a room");
  } else if (context === "move_out") {
    if (!fullySigned(rental)) bad("Move-out pictures can be added once the lease is signed");
    if (rental.ended_at) bad("This rental is closed");
    if (!room) bad("Pick a room");
  } else if (context === "document") {
    if (!title && files.length === 1) bad("Give the document a title");
  } else bad("Unknown upload type");
  for (const f of files) {
    if (context !== "document" && !/^(image|video)\//.test(f.type)) bad(`${f.name} is not a photo or video`);
  }
  const saved = [];
  for (const f of files) {
    const m = await saveUpload(f, { rentalId: rental.id, context, room, title: title ?? f.name, userId: user.id });
    audit(rental.id, user.id, `media.uploaded`, { media_id: m.id, context, room, name: m.original_name, sha256: m.sha256, size: m.size });
    saved.push(m.id);
  }
  return { ids: saved };
});
