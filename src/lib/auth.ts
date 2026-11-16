import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, now } from "./db";
import type { User } from "./types";

const COOKIE = "handover_session";

// Async scrypt runs on libuv's thread pool, so a burst of logins never freezes other requests on the same server.
const scrypt = (pw: string, salt: string) =>
  new Promise<Buffer>((res, rej) => crypto.scrypt(pw, salt, 64, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(pw, salt)).toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = await scrypt(pw, salt);
  const known = Buffer.from(hash, "hex");
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await db().prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expires.toISOString());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", expires,
    secure: process.env.NODE_ENV === "production" && !process.env.ALLOW_INSECURE_COOKIES,
  });
}

export async function destroySession() {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (token) await db().prepare("DELETE FROM sessions WHERE token = ?").run(token);
  c.delete(COOKIE);
}

/** The signed-in user. Cached per request, so the layout and the page share one database lookup. */
export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = await db()
    .prepare(
      `SELECT u.id, u.email, u.name, u.phone, u.account_type, u.created_at, u.email_verified_at FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, now()) as User | undefined;
  return row ?? null;
});

/** Logged-in user for a page. Unconfirmed emails are sent to /verify-email unless allowUnverified. */
export async function requireUser(opts: { allowUnverified?: boolean } = {}): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (!u.email_verified_at && !opts.allowUnverified) redirect("/verify-email");
  return u;
}

export async function destroyAllSessions(userId: number) {
  await db().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export async function findUserByEmail(email: string) {
  return await db().prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as
    | (User & { password_hash: string })
    | undefined;
}

/** Names for a set of user ids, in one query. */
export async function userNames(ids: (number | null | undefined)[]): Promise<Map<number, string>> {
  const list = [...new Set(ids.filter((i): i is number => !!i))];
  if (!list.length) return new Map();
  const rows = (await db().all("SELECT id, name FROM users WHERE id = ANY(?::bigint[])", list)) as { id: number; name: string }[];
  return new Map(rows.map((u) => [u.id, u.name]));
}

export async function getUser(id: number | null | undefined): Promise<User | null> {
  if (!id) return null;
  return (await db().prepare("SELECT id, email, name, phone, account_type, created_at, email_verified_at FROM users WHERE id = ?").get(id) as User) ?? null;
}
