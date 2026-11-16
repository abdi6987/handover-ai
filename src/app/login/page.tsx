import Link from "next/link";
import { AuthForm } from "@/components/client";

export default async function Login({ searchParams }: { searchParams: Promise<{ invite?: string; staff?: string }> }) {
  const { invite, staff } = await searchParams;
  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <h1 className="h1">Log in</h1>
      <div className="card"><AuthForm mode="login" staff={staff} invite={invite} /></div>
      <p className="muted">No account? <Link className="font-semibold text-brand-700" href={`/signup${invite ? `?invite=${invite}` : staff ? `?staff=${staff}` : ""}`}>Sign up</Link></p>
    </div>
  );
}
