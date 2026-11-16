import { notFound } from "next/navigation";
import { loadRental } from "@/lib/page";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/notify";
import { FilePickers, Form } from "@/components/client";
import { Badge, fmt, MediaTile, WhatsAppLink } from "@/components/ui";
import { ISSUE_STATUS, ISSUE_TYPES, type Issue, type Media } from "@/lib/types";

type Update = { id: number; user_id: number; body: string | null; status: string | null; created_at: string };
const tone = (s: string) => (s === "done" ? "green" : s === "disputed" ? "red" : s === "reported" ? "amber" : "blue") as "green" | "red" | "amber" | "blue";

export default async function IssuePage({ params }: { params: Promise<{ id: string; issueId: string }> }) {
  const { id, issueId } = await params;
  const { user, rental: r, names } = await loadRental(id);
  const issue = db().prepare("SELECT * FROM issues WHERE id = ? AND rental_id = ?").get(Number(issueId), r.id) as Issue | undefined;
  if (!issue) notFound();
  const updates = db().prepare("SELECT * FROM issue_updates WHERE issue_id = ? ORDER BY id").all(issue.id) as Update[];
  const media = db().prepare("SELECT * FROM media WHERE context='issue' AND ref_id=? AND deleted_at IS NULL ORDER BY id").all(issue.id) as Media[];
  const initial = media.filter((m) => !m.title?.startsWith("update:"));
  const forUpdate = (uid: number) => media.filter((m) => m.title === `update:${uid}`);
  const next = Object.keys(ISSUE_STATUS).filter((s) => s !== issue.status) as Issue["status"][];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="card space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="h2">{issue.title}</h2>
            <p className="muted">{ISSUE_TYPES[issue.type]}{issue.room ? ` · ${issue.room}` : ""} · reported by {names.get(issue.reported_by)} on {fmt(issue.created_at)}</p>
          </div>
          <Badge tone={tone(issue.status)}>{ISSUE_STATUS[issue.status]}</Badge>
        </div>
        {issue.description && <p className="whitespace-pre-line text-sm">{issue.description}</p>}
        {initial.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{initial.map((m) => <MediaTile key={m.id} m={m} uploader={names.get(m.uploaded_by)} />)}</div>}
        {issue.status === "done" && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-900">
            ✅ Marked Done by {names.get(issue.done_by ?? 0)} on {fmt(issue.done_at)}.
            {issue.confirmed_at ? ` Confirmed by ${names.get(issue.confirmed_by ?? 0)} on ${fmt(issue.confirmed_at)}.` : " Waiting for the other side to confirm."}
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold">History</h3>
        <ol className="space-y-3 border-l-2 border-gray-200 pl-4">
          <li className="text-sm"><span className="font-medium">{names.get(issue.reported_by)}</span> reported this <span className="text-gray-500">· {fmt(issue.created_at)}</span></li>
          {updates.map((u) => (
            <li key={u.id} className="space-y-1 text-sm">
              <p><span className="font-medium">{names.get(u.user_id)}</span>{u.status ? <> set status to <Badge tone={tone(u.status)}>{ISSUE_STATUS[u.status as Issue["status"]]}</Badge></> : " commented"} <span className="text-gray-500">· {fmt(u.created_at)}</span></p>
              {u.body && <p className="whitespace-pre-line rounded-lg bg-gray-50 p-2">{u.body}</p>}
              {forUpdate(u.id).length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{forUpdate(u.id).map((m) => <MediaTile key={m.id} m={m} uploader={names.get(m.uploaded_by)} />)}</div>}
            </li>
          ))}
        </ol>
      </div>

      {issue.status === "done" && !issue.confirmed_at && issue.done_by !== user.id && (
        <div className="card space-y-2 border-green-300">
          <h3 className="font-semibold">Is it fixed?</h3>
          <Form url={`/api/issues/${issue.id}`} multipart submitLabel="Confirm it's fixed" extra={{ action: "confirm" }}>
            <input name="body" className="input" placeholder="Optional comment" />
          </Form>
          <Form url={`/api/issues/${issue.id}`} multipart submitLabel="Not fixed, reopen" buttonClass="btn-secondary" extra={{ action: "status", status: "in_progress" }}>
            <input name="body" className="input" placeholder="What's still wrong?" />
          </Form>
        </div>
      )}

      <div className="card space-y-3">
        <h3 className="font-semibold">Add an update</h3>
        <Form url={`/api/issues/${issue.id}`} multipart submitLabel="Post update" extra={{ action: "comment" }}>
          <textarea name="body" rows={2} className="input" placeholder="Comment, e.g. 'Plumber coming Tuesday'" />
          <FilePickers />
        </Form>
        <hr />
        <Form url={`/api/issues/${issue.id}`} multipart submitLabel="Change status" buttonClass="btn-secondary" extra={{ action: "status" }}>
          <div className="flex gap-2">
            <select name="status" className="input">
              {next.map((s) => <option key={s} value={s}>{s === "done" ? "Done (fixed / cleared)" : ISSUE_STATUS[s]}</option>)}
            </select>
          </div>
          <input name="body" className="input" placeholder="Optional note" />
          <FilePickers />
        </Form>
        <WhatsAppLink className="btn-secondary w-full" label="Share on WhatsApp" text={`Issue at "${r.name}": ${issue.title} (${ISSUE_STATUS[issue.status]}). Details and photos: ${appUrl(`/rentals/${r.id}/issues/${issue.id}`)}`} />
      </div>
    </div>
  );
}
