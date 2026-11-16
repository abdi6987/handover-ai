import { handler } from "@/lib/api";
import { acceptStaff } from "@/lib/staff";

export const POST = handler(async (_req, user, p) => {
  await acceptStaff(p.token, user);
  return { redirect: "/dashboard/staff" };
});
