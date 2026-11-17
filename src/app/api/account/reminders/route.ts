import { bad, handler, str } from "@/lib/api";
import { db } from "@/lib/db";

/** WhatsApp reminders are opt-in (WhatsApp requires it). Saving can also add or change the phone number. */
export const POST = handler(async (req, user) => {
  const b = await req.json();
  const on = b.whatsapp === true;
  const phone = str(b.phone, 30) || user.phone || null;
  if (phone && phone.replace(/\D/g, "").length < 7) bad("Check the phone number");
  if (on && !phone) bad("Add your WhatsApp number to get reminders there");
  await db().run("UPDATE users SET whatsapp_reminders = ?, phone = ? WHERE id = ?", on, phone, user.id);
});
