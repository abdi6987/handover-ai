import { handler } from "@/lib/api";
import { acceptInvite } from "@/lib/invites";

export const POST = handler(async (_req, user, p) => ({ redirect: `/rentals/${await acceptInvite(p.token, user)}` }));
