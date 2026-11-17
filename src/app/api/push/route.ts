import { bad, handler, str } from "@/lib/api";
import { db } from "@/lib/db";

/** Save this device's push subscription (from the browser's PushManager) for the signed-in person. */
export const POST = handler(async (req, user) => {
  const b = (await req.json()) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = str(b.endpoint, 1000), p256dh = str(b.keys?.p256dh, 200), auth = str(b.keys?.auth, 100);
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) bad("This browser sent an incomplete subscription");
  const n = (await db().get("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?", user.id)) as { n: number };
  if (n.n >= 10) await db().run("DELETE FROM push_subscriptions WHERE endpoint = (SELECT endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY created_at LIMIT 1)", user.id);
  await db().run(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?,?,?,?)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    endpoint, user.id, p256dh, auth,
  );
});

export const DELETE = handler(async (req, user) => {
  const b = (await req.json()) as { endpoint?: unknown };
  await db().run("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?", str(b.endpoint, 1000), user.id);
});
