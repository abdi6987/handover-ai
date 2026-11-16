import { Readable } from "node:stream";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRental, roleOf } from "@/lib/rentals";
import { mediaKey } from "@/lib/storage";
import { blobs } from "@/lib/blobstore";
import { issueAccess } from "@/lib/staff";
import { previewFile } from "@/lib/preview";
import type { Media } from "@/lib/types";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Please log in", { status: 401 });
  const m = await db().prepare("SELECT * FROM media WHERE id = ?").get(Number((await ctx.params).id)) as Media | undefined;
  if (!m) return new Response("Not found", { status: 404 });
  const r = (await getRental(m.rental_id))!;
  let role: string | null = roleOf(r, user);
  if (!role && m.context === "issue" && m.ref_id) {
    try { role = (await issueAccess(m.ref_id, user)).role; } catch { role = null; }
  }
  if (!role || (m.context === "bill" && role !== "tenant")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const pv = url.searchParams.has("preview") ? previewFile(m) : null;
  const store = blobs();
  const key = pv && (await store.info(pv)) ? pv : mediaKey(m);
  const isPreview = key === pv;
  const mime = isPreview ? m.preview_mime! : m.mime;
  const download = url.searchParams.has("download");
  // Cloud Storage: hand the browser a 15-minute signed link so big videos never stream through the app server.
  const signed = await store.signedUrl(key, { contentType: mime, filename: m.original_name, download });
  if (signed) return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "private, no-store" } });
  const info = await store.info(key);
  if (!info) return new Response("File missing", { status: 410 });
  const size = info.size;
  const headers: Record<string, string> = {
    "Content-Type": mime, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600",
    ...(isPreview ? {} : { "X-Content-SHA256": m.sha256 }),
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(m.original_name)}"`,
  };
  const range = req.headers.get("range");
  const match = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (match) {
    let start = match[1] ? Number(match[1]) : size - Number(match[2]);
    let end = match[1] && match[2] ? Number(match[2]) : size - 1;
    start = Math.max(0, start); end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = await store.read(key, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(await store.read(key)) as ReadableStream, { headers: { ...headers, "Content-Length": String(size) } });
}
