import { NextResponse } from "next/server";
import { createSession, findUserByEmail, hashPassword, getUser } from "@/lib/auth";
import { db, now } from "@/lib/db";
import { str } from "@/lib/api";
import { audit } from "@/lib/audit";
import { acceptInvite, getInvite } from "@/lib/invites";
import { HttpError } from "@/lib/rentals";
import { acceptStaff } from "@/lib/staff";
import type { User } from "@/lib/types";

export async function POST(req: Request) {
  const b = await req.json();
  const name = str(b.name, 100), email = str(b.email, 200).toLowerCase(), password = String(b.password ?? ""), phone = str(b.phone, 40) || null;
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Enter your name and a valid email" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  if (findUserByEmail(email)) return NextResponse.json({ error: "An account with this email already exists. Log in instead." }, { status: 400 });
  const inv = b.invite ? getInvite(String(b.invite)) : null;
  const accountType: "tenant" | "owner" | "staff" = b.staff ? "staff" : inv ? inv.role : b.accountType === "owner" ? "owner" : "tenant";
  const info = db().prepare("INSERT INTO users (email, name, phone, account_type, password_hash, created_at) VALUES (?,?,?,?,?,?)").run(email, name, phone, accountType, hashPassword(password), now());
  const id = Number(info.lastInsertRowid);
  audit(null, id, "user.signup", { email });
  await createSession(id);
  let redirect = accountType === "owner" ? "/dashboard/landlord" : accountType === "staff" ? "/dashboard/staff" : "/dashboard/tenant";
  if (b.invite) {
    try {
      redirect = `/rentals/${await acceptInvite(String(b.invite), { id, email, name, phone, account_type: accountType, created_at: "" } as User)}`;
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
    }
  }
  if (b.staff) {
    try { await acceptStaff(String(b.staff), getUser(id)!); redirect = "/dashboard/staff"; }
    catch (e) { if (!(e instanceof HttpError)) throw e; redirect = `/staff-invite/${b.staff}`; }
  }
  return NextResponse.json({ redirect });
}
