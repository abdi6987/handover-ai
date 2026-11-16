import { ping } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Load balancer / Cloud Run health check: the app is up and can reach the database. */
export async function GET() {
  try {
    await ping();
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[health]", e);
    return Response.json({ ok: false }, { status: 503 });
  }
}
