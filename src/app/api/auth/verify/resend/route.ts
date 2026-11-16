import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { sendEmailCode } from "@/lib/verify";

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });
  if (user.email_verified_at) return NextResponse.json({ ok: true });
  const { wait } = await sendEmailCode(user);
  if (wait) return NextResponse.json({ error: `Please wait ${wait} seconds before asking for another code.` }, { status: 429 });
  return NextResponse.json({ ok: true, sent: true });
}
