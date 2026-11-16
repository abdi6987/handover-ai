import crypto from "node:crypto";
export const sha256 = (data: string | Buffer) => crypto.createHash("sha256").update(data).digest("hex");

/** Deterministic JSON (sorted keys) so hashes are reproducible. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().filter((k) => obj[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}
