import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { checkEmailCode } from "@/lib/verify";
import { hit, LIMITS, tooMany } from "@/lib/ratelimit";

const MSG = { wrong: "That code isn't right. Check the latest email and try again.", expired: "That code has expired. Tap 'Send a new code'.", locked: "Too many wrong tries. Tap 'Send a new code'." };

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });
  const b = await req.json();
  const next = typeof b.next === "string" && b.next.startsWith("/") && !b.next.startsWith("//") ? b.next : "/dashboard";
  if (user.email_verified_at) return NextResponse.json({ redirect: next });
  const wait = await hit(`code:user:${user.id}`, LIMITS.codeCheck);
  if (wait) return tooMany(wait);
  const r = await checkEmailCode(user.id, String(b.code ?? ""));
  if (r !== "ok") return NextResponse.json({ error: MSG[r] }, { status: 400 });
  await audit(null, user.id, "user.email_verified", { email: user.email });
  return NextResponse.json({ redirect: next });
}
