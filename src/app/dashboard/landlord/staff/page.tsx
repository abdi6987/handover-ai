import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { staffOf } from "@/lib/staff";
import { ActionButton, StaffForm } from "@/components/client";
import { Badge, WhatsAppLink } from "@/components/ui";
import { appUrl } from "@/lib/notify";

export default async function StaffPage() {
  const user = await requireUser();
  const staff = staffOf(user.id);
  const counts = (id: number) => db().prepare("SELECT SUM(status != 'done') open, SUM(status = 'done') done FROM issues WHERE assigned_to = ?").get(id) as { open: number | null; done: number | null };
  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard/landlord" className="text-sm font-semibold text-brand-700">← Landlord dashboard</Link>
        <h1 className="h1">Staff</h1>
        <p className="muted">Maintenance people, cleaners or a building manager. They see repair requests and tenant complaints for your properties, nothing else (no leases, payments or tenants&apos; bills).</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {staff.length === 0 && <p className="muted">No staff yet.</p>}
          {staff.map((s) => {
            const c = counts(s.id);
            const link = appUrl(`/staff-invite/${s.token}`);
            return (
              <div key={s.id} className="card space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{s.name} <span className="muted font-normal">· {s.trade || "Maintenance"}</span></p>
                    <p className="muted">{[s.phone, s.email].filter(Boolean).join(" · ")}</p>
                  </div>
                  {s.user_id ? <Badge tone="green">Joined</Badge> : <Badge tone="amber">Invite pending</Badge>}
                </div>
                <p className="text-sm">{c.open ?? 0} open job(s) · {c.done ?? 0} done</p>
                <div className="flex flex-wrap gap-2">
                  {!s.user_id && <WhatsAppLink phone={s.phone} label="Send invite on WhatsApp" text={`Hi ${s.name}, ${user.name} added you as ${s.trade || "maintenance"} staff on Handover AI. Join here: ${link}`} />}
                  {s.phone && s.user_id && <WhatsAppLink phone={s.phone} label="WhatsApp" className="btn-secondary" text={`Hi ${s.name}, `} />}
                  <Link href={`/dashboard/landlord/maintenance?staff=${s.id}`} className="btn-secondary">Their jobs</Link>
                  <ActionButton url={`/api/staff/${s.id}`} method="DELETE" label="Remove" className="btn-danger" confirmText={`Remove ${s.name}? They lose access; their past updates stay in the log.`} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="card h-fit space-y-3">
          <h2 className="h2">Add staff</h2>
          <StaffForm />
        </div>
      </div>
    </div>
  );
}
