import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession, findUserByEmail, hashPassword } from "@/lib/auth";
import { db, now } from "@/lib/db";
import { audit } from "@/lib/audit";
import { acceptInvite, getInvite } from "@/lib/invites";
import { HttpError } from "@/lib/rentals";
import { markVerified } from "@/lib/verify";
import { appUrl } from "@/lib/notify";
import { GOOGLE_STATE_COOKIE, googleEnabled, googleRedirectUri } from "@/lib/google";
import type { User } from "@/lib/types";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const fail = (why: string) => NextResponse.redirect(appUrl(`/login?error=${encodeURIComponent(why)}`));
  if (!googleEnabled()) return fail("google_off");
  const jar = await cookies();
  let saved: { state: string; as: "owner" | "tenant"; invite: string } | null = null;
  try { saved = JSON.parse(jar.get(GOOGLE_STATE_COOKIE)?.value ?? "null"); } catch { saved = null; }
  jar.delete(GOOGLE_STATE_COOKIE);
  const code = u.searchParams.get("code");
  if (!saved || !code || saved.state !== u.searchParams.get("state")) return fail("google_state");

  const tok = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: googleRedirectUri(), grant_type: "authorization_code" }),
  }).then((r) => r.json()).catch(() => null) as { access_token?: string } | null;
  if (!tok?.access_token) return fail("google_token");
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } })
    .then((r) => r.json()).catch(() => null) as { sub?: string; email?: string; email_verified?: boolean; name?: string } | null;
  if (!info?.sub || !info.email || !info.email_verified) return fail("google_email");

  const email = info.email.toLowerCase();
  let user = (db().prepare("SELECT * FROM users WHERE google_id = ?").get(info.sub) as User | undefined) ?? findUserByEmail(email);
  if (!user) {
    const inv = saved.invite ? getInvite(saved.invite) : null;
    const type = inv && !inv.accepted_at ? inv.role : saved.as;
    const r = db().prepare("INSERT INTO users (email, name, account_type, password_hash, created_at, google_id, email_verified_at, terms_accepted_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(email, (info.name || email.split("@")[0]).slice(0, 100), type, hashPassword(crypto.randomBytes(32).toString("hex")), now(), info.sub, now(), now());
    user = db().prepare("SELECT * FROM users WHERE id = ?").get(Number(r.lastInsertRowid)) as User;
    audit(null, user.id, "user.signup", { email, type, via: "google" });
  } else {
    db().prepare("UPDATE users SET google_id = COALESCE(google_id, ?) WHERE id = ?").run(info.sub, user.id);
    markVerified(user.id);
  }
  await createSession(user.id);
  let to = "/dashboard";
  if (saved.invite) {
    try { to = `/rentals/${await acceptInvite(saved.invite, user)}`; } catch (e) { if (!(e instanceof HttpError)) throw e; }
  }
  return NextResponse.redirect(appUrl(to));
}
