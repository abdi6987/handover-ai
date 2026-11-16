import { NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPasswordReset } from "@/lib/verify";

export async function POST(req: Request) {
  const b = await req.json();
  const u = await findUserByEmail(String(b.email ?? ""));
  if (u) {
    // At most 3 reset emails per account per hour.
    const recent = (await db().prepare("SELECT COUNT(*) n FROM password_resets WHERE user_id = ? AND created_at > ?").get(u.id, new Date(Date.now() - 3600_000).toISOString()) as { n: number }).n;
    if (recent < 3) await sendPasswordReset(u);
  }
  // Same answer either way, so this can't be used to find out who has an account.
  return NextResponse.json({ ok: true });
}
