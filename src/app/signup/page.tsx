import Link from "next/link";
import { AuthForm } from "@/components/client";
import { getInvite } from "@/lib/invites";

export default async function Signup({ searchParams }: { searchParams: Promise<{ invite?: string; as?: string; staff?: string }> }) {
  const { invite, as, staff } = await searchParams;
  const inv = invite ? getInvite(invite) : null;
  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <h1 className="h1">{inv ? "Create your account" : as === "owner" ? "Landlord sign up" : "Tenant sign up"}</h1>
      {inv && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">You&apos;ll join the rental as the <b>{inv.role}</b> right after signing up.</p>}
      <div className="card"><AuthForm mode="signup" staff={staff} invite={invite} email={inv?.email ?? undefined} as={as === "owner" ? "owner" : "tenant"} /></div>
      <p className="muted">Already have an account? <Link className="font-semibold text-brand-700" href={`/login${invite ? `?invite=${invite}` : staff ? `?staff=${staff}` : ""}`}>Log in</Link></p>
    </div>
  );
}
