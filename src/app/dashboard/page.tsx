import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function Dashboard() {
  const user = await requireUser();
  redirect(user.account_type === "owner" ? "/dashboard/landlord" : user.account_type === "staff" ? "/dashboard/staff" : "/dashboard/tenant");
}
