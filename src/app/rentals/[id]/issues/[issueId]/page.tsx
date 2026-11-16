import { notFound } from "next/navigation";
import { getT } from "@/lib/i18n";
import { loadRental } from "@/lib/page";
import { ACCEPT_MEDIA_AUDIO } from "@/lib/formats";
import { getUser, userNames } from "@/lib/auth";
import { getStaff, staffOf } from "@/lib/staff";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/notify";
import { AssignForm, FilePickers, Form } from "@/components/client";
import { Badge, fmt, MediaTile, WhatsAppLink } from "@/components/ui";
import { ISSUE_CATEGORIES, ISSUE_STATUS, ISSUE_TYPES, type Issue, type Media } from "@/lib/types";

type Update = { id: number; user_id: number; body: string | null; status: string | null; created_at: string };
const tone = (s: string) => (s === "done" ? "green" : s === "disputed" ? "red" : s === "reported" ? "amber" : "blue") as "green" | "red" | "amber" | "blue";

export default async function IssuePage({ params, searchParams }: { params: Promise<{ id: string; issueId: string }>; searchParams: Promise<{ new?: string }> }) {
  const t = await getT();
  const { id, issueId } = await params;
  const { new: isNew } = await searchParams;
  const { user, rental: r, role, names } = await loadRental(id);
  const issue = await db().prepare("SELECT * FROM issues WHERE id = ? AND rental_id = ?").get(Number(issueId), r.id) as Issue | undefined;
  if (!issue) notFound();
  const updates = await db().prepare("SELECT * FROM issue_updates WHERE issue_id = ? ORDER BY id").all(issue.id) as Update[];
  const media = await db().prepare("SELECT * FROM media WHERE context='issue' AND ref_id=? AND deleted_at IS NULL ORDER BY id").all(issue.id) as Media[];
  const initial = media.filter((m) => !m.title?.startsWith("update:"));
  const forUpdate = (uid: number) => media.filter((m) => m.title === `update:${uid}`);
  const assignee = await getStaff(issue.assigned_to);
  const extraNames = await userNames([issue.done_by, ...updates.map((u) => u.user_id), ...media.map((m) => m.uploaded_by)]);
  const nameOf = (id: number | null) => (id ? names.get(id) ?? extraNames.get(id) : undefined);
  const team = role === "owner" ? await staffOf(user.id) : [];
  const otherUser = await getUser(role === "owner" ? r.tenant_id : r.owner_id);
  const waText = `${t(ISSUE_TYPES[issue.type])} at "${r.name}"${issue.room ? ` (${issue.room})` : ""}: ${issue.title}${issue.description ? `\n${issue.description}` : ""}\n\nPhotos and updates: ${appUrl(`/rentals/${r.id}/issues/${issue.id}`)}`;
  const next = Object.keys(ISSUE_STATUS).filter((s) => s !== issue.status) as Issue["status"][];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {isNew && issue.reported_by === user.id && (
        <div className="card space-y-3 border-green-300 bg-green-50">
          <p className="font-semibold text-green-900">{t("✅ Report sent")}{otherUser ? ` to ${otherUser.name} by email` : ""}.</p>
          {otherUser ? (
            <>
              <p className="text-sm text-green-900">{t("Want them to see it right now? Send it to their WhatsApp too.")}</p>
              <WhatsAppLink text={waText} phone={otherUser.phone} label={otherUser.phone ? `Send to ${otherUser.name} on WhatsApp` : "Send on WhatsApp"} />
              {!otherUser.phone && <p className="text-xs text-gray-600">{t(role === "owner" ? "The tenant hasn't added a phone number, so WhatsApp will ask you to pick the contact." : "The landlord hasn't added a phone number, so WhatsApp will ask you to pick the contact.")}</p>}
            </>
          ) : <p className="text-sm">{t(role === "owner" ? "The tenant hasn't joined yet. They'll see it when they do." : "The landlord hasn't joined yet. They'll see it when they do.")}</p>}
        </div>
      )}
      <div className="card space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="h2">{issue.category ? `${ISSUE_CATEGORIES[issue.category]?.icon} ` : ""}{issue.title}{issue.urgency === "urgent" ? <span className="ms-2 badge bg-red-600 text-white align-middle">{t("Urgent")}</span> : null}</h2>
            <p className="muted">{issue.category ? `${t(ISSUE_CATEGORIES[issue.category]?.label ?? "")} · ` : ""}{t(ISSUE_TYPES[issue.type])}{issue.room ? ` · ${t(issue.room)}` : ""} · {t("Reported {date} by {name}", { date: fmt(issue.created_at), name: names.get(issue.reported_by) ?? "" })}</p>
          </div>
          <Badge tone={tone(issue.status)}>{t(ISSUE_STATUS[issue.status])}</Badge>
        </div>
        {issue.description && <p className="whitespace-pre-line text-sm">{issue.description}</p>}
        {assignee && <p className="text-sm">{t("🧰 Assigned to")} <b>{assignee.name}</b>{assignee.trade ? ` (${assignee.trade})` : ""}</p>}
        {initial.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{initial.map((m) => <MediaTile key={m.id} m={m} uploader={names.get(m.uploaded_by)} />)}</div>}
        {issue.status === "done" && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-900">
            ✅ {t("Marked Done by {name} on {date}.", { name: nameOf(issue.done_by) ?? "", date: fmt(issue.done_at) })}
            {" "}{issue.confirmed_at ? t("Confirmed by {name} on {date}.", { name: names.get(issue.confirmed_by ?? 0) ?? "", date: fmt(issue.confirmed_at) }) : t("Waiting for the other side to confirm.")}
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold">{t("History")}</h3>
        <ol className="space-y-3 border-s-2 border-gray-200 ps-4">
          <li className="text-sm"><span className="font-medium">{names.get(issue.reported_by)}</span> {t("reported this")} <span className="text-gray-500">· {fmt(issue.created_at)}</span></li>
          {updates.map((u) => (
            <li key={u.id} className="space-y-1 text-sm">
              <p><span className="font-medium">{nameOf(u.user_id)}</span>{u.status ? <> {t("set status to")} <Badge tone={tone(u.status)}>{t(ISSUE_STATUS[u.status as Issue["status"]])}</Badge></> : ` ${t("commented")}`} <span className="text-gray-500">· {fmt(u.created_at)}</span></p>
              {u.body && <p className="whitespace-pre-line rounded-lg bg-gray-50 p-2">{u.body}</p>}
              {forUpdate(u.id).length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{forUpdate(u.id).map((m) => <MediaTile key={m.id} m={m} uploader={nameOf(m.uploaded_by)} />)}</div>}
            </li>
          ))}
        </ol>
      </div>

      {role === "owner" && issue.status !== "done" && (
        <div className="card space-y-2">
          <h3 className="font-semibold">{t("Send to staff")}</h3>
          {team.length ? <AssignForm issueId={issue.id} staff={team} current={issue.assigned_to} /> : <p className="muted">{t("Add maintenance staff on the")} <a href="/dashboard/landlord/staff" className="font-semibold text-brand-700">{t("Staff page")}</a> {t("to send them jobs.")}</p>}
        </div>
      )}

      {role === "owner" && (
        <div className="card space-y-2">
          <h3 className="font-semibold">{t("Cost")} <span className="muted font-normal">{t("(only you see this)")}</span></h3>
          {issue.repair_cost !== null && <p className="text-sm">{issue.repair_cost.toLocaleString()} {r.currency}{issue.cost_note ? ` · ${issue.cost_note}` : ""}</p>}
          <Form url={`/api/issues/${issue.id}`} multipart submitLabel={t("Save cost")} buttonClass="btn-secondary" extra={{ action: "cost" }} resetOnSuccess={false}>
            <div className="grid grid-cols-2 gap-2">
              <input name="repair_cost" type="number" step="any" min="0" defaultValue={issue.repair_cost ?? ""} className="input" placeholder={t("Amount ({cur})", { cur: r.currency })} />
              <input name="body" defaultValue={issue.cost_note ?? ""} className="input" placeholder={t("Paid to / note")} />
            </div>
          </Form>
        </div>
      )}

      {issue.status === "done" && !issue.confirmed_at && issue.done_by !== user.id && (
        <div className="card space-y-2 border-green-300">
          <h3 className="font-semibold">{t("Is it fixed?")}</h3>
          <Form url={`/api/issues/${issue.id}`} multipart submitLabel={t("Confirm it's fixed")} extra={{ action: "confirm" }}>
            <input name="body" className="input" placeholder={t("Optional comment")} />
          </Form>
          <Form url={`/api/issues/${issue.id}`} multipart submitLabel={t("Not fixed, reopen")} buttonClass="btn-secondary" extra={{ action: "status", status: "in_progress" }}>
            <input name="body" className="input" placeholder={t("What's still wrong?")} />
          </Form>
        </div>
      )}

      <div className="card space-y-3">
        <h3 className="font-semibold">{t("Add an update")}</h3>
        <Form url={`/api/issues/${issue.id}`} multipart submitLabel={t("Post update")} extra={{ action: "comment" }}>
          <textarea name="body" rows={2} className="input" placeholder={t("Comment, e.g. 'Plumber coming Tuesday'")} />
          <FilePickers accept={ACCEPT_MEDIA_AUDIO} />
        </Form>
        <hr />
        <Form url={`/api/issues/${issue.id}`} multipart submitLabel={t("Change status")} buttonClass="btn-secondary" extra={{ action: "status" }}>
          <div className="flex gap-2">
            <select name="status" className="input">
              {next.map((s) => <option key={s} value={s}>{s === "done" ? "Done (fixed / cleared)" : t(ISSUE_STATUS[s])}</option>)}
            </select>
          </div>
          <input name="body" className="input" placeholder={t("Optional note")} />
          <FilePickers accept={ACCEPT_MEDIA_AUDIO} />
        </Form>
        <WhatsAppLink className="btn-secondary w-full" phone={otherUser?.phone} label={otherUser ? t("WhatsApp {name} about this", { name: otherUser.name }) : t("Share on WhatsApp")} text={`${t(ISSUE_STATUS[issue.status])}: ${waText}`} />
      </div>
    </div>
  );
}
