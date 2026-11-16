import Link from "next/link";
import { getT } from "@/lib/i18n";
import { notFound } from "next/navigation";
import { getUser, requireUser, userNames } from "@/lib/auth";
import { db } from "@/lib/db";
import { appUrl, waNumber } from "@/lib/notify";
import { getStaff, issueAccess } from "@/lib/staff";
import { ACCEPT_MEDIA_AUDIO } from "@/lib/formats";
import { HttpError } from "@/lib/rentals";
import { FilePickers, Form } from "@/components/client";
import { Badge, fmt, MediaTile, WhatsAppLink } from "@/components/ui";
import { ISSUE_CATEGORIES, ISSUE_STATUS, ISSUE_TYPES, type Issue, type Media } from "@/lib/types";

type Update = { id: number; user_id: number; body: string | null; status: string | null; created_at: string };
const tone = (s: string) => (s === "done" ? "green" : s === "disputed" ? "red" : s === "reported" ? "amber" : "blue") as "green" | "red" | "amber" | "blue";

export default async function JobPage({ params }: { params: Promise<{ issueId: string }> }) {
  const t = await getT();
  const { issueId } = await params;
  const user = await requireUser();
  let access;
  try { access = await issueAccess(Number(issueId), user); } catch (e) { if (e instanceof HttpError) notFound(); throw e; }
  const { issue, rental: r, role } = access;
  if (role !== "staff") return <div className="card"><Link className="font-semibold text-brand-700" href={`/rentals/${r.id}/issues/${issue.id}`}>Open this issue →</Link></div>;
  const tenant = await getUser(r.tenant_id), owner = await getUser(r.owner_id), assignee = await getStaff(issue.assigned_to);
  const updates = await db().prepare("SELECT * FROM issue_updates WHERE issue_id = ? ORDER BY id").all(issue.id) as Update[];
  const media = await db().prepare("SELECT * FROM media WHERE context='issue' AND ref_id=? AND deleted_at IS NULL ORDER BY id").all(issue.id) as Media[];
  const userName = await userNames([issue.reported_by, ...updates.map((u) => u.user_id), ...media.map((m) => m.uploaded_by)]);
  const nameOf = (id: number) => userName.get(id) ?? "";
  const initial = media.filter((m) => !m.title?.startsWith("update:"));
  const forUpdate = (uid: number) => media.filter((m) => m.title === `update:${uid}`);
  const statuses = (["acknowledged", "in_progress", "done"] as Issue["status"][]).filter((s) => s !== issue.status);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/dashboard/staff" className="text-sm font-semibold text-brand-700">{t("← My jobs")}</Link>
      <div className="card space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="h2">{issue.category ? `${ISSUE_CATEGORIES[issue.category]?.icon} ` : ""}{issue.title}{issue.urgency === "urgent" ? <span className="ms-2 badge bg-red-600 text-white align-middle">{t("Urgent")}</span> : null}</h1>
            <p className="muted">{issue.category ? `${t(ISSUE_CATEGORIES[issue.category]?.label ?? "")} · ` : ""}{t(ISSUE_TYPES[issue.type])}{issue.room ? ` · ${t(issue.room)}` : ""} · {t("Reported {date} by {name}", { date: fmt(issue.created_at), name: nameOf(issue.reported_by) ?? "" })}</p>
          </div>
          <Badge tone={tone(issue.status)}>{t(ISSUE_STATUS[issue.status])}</Badge>
        </div>
        {issue.description && <p className="whitespace-pre-line text-sm">{issue.description}</p>}
        {initial.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{initial.map((m) => <MediaTile key={m.id} m={m} uploader={nameOf(m.uploaded_by)} />)}</div>}
        <p className="text-xs text-gray-500">{assignee ? t("Assigned to {name}", { name: assignee.name }) : t("Not assigned yet")}</p>
      </div>

      <div className="card space-y-2 text-sm">
        <h2 className="font-semibold">{t("Where and who")}</h2>
        <p>{r.name}<br /><span className="text-gray-600">{r.address}</span></p>
        <a className="font-semibold text-brand-700" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.address)}`}>{t("Open in Maps →")}</a>
        {tenant && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span>{t("Tenant:")} <b>{tenant.name}</b></span>
            <WhatsAppLink phone={tenant.phone} label={t("WhatsApp tenant")} text={`Hi ${tenant.name}, this is ${user.name} (maintenance for ${owner?.name}). About "${issue.title}" at ${r.name}: when can I come by?`} />
            {tenant.phone && <a href={`tel:+${waNumber(tenant.phone)}`} className="btn-secondary">{t("Call")}</a>}
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">{t("History")}</h2>
        <ol className="space-y-3 border-s-2 border-gray-200 ps-4">
          {updates.map((u) => (
            <li key={u.id} className="space-y-1 text-sm">
              <p><span className="font-medium">{nameOf(u.user_id)}</span>{u.status ? <> {t("set status to")} <Badge tone={tone(u.status)}>{t(ISSUE_STATUS[u.status as Issue["status"]])}</Badge></> : ` ${t("commented")}`} <span className="text-gray-500">· {fmt(u.created_at)}</span></p>
              {u.body && <p className="whitespace-pre-line rounded-lg bg-gray-50 p-2">{u.body}</p>}
              {forUpdate(u.id).length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{forUpdate(u.id).map((m) => <MediaTile key={m.id} m={m} uploader={nameOf(m.uploaded_by)} />)}</div>}
            </li>
          ))}
          {updates.length === 0 && <li className="muted">{t("No updates yet.")}</li>}
        </ol>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">{t("Update the job")}</h2>
        <Form url={`/api/issues/${issue.id}`} multipart submitLabel={t("Update status")} extra={{ action: "status" }}>
          <select name="status" className="input">
            {statuses.map((s) => <option key={s} value={s}>{s === "done" ? "Done (fixed)" : t(ISSUE_STATUS[s])}</option>)}
          </select>
          <textarea name="body" rows={2} className="input" placeholder={t("What did you do? e.g. 'Replaced the drain hose'")} />
          <FilePickers accept={ACCEPT_MEDIA_AUDIO} />
          <p className="text-xs text-gray-500">{t("Add an after photo when you mark it Done. The tenant and landlord are notified and the tenant confirms the fix.")}</p>
        </Form>
        <hr />
        <Form url={`/api/issues/${issue.id}`} multipart submitLabel={t("Post comment")} buttonClass="btn-secondary" extra={{ action: "comment" }}>
          <textarea name="body" rows={2} className="input" placeholder={t("e.g. 'Part ordered, coming Thursday'")} />
          <FilePickers accept={ACCEPT_MEDIA_AUDIO} />
        </Form>
        <p className="text-xs text-gray-400">{t("Link:")} {appUrl(`/jobs/${issue.id}`)}</p>
      </div>
    </div>
  );
}
