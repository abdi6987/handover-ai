import { NextResponse } from "next/server";
import { createSession, destroyAllSessions, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { findReset, markVerified, consumeReset } from "@/lib/verify";

export async function POST(req: Request) {
  const b = await req.json();
  const token = String(b.token ?? ""), password = String(b.password ?? "");
  const row = await findReset(token);
  if (!row) return NextResponse.json({ error: "This reset link has expired or was already used. Ask for a new one." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  await db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), row.user_id);
  await consumeReset(token);
  await markVerified(row.user_id); // they just proved they can read this inbox
  await destroyAllSessions(row.user_id);
  await createSession(row.user_id);
  await audit(null, row.user_id, "user.password_reset", {});
  return NextResponse.json({ redirect: "/dashboard" });
}
