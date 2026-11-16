import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, now } from "./db";
import { blobs, tempPath } from "./blobstore";
import { enqueue } from "./jobs";
import type { Media } from "./types";
import { HttpError } from "./rentals";
import { detectMime } from "./formats";
import { makePreview } from "./preview";

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export function mediaKind(mime: string): Media["kind"] {
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

/** Storage key of the original upload. */
export function mediaKey(m: Pick<Media, "rental_id" | "stored_name">) {
  return `${m.rental_id}/${m.stored_name}`;
}

/** A file from a form: either sent in the request, or uploaded by the browser straight to Cloud Storage first. */
export type Upload = { name: string; type: string; size: number; file?: File; staged?: { token: string; key: string } };

/** Read uploaded files from a form field. "staged:<token>" values refer to direct uploads made by this user. */
export async function formUploads(form: FormData, field: string, userId: number): Promise<Upload[]> {
  const out: Upload[] = [];
  for (const v of form.getAll(field)) {
    if (v instanceof File) {
      if (v.size > 0) out.push({ name: v.name, type: v.type, size: v.size, file: v });
    } else if (typeof v === "string" && v.startsWith("staged:")) {
      const token = v.slice(7);
      const row = (await db().get("SELECT * FROM staged_uploads WHERE token = ? AND user_id = ? AND used_at IS NULL", token, userId)) as { key: string; name: string; mime: string; size: number } | undefined;
      if (!row) throw new HttpError(400, "That upload has expired. Please choose the file again.");
      out.push({ name: row.name, type: row.mime, size: Number(row.size), staged: { token, key: row.key } });
    }
  }
  return out;
}

async function hashStream(stream: AsyncIterable<Buffer | Uint8Array>, sink?: (c: Uint8Array) => Promise<void>) {
  const sha = crypto.createHash("sha256"), md5 = crypto.createHash("md5");
  let size = 0;
  for await (const c of stream) {
    sha.update(c); md5.update(c); size += c.length;
    if (sink) await sink(c);
  }
  return { sha256: sha.digest("hex"), md5: md5.digest("base64"), size };
}

/** Fingerprint and store an upload, and return the inserted media row. */
export async function saveUpload(
  file: Upload | File,
  opts: { rentalId: number; context: Media["context"]; refId?: number | null; room?: string | null; title?: string | null; userId: number }
): Promise<Media> {
  const up: Upload = file instanceof File ? { name: file.name, type: file.type, size: file.size, file } : file;
  if (up.size > MAX_UPLOAD_BYTES) throw new Error(`${up.name} is larger than 500 MB`);
  const ext = path.extname(up.name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8);
  const stored = `${crypto.randomUUID()}${ext}`;
  const key = mediaKey({ rental_id: opts.rentalId, stored_name: stored });
  const mime = detectMime(up.name, up.type);
  const store = blobs();
  let hashes: { sha256: string; md5: string; size: number };
  if (up.staged) {
    // Claim the staged file first so it can't be attached twice.
    const claimed = await db().run("UPDATE staged_uploads SET used_at = now() WHERE token = ? AND used_at IS NULL", up.staged.token);
    if (!claimed.changes) throw new HttpError(400, "That upload was already used.");
    const info = await store.info(up.staged.key);
    if (!info || info.size !== up.size) throw new HttpError(400, `${up.name} didn't finish uploading. Please try again.`);
    hashes = await hashStream(await store.read(up.staged.key)); // read inside Google's network: fast
    await store.move(up.staged.key, key, { sha256: hashes.sha256 });
  } else {
    const tmp = tempPath(ext);
    try {
      const out = fs.createWriteStream(tmp, { flags: "wx" });
      hashes = await hashStream(up.file!.stream() as unknown as AsyncIterable<Uint8Array>, async (c) => {
        if (!out.write(c)) await new Promise<void>((r) => out.once("drain", () => r()));
      });
      await new Promise<void>((res, rej) => out.end((err?: Error | null) => (err ? rej(err) : res())));
      await store.put(key, tmp, mime, { sha256: hashes.sha256 });
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  const kind = mediaKind(mime);
  const needsWork = kind === "photo" || kind === "video" || kind === "audio";
  const info = await db().run(
    `INSERT INTO media (rental_id, context, ref_id, room, title, kind, original_name, stored_name, mime, size, sha256, md5, uploaded_by, uploaded_at, preview_status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    opts.rentalId, opts.context, opts.refId ?? null, opts.room ?? null, opts.title ?? null, kind, up.name.slice(0, 200), stored, mime, hashes.size, hashes.sha256, hashes.md5, opts.userId, now(), needsWork ? "processing" : null,
  );
  const media = (await db().get("SELECT * FROM media WHERE id = ?", info.lastInsertRowid)) as Media;
  if (kind === "photo") await makePreview(media).catch(() => {}); // quick: done before responding
  else if (needsWork) await enqueue("preview", { mediaId: media.id }); // can take minutes: the page shows "processing"
  return (await db().get("SELECT * FROM media WHERE id = ?", media.id)) as Media;
}

/**
 * Is the stored original still byte-for-byte what was uploaded?
 * Local disk: re-hash the file. Cloud Storage: compare the store's own MD5 and size with what we recorded at upload
 * (the bucket's retention policy stops anyone replacing an object, so this catches missing or swapped files cheaply).
 */
export async function storedFileIntact(m: Media): Promise<boolean> {
  const store = blobs();
  if (store.kind === "local") {
    const f = await store.localCopy(mediaKey(m));
    try {
      if (!fs.existsSync(f.path)) return false;
      const h = crypto.createHash("sha256");
      await new Promise<void>((res, rej) => fs.createReadStream(f.path).on("data", (c) => h.update(c)).on("error", rej).on("end", () => res()));
      return h.digest("hex") === m.sha256;
    } finally { f.done(); }
  }
  const info = await store.info(mediaKey(m));
  return !!info && info.size === Number(m.size) && !!m.md5 && info.md5 === m.md5;
}
