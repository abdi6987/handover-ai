import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import { db } from "./db";
import { BROWSER_IMAGE } from "./formats";
import { blobs, tempPath } from "./blobstore";
import { mediaKey } from "./storage";
import type { Media } from "./types";

const run = promisify(execFile);

async function heicToJpeg(src: string, out: string) {
  const convert = (await import("heic-convert")).default as (o: { buffer: Buffer; format: "JPEG"; quality: number }) => Promise<ArrayBuffer>;
  const jpg = await convert({ buffer: fs.readFileSync(src), format: "JPEG", quality: 0.85 });
  fs.writeFileSync(out, Buffer.from(jpg));
}

async function imageToJpeg(m: Media, src: string, out: string) {
  const attempts: (() => Promise<unknown>)[] = [];
  if (/hei[cf]/.test(m.mime)) attempts.push(() => heicToJpeg(src, out));
  attempts.push(() => run("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-frames:v", "1", "-vf", "scale='min(2560,iw)':-2", "-q:v", "3", out]));
  attempts.push(() => run("convert", [`${src}[0]`, "-auto-orient", "-resize", "2560x2560>", "-quality", "85", out])); // ImageMagick, for RAW/TIFF etc.
  for (const a of attempts) {
    try { await a(); if (fs.existsSync(out) && fs.statSync(out).size > 0) return true; } catch { /* try the next converter */ }
  }
  return false;
}

async function needsVideoTranscode(src: string, mime: string) {
  if (mime !== "video/mp4" && mime !== "video/webm") return true;
  try {
    const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,pix_fmt", "-of", "csv=p=0", src]);
    const [codec, pix] = stdout.trim().split(",");
    return !(["h264", "vp8", "vp9", "av1"].includes(codec) && (!pix || pix === "yuv420p"));
  } catch { return true; }
}

async function videoToMp4(src: string, out: string) {
  const tmp = out + ".part.mp4";
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale='min(1280,iw)':-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", tmp], { timeout: 15 * 60 * 1000 });
  fs.renameSync(tmp, out);
}

const previewKey = (m: Pick<Media, "rental_id">, name: string) => `${m.rental_id}/previews/${name}`;

/** Store a finished preview and record it on the media row. */
async function savePreview(m: Media, out: string, ext: string, mime: string) {
  const name = `${m.id}${ext}`;
  const store = blobs();
  if (!(await store.info(previewKey(m, name)))) await store.put(previewKey(m, name), out, mime);
  await db().run("UPDATE media SET preview_name = ?, preview_mime = ?, preview_status = 'ready' WHERE id = ?", name, mime, m.id);
}

/**
 * Make a browser-friendly copy of photos/videos in formats browsers can't show (HEIC, MOV/HEVC, AVI, MKV, RAW...).
 * The original file stays untouched as the fingerprinted proof; the preview is only for viewing and AI analysis.
 * Safe to run twice for the same file (a retried job just finds the preview already there).
 */
export async function makePreview(m: Media) {
  const d = db();
  const none = () => d.run("UPDATE media SET preview_status = 'none' WHERE id = ?", m.id);
  if (m.kind === "photo" && BROWSER_IMAGE.has(m.mime)) return void (await none());
  if (m.kind === "audio" && ["audio/mp4", "audio/mpeg", "audio/aac", "audio/wav"].includes(m.mime)) return void (await none());
  if (m.kind === "file") return void (await none());
  const src = await blobs().localCopy(mediaKey(m));
  const ext = m.kind === "photo" ? ".jpg" : m.kind === "audio" ? ".m4a" : ".mp4";
  const out = tempPath(ext);
  try {
    if (m.kind === "photo") {
      if (await imageToJpeg(m, src.path, out)) await savePreview(m, out, ".jpg", "image/jpeg");
      else await d.run("UPDATE media SET preview_status = 'failed' WHERE id = ?", m.id);
    } else if (m.kind === "audio") {
      await run("ffmpeg", ["-y", "-loglevel", "error", "-i", src.path, "-vn", "-c:a", "aac", "-b:a", "96k", out]);
      await savePreview(m, out, ".m4a", "audio/mp4");
    } else if (m.kind === "video") {
      if (!(await needsVideoTranscode(src.path, m.mime))) return void (await none());
      await d.run("UPDATE media SET preview_status = 'processing' WHERE id = ?", m.id);
      await videoToMp4(src.path, out);
      await savePreview(m, out, ".mp4", "video/mp4");
    }
  } catch (e) {
    console.warn("preview failed", m.id, e);
    await d.run("UPDATE media SET preview_status = 'failed' WHERE id = ?", m.id);
    throw e; // let the job queue retry
  } finally {
    src.done();
    fs.rmSync(out, { force: true });
  }
}

/** Storage key of the browser-friendly copy, if there is one. */
export function previewFile(m: Pick<Media, "rental_id"> & { preview_name?: string | null }) {
  return m.preview_name ? previewKey(m, m.preview_name) : null;
}
