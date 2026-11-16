import Link from "next/link";
import { getT } from "@/lib/i18n";
import { currentUser, getUser } from "@/lib/auth";
import { getInvite } from "@/lib/invites";
import { getRental, roleOf } from "@/lib/rentals";
import { ActionButton } from "@/components/client";
import { EmptyState } from "@/components/ui";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const t = await getT();
  const { token } = await params;
  const inv = await getInvite(token);
  if (!inv) return <EmptyState title="This invite link isn't valid" href="/" cta="Go home" />;
  const rental = (await getRental(inv.rental_id))!;
  const inviter = await getUser(inv.created_by);
  const user = await currentUser();
  const slotTaken = inv.role === "owner" ? rental.owner_id : rental.tenant_id;
  const mine = user && roleOf(rental, user);
  return (
    <div className="mx-auto max-w-md space-y-4 py-6">
      <div className="card space-y-3">
        <p className="muted">{inviter?.name} {t("invited you to join")}</p>
        <h1 className="h1">{rental.name}</h1>
        <p className="text-gray-600">{rental.address}</p>
        <p>{t("You'll join as the")} <b>{inv.role}</b>{t(". Move-in photos, the lease, repairs and reports will be shared between you in one timestamped record.")}</p>
        {mine ? (
          <Link href={`/rentals/${rental.id}`} className="btn-primary">{t("Open the rental")}</Link>
        ) : slotTaken ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t("This rental already has a")} {inv.role}. Ask {inviter?.name} {t("for a new link.")}</p>
        ) : user ? (
          <ActionButton url={`/api/invites/${token}`} label={`Join as ${inv.role}`} className="btn-primary" />
        ) : (
          <div className="flex gap-2">
            <Link href={`/signup?invite=${token}`} className="btn-primary">{t("Sign up and join")}</Link>
            <Link href={`/login?invite=${token}`} className="btn-secondary">{t("I have an account")}</Link>
          </div>
        )}
      </div>
    </div>
  );
}
