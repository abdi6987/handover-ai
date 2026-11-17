import { handler } from "@/lib/api";
import { setCancel } from "@/lib/subscriptions";

/** Stop (or undo stopping) automatic renewal. The plan keeps working until the end of the paid period. */
export const POST = handler(async (req, user) => {
  const b = (await req.json()) as { resume?: unknown };
  await setCancel(user, !b.resume);
  return { ok: true };
});
