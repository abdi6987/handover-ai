import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { CACHE_DIR, UPLOAD_DIR } from "./db";

/**
 * Where photos, videos and documents live.
 * - Local disk (dev, tests): files under data/uploads, made read-only after writing.
 * - Google Cloud Storage (production): set GCS_BUCKET. The bucket should have versioning and a retention
 *   policy (see deploy/gcp-setup.sh), so a stored original can't be replaced or deleted, even by an admin.
 */
export type BlobInfo = { size: number; md5: string | null };

export interface BlobStore {
  readonly kind: "local" | "gcs";
  /** Store a finished local file under `key` and remove the local copy. Never overwrites an existing key. */
  put(key: string, localPath: string, contentType: string, meta?: Record<string, string>): Promise<void>;
  info(key: string): Promise<BlobInfo | null>;
  /** Read a byte range (inclusive end) or the whole object. */
  read(key: string, range?: { start: number; end: number }): Promise<Readable>;
  /** A short-lived direct download link, when the store supports it (GCS). */
  signedUrl(key: string, opts: { contentType: string; filename: string; download: boolean }): Promise<string | null>;
  /** A path on local disk with the object's bytes. Call `done` when finished so temp copies are removed. */
  localCopy(key: string): Promise<{ path: string; done: () => void }>;
  /** A signed link the browser can PUT a file to (GCS only). */
  signedUploadUrl(key: string, contentType: string): Promise<string | null>;
  /** Server-side copy that never overwrites `to`, then delete `from`. */
  move(from: string, to: string, meta?: Record<string, string>): Promise<void>;
}

const md5File = (p: string) =>
  new Promise<string>((res, rej) => {
    const h = crypto.createHash("md5");
    fs.createReadStream(p).on("data", (c) => h.update(c)).on("error", rej).on("end", () => res(h.digest("base64")));
  });

class LocalStore implements BlobStore {
  readonly kind = "local" as const;
  private file(key: string) {
    const p = path.resolve(UPLOAD_DIR, key);
    if (!p.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) throw new Error("Bad storage key");
    return p;
  }
  async put(key: string, localPath: string) {
    const dest = this.file(key);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(dest)) throw new Error("Refusing to overwrite a stored file");
    fs.renameSync(localPath, dest);
    fs.chmodSync(dest, 0o444); // read-only on disk
  }
  async info(key: string) {
    const p = this.file(key);
    if (!fs.existsSync(p)) return null;
    return { size: fs.statSync(p).size, md5: null }; // the proof page re-hashes local files in full instead
  }
  async read(key: string, range?: { start: number; end: number }) {
    return fs.createReadStream(this.file(key), range);
  }
  async signedUrl() {
    return null;
  }
  async localCopy(key: string) {
    return { path: this.file(key), done: () => {} };
  }
  async signedUploadUrl() {
    return null;
  }
  async move(from: string, to: string) {
    const dest = this.file(to);
    if (fs.existsSync(dest)) throw new Error("Refusing to overwrite a stored file");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(this.file(from), dest);
    fs.chmodSync(dest, 0o444);
  }
}

class GcsStore implements BlobStore {
  readonly kind = "gcs" as const;
  private bucketP: Promise<import("@google-cloud/storage").Bucket>;
  constructor(name: string) {
    this.bucketP = import("@google-cloud/storage").then(({ Storage }) => new Storage().bucket(name));
  }
  async put(key: string, localPath: string, contentType: string, meta: Record<string, string> = {}) {
    const b = await this.bucketP;
    // ifGenerationMatch: 0 means "only if no object exists yet", so originals are never replaced.
    await b.upload(localPath, { destination: key, contentType, metadata: { metadata: meta }, preconditionOpts: { ifGenerationMatch: 0 }, resumable: fs.statSync(localPath).size > 8 * 1024 * 1024 });
    fs.rmSync(localPath, { force: true });
  }
  async info(key: string) {
    const f = (await this.bucketP).file(key);
    try {
      const [m] = await f.getMetadata();
      return { size: Number(m.size), md5: m.md5Hash ?? null };
    } catch (e) {
      if ((e as { code?: number }).code === 404) return null;
      throw e;
    }
  }
  async read(key: string, range?: { start: number; end: number }) {
    return (await this.bucketP).file(key).createReadStream(range ? { start: range.start, end: range.end } : {});
  }
  async signedUrl(key: string, opts: { contentType: string; filename: string; download: boolean }) {
    const [url] = await (await this.bucketP).file(key).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 15 * 60 * 1000,
      responseType: opts.contentType,
      responseDisposition: `${opts.download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(opts.filename)}`,
    });
    return url;
  }
  async signedUploadUrl(key: string, contentType: string) {
    const [url] = await (await this.bucketP).file(key).getSignedUrl({ version: "v4", action: "write", expires: Date.now() + 2 * 3600 * 1000, contentType });
    return url;
  }
  async move(from: string, to: string, meta: Record<string, string> = {}) {
    const b = await this.bucketP;
    await b.file(from).copy(b.file(to), { metadata: meta, preconditionOpts: { ifGenerationMatch: 0 } });
    await b.file(from).delete({ ignoreNotFound: true });
  }
  async localCopy(key: string) {
    const dir = path.join(CACHE_DIR, "tmp");
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, `${crypto.randomUUID()}${path.extname(key)}`);
    await (await this.bucketP).file(key).download({ destination: p });
    return { path: p, done: () => fs.rmSync(p, { force: true }) };
  }
}

const g = globalThis as unknown as { __handoverBlobs?: BlobStore };

export function blobs(): BlobStore {
  if (!g.__handoverBlobs) g.__handoverBlobs = process.env.GCS_BUCKET ? new GcsStore(process.env.GCS_BUCKET) : new LocalStore();
  return g.__handoverBlobs;
}

/** A scratch file path for work in progress (uploads being hashed, previews being made). */
export function tempPath(ext = "") {
  const dir = path.join(CACHE_DIR, "tmp");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${crypto.randomUUID()}${ext}`);
}

export { md5File };
