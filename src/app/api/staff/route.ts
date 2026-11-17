import { assertStaff } from "@/lib/billing";
import { bad, handler, str } from "@/lib/api";
import { createStaff } from "@/lib/staff";

export const POST = handler(async (req, user) => {
  const b = await req.json();
  const name = str(b.name, 100);
  if (!name) bad("Enter the staff member's name");
  await assertStaff(user);
  const email = str(b.email, 200).toLowerCase() || null;
  if (email === user.email) bad("Use the staff member's own email");
  return createStaff(user, { name, email, phone: str(b.phone, 40) || null, trade: str(b.trade, 60) || null });
});
