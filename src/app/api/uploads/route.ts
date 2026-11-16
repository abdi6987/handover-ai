import crypto from "node:crypto";
import { bad, handler, num, str } from "@/lib/api";
import { blobs } from "@/lib/blobstore";
import { db } from "@/lib/db";
import { hit, LIMITS, tooMany } from "@/lib/ratelimit";
import { MAX_UPLOAD_BYTES } from "@/lib/storage";

/**
 * Step 1 of a direct upload: the browser asks for a signed Cloud Storage link, PUTs the file there,
 * then submits the form with "staged:<token>" in place of the file. Big videos never pass through the app server.
 * With local storage this answers { direct: false } and the browser sends files with the form as before.
 */
export const POST = handler(async (req, user) => {
  const store = blobs();
  if (store.kind !== "gcs") return { direct: false };
  const b = (await req.json()) as Record<string, unknown>;
  const name = str(b.name, 200), size = num(b.size), type = str(b.type, 100) || "application/octet-stream";
  if (!name || size === null || size <= 0) bad("Choose a file");
  if (size > MAX_UPLOAD_BYTES) bad(`${name} is larger than 500 MB`);
  const wait = await hit(`upload:user:${user.id}`, LIMITS.uploadUser);
  if (wait) return tooMany(wait);
  const token = crypto.randomBytes(24).toString("base64url");
  const key = `staging/${user.id}/${crypto.randomUUID()}`;
  const url = await store.signedUploadUrl(key, type);
  await db().run("INSERT INTO staged_uploads (token, user_id, key, name, mime, size) VALUES (?,?,?,?,?,?)", token, user.id, key, name, type, size);
  return { direct: true, url, token, contentType: type };
});
