import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, now } from "./db";
import type { User } from "./types";

const COOKIE = "handover_session";

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(pw, salt, 64);
  const known = Buffer.from(hash, "hex");
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  db().prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expires.toISOString());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", expires,
    secure: process.env.NODE_ENV === "production" && !process.env.ALLOW_INSECURE_COOKIES,
  });
}

export async function destroySession() {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (token) db().prepare("DELETE FROM sessions WHERE token = ?").run(token);
  c.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare(
      `SELECT u.id, u.email, u.name, u.phone, u.account_type, u.created_at, u.email_verified_at FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, now()) as User | undefined;
  return row ?? null;
}

/** Logged-in user for a page. Unconfirmed emails are sent to /verify-email unless allowUnverified. */
export async function requireUser(opts: { allowUnverified?: boolean } = {}): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (!u.email_verified_at && !opts.allowUnverified) redirect("/verify-email");
  return u;
}

export async function destroyAllSessions(userId: number) {
  db().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function findUserByEmail(email: string) {
  return db().prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase()) as
    | (User & { password_hash: string })
    | undefined;
}

export function getUser(id: number | null | undefined): User | null {
  if (!id) return null;
  return (db().prepare("SELECT id, email, name, phone, account_type, created_at, email_verified_at FROM users WHERE id = ?").get(id) as User) ?? null;
}
