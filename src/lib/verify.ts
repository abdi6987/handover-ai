import crypto from "node:crypto";
import { db, now } from "./db";
import { sendEmail } from "./notify";
import type { User } from "./types";

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const CODE_MINUTES = 15, RESEND_SECONDS = 60, MAX_ATTEMPTS = 5;

/** Create (or replace) a 6-digit email code and email it. Returns seconds to wait if called too soon. */
export async function sendEmailCode(user: Pick<User, "id" | "email" | "name">, force = false): Promise<{ wait: number }> {
  const row = await db().prepare("SELECT sent_at FROM email_codes WHERE user_id = ?").get(user.id) as { sent_at: string } | undefined;
  if (row && !force) {
    const ago = (Date.now() - Date.parse(row.sent_at)) / 1000;
    if (ago < RESEND_SECONDS) return { wait: Math.ceil(RESEND_SECONDS - ago) };
  }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const expires = new Date(Date.now() + CODE_MINUTES * 60_000).toISOString();
  await db().prepare("INSERT INTO email_codes (user_id, code_hash, expires_at, attempts, sent_at) VALUES (?,?,?,0,?) ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, sent_at=excluded.sent_at")
    .run(user.id, sha(`${user.id}:${code}`), expires, now());
  await sendEmail(user.email, `${code} is your Handover AI code`,
    `Hi ${user.name},\n\nYour Handover AI confirmation code is: ${code}\n\nIt expires in ${CODE_MINUTES} minutes. If you didn't sign up, you can ignore this email.`, "/verify-email");
  return { wait: 0 };
}

export async function checkEmailCode(userId: number, code: string): Promise<"ok" | "wrong" | "expired" | "locked"> {
  const row = await db().prepare("SELECT * FROM email_codes WHERE user_id = ?").get(userId) as { code_hash: string; expires_at: string; attempts: number } | undefined;
  if (!row || Date.parse(row.expires_at) < Date.now()) return "expired";
  if (row.attempts >= MAX_ATTEMPTS) return "locked";
  const want = Buffer.from(row.code_hash, "hex"), got = Buffer.from(sha(`${userId}:${code.replace(/\D/g, "")}`), "hex");
  if (!crypto.timingSafeEqual(want, got)) {
    await db().prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = ?").run(userId);
    return "wrong";
  }
  await markVerified(userId);
  return "ok";
}

export async function markVerified(userId: number) {
  await db().prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").run(now(), userId);
  await db().prepare("DELETE FROM email_codes WHERE user_id = ?").run(userId);
}

/** One-hour, single-use password reset link. Only the hash is stored. */
export async function sendPasswordReset(user: Pick<User, "id" | "email" | "name">) {
  const token = crypto.randomBytes(32).toString("base64url");
  await db().prepare("INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)")
    .run(sha(token), user.id, new Date(Date.now() + 3600_000).toISOString(), now());
  await sendEmail(user.email, "Reset your Handover AI password",
    `Hi ${user.name},\n\nSomeone (hopefully you) asked to reset your Handover AI password. Open the link below within 1 hour to choose a new one. If it wasn't you, ignore this email and your password stays the same.`, `/reset-password/${token}`);
}

export async function findReset(token: string) {
  const row = await db().prepare("SELECT * FROM password_resets WHERE token_hash = ?").get(sha(token)) as { user_id: number; expires_at: string; used_at: string | null } | undefined;
  if (!row || row.used_at || Date.parse(row.expires_at) < Date.now()) return null;
  return row;
}

export async function consumeReset(token: string) {
  await db().prepare("UPDATE password_resets SET used_at = ? WHERE token_hash = ?").run(now(), sha(token));
}
