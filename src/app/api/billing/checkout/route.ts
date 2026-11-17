import { handler, str } from "@/lib/api";
import { startCheckout } from "@/lib/subscriptions";

/** Start paying for a plan: answers with the payment page (Apple Pay or card) to send the browser to. */
export const POST = handler(async (req, user) => {
  const b = (await req.json()) as Record<string, unknown>;
  return { redirect: await startCheckout(user, str(b.plan, 20), str(b.interval, 10)) };
});
