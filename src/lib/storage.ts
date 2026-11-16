import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, now, UPLOAD_DIR } from "./db";
import type { Media } from "./types";
import { detectMime } from "./formats";
import { makePreview } from "./preview";

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export function mediaKind(mime: string): Media["kind"] {
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

export function mediaPath(m: Pick<Media, "rental_id" | "stored_name">) {
  return path.join(UPLOAD_DIR, String(m.rental_id), m.stored_name);
}

/** Stream an uploaded file to disk while hashing it; return the inserted media row. */
export async function saveUpload(
  file: File,
  opts: { rentalId: number; context: Media["context"]; refId?: number | null; room?: string | null; title?: string | null; userId: number }
): Promise<Media> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is larger than 500 MB`);
  const dir = path.join(UPLOAD_DIR, String(opts.rentalId));
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8);
  const stored = `${crypto.randomUUID()}${ext}`;
  const hasher = crypto.createHash("sha256");
  const out = fs.createWriteStream(path.join(dir, stored), { flags: "wx" });
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hasher.update(value);
    if (!out.write(value)) await new Promise<void>((r) => out.once("drain", () => r()));
  }
  await new Promise<void>((res, rej) => out.end((err?: Error | null) => (err ? rej(err) : res())));
  fs.chmodSync(path.join(dir, stored), 0o444); // read-only on disk
  const mime = detectMime(file.name, file.type);
  const info = db()
    .prepare(
      `INSERT INTO media (rental_id, context, ref_id, room, title, kind, original_name, stored_name, mime, size, sha256, uploaded_by, uploaded_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(opts.rentalId, opts.context, opts.refId ?? null, opts.room ?? null, opts.title ?? null, mediaKind(mime), file.name.slice(0, 200), stored, mime, file.size, hasher.digest("hex"), opts.userId, now());
  const media = db().prepare("SELECT * FROM media WHERE id = ?").get(info.lastInsertRowid) as Media;
  if (media.kind === "photo") await makePreview(media); // quick: done before responding
  else if (media.kind === "video" || media.kind === "audio") {
    db().prepare("UPDATE media SET preview_status = 'processing' WHERE id = ?").run(media.id);
    void makePreview(media); // can take a while: runs in the background, page shows "processing"
  }
  return db().prepare("SELECT * FROM media WHERE id = ?").get(media.id) as Media;
}

export function hashFileOnDisk(m: Media): string | null {
  const p = mediaPath(m);
  if (!fs.existsSync(p)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}
