import { NextResponse } from "next/server";
import { createSession, findUserByEmail, hashPassword, getUser } from "@/lib/auth";
import { db, now } from "@/lib/db";
import { str } from "@/lib/api";
import { audit } from "@/lib/audit";
import { acceptInvite, getInvite, inviteToken } from "@/lib/invites";
import { HttpError } from "@/lib/rentals";
import { acceptStaff, staffByToken } from "@/lib/staff";
import { joinPhone, PROPERTY_COUNTS } from "@/lib/countries";
import { markVerified, sendEmailCode } from "@/lib/verify";
import type { User } from "@/lib/types";
import { clientIp, hit, LIMITS, tooMany } from "@/lib/ratelimit";

const err = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(req: Request) {
  const wait = await hit(`signup:ip:${await clientIp()}`, LIMITS.signupIp);
  if (wait) return tooMany(wait);
  const b = await req.json();
  const name = str(b.name, 100), email = str(b.email, 200).toLowerCase(), password = String(b.password ?? "");
  const phone = b.phoneCode ? joinPhone(str(b.phoneCode, 6), str(b.phone, 30)) : str(b.phone, 40) || null;
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return err("Enter your name and a valid email");
  if (password.length < 8) return err("Password must be at least 8 characters");
  if (password.toLowerCase().includes(email.split("@")[0]) && email.split("@")[0].length > 3) return err("Choose a password that doesn't contain your email name");
  if (b.terms !== true && b.terms !== "on") return err("Please accept the terms and privacy policy");
  if (await findUserByEmail(email)) return err("An account with this email already exists. Log in instead.");

  const token = inviteToken(b.invite || b.inviteCode);
  const inv = token ? await getInvite(token) : null;
  if (token && (!inv || inv.accepted_at)) return err("That invite code isn't valid or was already used. Ask for a new one, or leave it empty.");
  const staffInv = b.staff ? await staffByToken(String(b.staff)) : null;
  const accountType: User["account_type"] = b.staff ? "staff" : inv ? inv.role : b.accountType === "owner" ? "owner" : "tenant";
  const isOwner = accountType === "owner";

  const info = await db().prepare(`INSERT INTO users (email, name, phone, account_type, password_hash, created_at, company, property_count, country, city, terms_accepted_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(email, name, phone, accountType, hashPassword(password), now(),
    isOwner ? str(b.company, 120) || null : null, isOwner && PROPERTY_COUNTS.includes(b.propertyCount) ? b.propertyCount : null,
    str(b.country, 60) || null, str(b.city, 80) || null, now());
  const id = Number(info.lastInsertRowid);
  await audit(null, id, "user.signup", { email, type: accountType });
  // Someone who arrived from an invite sent to this exact address has already proven they own it.
  const invitedEmail = (inv?.email && inv.email === email) || (staffInv?.email && staffInv.email.toLowerCase() === email);
  if (invitedEmail) await markVerified(id);
  await createSession(id);

  let redirect = accountType === "owner" ? "/dashboard/landlord" : accountType === "staff" ? "/dashboard/staff" : "/dashboard/tenant";
  if (inv) {
    try { redirect = `/rentals/${await acceptInvite(token, { id, email, name, phone, account_type: accountType, created_at: "" } as User)}`; }
    catch (e) { if (!(e instanceof HttpError)) throw e; }
  }
  if (b.staff) {
    try { await acceptStaff(String(b.staff), (await getUser(id))!); redirect = "/dashboard/staff"; }
    catch (e) { if (!(e instanceof HttpError)) throw e; redirect = `/staff-invite/${b.staff}`; }
  }
  if (!invitedEmail) {
    await sendEmailCode({ id, email, name }, true);
    redirect = `/verify-email?next=${encodeURIComponent(redirect)}`;
  }
  return NextResponse.json({ redirect });
}
