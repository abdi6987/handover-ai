import { NextResponse } from "next/server";
import { currentUser } from "./auth";
import { HttpError } from "./rentals";
import type { User } from "./types";

type Ctx = { params: Promise<Record<string, string>> };

/** Wrap a route handler: require login, turn thrown HttpErrors into JSON errors. */
export function handler(fn: (req: Request, user: User, params: Record<string, string>) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const user = await currentUser();
      if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });
      if (!user.email_verified_at) return NextResponse.json({ error: "Please confirm your email first", redirect: "/verify-email" }, { status: 403 });
      const result = await fn(req, user, await ctx.params);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status: 500 });
    }
  };
}

export function bad(msg: string): never { throw new HttpError(400, msg); }
export function forbid(msg: string): never { throw new HttpError(403, msg); }

export function str(v: unknown, max = 5000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
export function num(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
