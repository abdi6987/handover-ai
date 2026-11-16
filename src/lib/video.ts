import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { CACHE_DIR } from "./db";
import { mediaPath } from "./storage";
import type { Media } from "./types";
import { previewFile } from "./preview";

const run = promisify(execFile);
const FIT = "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'";

export type Frame = { mediaId: number; t: number | null; jpegPath: string };

/** Normalise a photo to a <=1280px JPEG (keeps API requests small, handles PNG/WebP etc.). */
async function photoFrame(m: Media): Promise<Frame> {
  const out = path.join(CACHE_DIR, `${m.sha256}.jpg`);
  if (!fs.existsSync(out)) await run("ffmpeg", ["-y", "-loglevel", "error", "-i", previewFile(m) ?? mediaPath(m), "-vf", FIT, "-frames:v", "1", "-q:v", "4", out]);
  return { mediaId: m.id, t: null, jpegPath: out };
}

/** Pull `count` evenly spaced frames from a video. */
async function videoFrames(m: Media, count: number): Promise<Frame[]> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mediaPath(m)]);
  const duration = Math.max(0.1, parseFloat(stdout) || 1);
  const frames: Frame[] = [];
  for (let k = 1; k <= count; k++) {
    const t = Math.round(((duration * k) / (count + 1)) * 10) / 10;
    const out = path.join(CACHE_DIR, `${m.sha256}-${t}.jpg`);
    if (!fs.existsSync(out)) await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(t), "-i", mediaPath(m), "-frames:v", "1", "-vf", FIT, "-q:v", "4", out]);
    if (fs.existsSync(out)) frames.push({ mediaId: m.id, t, jpegPath: out });
  }
  return frames;
}

/** Turn a mix of photos and videos into at most `max` still images. */
export async function framesFor(media: Media[], max = 10): Promise<Frame[]> {
  const photos = media.filter((m) => m.kind === "photo");
  const videos = media.filter((m) => m.kind === "video");
  const frames: Frame[] = [];
  for (const p of photos.slice(0, max)) {
    try { frames.push(await photoFrame(p)); } catch (e) { console.warn("photo decode failed", p.id, e); }
  }
  const remaining = max - frames.length;
  if (videos.length && remaining > 0) {
    const per = Math.max(1, Math.min(5, Math.floor(remaining / videos.length)));
    for (const v of videos) {
      if (frames.length >= max) break;
      try { frames.push(...(await videoFrames(v, Math.min(per, max - frames.length)))); } catch (e) { console.warn("video decode failed", v.id, e); }
    }
  }
  return frames;
}
