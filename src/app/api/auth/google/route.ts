import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { GOOGLE_STATE_COOKIE, googleEnabled, googleRedirectUri } from "@/lib/google";
import { inviteToken } from "@/lib/invites";
import { appUrl } from "@/lib/notify";

export async function GET(req: Request) {
  const u = new URL(req.url);
  if (!googleEnabled()) return NextResponse.redirect(appUrl("/signup?google=off"));
  const state = crypto.randomBytes(16).toString("hex");
  const as = u.searchParams.get("as") === "owner" ? "owner" : "tenant";
  const invite = inviteToken(u.searchParams.get("invite") ?? "");
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: googleRedirectUri(), response_type: "code",
    scope: "openid email profile", state, prompt: "select_account",
  });
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
  res.cookies.set(GOOGLE_STATE_COOKIE, JSON.stringify({ state, as, invite }), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 600,
    secure: process.env.NODE_ENV === "production" && !process.env.ALLOW_INSECURE_COOKIES,
  });
  return res;
}
