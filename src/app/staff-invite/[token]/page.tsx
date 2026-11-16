import Link from "next/link";
import { currentUser, getUser } from "@/lib/auth";
import { staffByToken } from "@/lib/staff";
import { ActionButton } from "@/components/client";
import { EmptyState } from "@/components/ui";

export default async function StaffInvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = staffByToken(token);
  if (!s) return <EmptyState title="This staff invite isn't valid" href="/" cta="Go home" />;
  const owner = getUser(s.owner_id);
  const user = await currentUser();
  return (
    <div className="mx-auto max-w-md py-6">
      <div className="card space-y-3">
        <p className="text-4xl">🧰</p>
        <h1 className="h1">Join {owner?.name}&apos;s team</h1>
        <p className="text-gray-700">You&apos;ve been added as <b>{s.trade || "maintenance"} staff</b>. You&apos;ll see repair requests and tenant complaints for {owner?.name}&apos;s properties, and can post updates, photos and mark jobs as fixed.</p>
        {s.user_id && s.user_id === user?.id ? <Link href="/dashboard/staff" className="btn-primary">Open my jobs</Link>
          : s.user_id ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This invite was already used. Ask {owner?.name} for a new one.</p>
          : user ? <ActionButton url={`/api/staff-invites/${token}`} label={`Join as ${user.name}`} className="btn-primary" />
          : (
            <div className="flex gap-2">
              <Link href={`/signup?staff=${token}`} className="btn-primary">Sign up and join</Link>
              <Link href={`/login?staff=${token}`} className="btn-secondary">I have an account</Link>
            </div>
          )}
      </div>
    </div>
  );
}
