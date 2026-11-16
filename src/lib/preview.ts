import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { db, UPLOAD_DIR } from "./db";
import { BROWSER_IMAGE } from "./formats";
import { mediaPath } from "./storage";
import type { Media } from "./types";

const run = promisify(execFile);

function previewPath(m: Media, ext: string) {
  return path.join(UPLOAD_DIR, String(m.rental_id), "previews", `${m.id}${ext}`);
}

async function heicToJpeg(src: string, out: string) {
  const convert = (await import("heic-convert")).default as (o: { buffer: Buffer; format: "JPEG"; quality: number }) => Promise<ArrayBuffer>;
  const jpg = await convert({ buffer: fs.readFileSync(src), format: "JPEG", quality: 0.85 });
  fs.writeFileSync(out, Buffer.from(jpg));
}

async function imageToJpeg(m: Media, out: string) {
  const src = mediaPath(m);
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

async function videoToMp4(m: Media, out: string) {
  const tmp = out + ".part.mp4";
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", mediaPath(m), "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale='min(1280,iw)':-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", tmp], { timeout: 15 * 60 * 1000 });
  fs.renameSync(tmp, out);
}

/**
 * Make a browser-friendly copy of photos/videos in formats browsers can't show (HEIC, MOV/HEVC, AVI, MKV, RAW...).
 * The original file stays untouched as the fingerprinted proof; the preview is only for viewing and AI analysis.
 */
export async function makePreview(m: Media) {
  const d = db();
  try {
    if (m.kind === "photo") {
      if (BROWSER_IMAGE.has(m.mime)) return await d.prepare("UPDATE media SET preview_status = 'none' WHERE id = ?").run(m.id);
      const out = previewPath(m, ".jpg");
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const ok = await imageToJpeg(m, out);
      await d.prepare("UPDATE media SET preview_name = ?, preview_mime = ?, preview_status = ? WHERE id = ?").run(ok ? path.basename(out) : null, ok ? "image/jpeg" : null, ok ? "ready" : "failed", m.id);
    } else if (m.kind === "audio") {
      if (["audio/mp4", "audio/mpeg", "audio/aac", "audio/wav"].includes(m.mime)) return await d.prepare("UPDATE media SET preview_status = 'none' WHERE id = ?").run(m.id);
      const out = previewPath(m, ".m4a");
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await run("ffmpeg", ["-y", "-loglevel", "error", "-i", mediaPath(m), "-vn", "-c:a", "aac", "-b:a", "96k", out]);
      await d.prepare("UPDATE media SET preview_name = ?, preview_mime = 'audio/mp4', preview_status = 'ready' WHERE id = ?").run(path.basename(out), m.id);
    } else if (m.kind === "video") {
      if (!(await needsVideoTranscode(mediaPath(m), m.mime))) return await d.prepare("UPDATE media SET preview_status = 'none' WHERE id = ?").run(m.id);
      const out = previewPath(m, ".mp4");
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await d.prepare("UPDATE media SET preview_status = 'processing' WHERE id = ?").run(m.id);
      await videoToMp4(m, out);
      await d.prepare("UPDATE media SET preview_name = ?, preview_mime = 'video/mp4', preview_status = 'ready' WHERE id = ?").run(path.basename(out), m.id);
    }
  } catch (e) {
    console.warn("preview failed", m.id, e);
    await d.prepare("UPDATE media SET preview_status = 'failed' WHERE id = ?").run(m.id);
  }
}

export function previewFile(m: Media & { preview_name?: string | null }) {
  return m.preview_name ? path.join(UPLOAD_DIR, String(m.rental_id), "previews", m.preview_name) : null;
}
