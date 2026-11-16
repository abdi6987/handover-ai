import { NextResponse } from "next/server";
import { createSession, findUserByEmail, verifyPassword, getUser } from "@/lib/auth";
import { acceptInvite } from "@/lib/invites";
import { HttpError } from "@/lib/rentals";
import { acceptStaff } from "@/lib/staff";
import { clientIp, hit, LIMITS, peek, tooMany } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const b = await req.json();
  const email = String(b.email ?? "").trim().toLowerCase();
  const wait = (await hit(`login:ip:${await clientIp()}`, LIMITS.loginIp)) || (await peek(`login:fail:${email}`, LIMITS.loginFail));
  if (wait) return tooMany(wait);
  const u = await findUserByEmail(email);
  if (!u || !(await verifyPassword(String(b.password ?? ""), u.password_hash))) {
    await hit(`login:fail:${email}`, LIMITS.loginFail);
    return NextResponse.json({ error: "Wrong email or password" }, { status: 400 });
  }
  await createSession(u.id);
  let redirect = "/dashboard";
  if (b.invite) {
    try { redirect = `/rentals/${await acceptInvite(String(b.invite), u)}`; }
    catch (e) { if (!(e instanceof HttpError)) throw e; redirect = `/invite/${b.invite}`; }
  }
  if (b.staff) {
    try { await acceptStaff(String(b.staff), (await getUser(u.id))!); redirect = "/dashboard/staff"; }
    catch (e) { if (!(e instanceof HttpError)) throw e; redirect = `/staff-invite/${b.staff}`; }
  }
  return NextResponse.json({ redirect });
}
