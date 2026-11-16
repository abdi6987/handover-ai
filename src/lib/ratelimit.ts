import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "./db";

/**
 * Shared rate limits (fixed windows in Postgres, so every server instance sees the same counts).
 * Per-IP limits are generous because many phones in Qatar share one carrier IP; per-account limits are tight.
 */
export const LIMITS = {
  loginIp: { max: 100, windowSec: 600 },
  loginFail: { max: 10, windowSec: 900 }, // wrong passwords per account
  signupIp: { max: 20, windowSec: 3600 },
  codeCheck: { max: 10, windowSec: 900 }, // email code guesses per account
  codeSendIp: { max: 20, windowSec: 3600 },
  forgotIp: { max: 10, windowSec: 3600 },
  resetIp: { max: 20, windowSec: 3600 },
  uploadUser: { max: 600, windowSec: 3600 }, // direct-upload links per account
} as const;
type Limit = (typeof LIMITS)[keyof typeof LIMITS];

/** The caller's IP. Behind Google's load balancer the client is the second-last X-Forwarded-For entry. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const parts = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const hops = Number(process.env.TRUSTED_PROXY_HOPS || 1);
  return parts[parts.length - hops] ?? parts[0] ?? "local";
}

/** Count one hit. Returns how many seconds to wait if over the limit, otherwise 0. */
export async function hit(key: string, l: Limit): Promise<number> {
  if (process.env.RATE_LIMITS === "off") return 0;
  const row = (await db().get(
    `INSERT INTO rate_limits (key, window_start, hits) VALUES (?, to_timestamp(floor(extract(epoch FROM now()) / ?) * ?), 1)
     ON CONFLICT (key, window_start) DO UPDATE SET hits = rate_limits.hits + 1
     RETURNING hits, ceil(extract(epoch FROM window_start) + ? - extract(epoch FROM now()))::int AS wait`,
    key, l.windowSec, l.windowSec, l.windowSec,
  )) as { hits: number; wait: number };
  return row.hits > l.max ? Math.max(1, row.wait) : 0;
}

/** Hits without counting (e.g. to check failed logins before trying the password). */
export async function peek(key: string, l: Limit): Promise<number> {
  if (process.env.RATE_LIMITS === "off") return 0;
  const row = (await db().get(
    `SELECT hits, ceil(extract(epoch FROM window_start) + ? - extract(epoch FROM now()))::int AS wait FROM rate_limits
     WHERE key = ? AND window_start = to_timestamp(floor(extract(epoch FROM now()) / ?) * ?)`,
    l.windowSec, key, l.windowSec, l.windowSec,
  )) as { hits: number; wait: number } | undefined;
  return row && row.hits >= l.max ? Math.max(1, row.wait) : 0;
}

export function tooMany(wait: number) {
  const mins = Math.ceil(wait / 60);
  return NextResponse.json(
    { error: mins > 1 ? `Too many attempts. Please try again in ${mins} minutes.` : "Too many attempts. Please try again in a minute." },
    { status: 429, headers: { "Retry-After": String(wait) } },
  );
}
