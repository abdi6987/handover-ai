import fs from "node:fs";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRental, roleOf } from "@/lib/rentals";
import { mediaPath } from "@/lib/storage";
import type { Media } from "@/lib/types";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Please log in", { status: 401 });
  const m = db().prepare("SELECT * FROM media WHERE id = ?").get(Number((await ctx.params).id)) as Media | undefined;
  if (!m) return new Response("Not found", { status: 404 });
  const r = getRental(m.rental_id)!;
  const role = roleOf(r, user);
  if (!role || (m.context === "bill" && role !== "tenant")) return new Response("Forbidden", { status: 403 });
  const p = mediaPath(m);
  if (!fs.existsSync(p)) return new Response("File missing", { status: 410 });
  const size = fs.statSync(p).size;
  const download = new URL(req.url).searchParams.has("download");
  const headers: Record<string, string> = {
    "Content-Type": m.mime, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600",
    "X-Content-SHA256": m.sha256,
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(m.original_name)}"`,
  };
  const range = req.headers.get("range");
  const match = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (match) {
    let start = match[1] ? Number(match[1]) : size - Number(match[2]);
    let end = match[1] && match[2] ? Number(match[2]) : size - 1;
    start = Math.max(0, start); end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = fs.createReadStream(p, { start, end });
    return new Response(stream as unknown as ReadableStream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(fs.createReadStream(p) as unknown as ReadableStream, { headers: { ...headers, "Content-Length": String(size) } });
}
