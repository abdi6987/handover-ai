import Link from "next/link";
import { loadRental } from "@/lib/page";
import { db } from "@/lib/db";
import { issuesFor } from "@/lib/rentals";
import { FilePickers, Form } from "@/components/client";
import { Badge, fmt } from "@/components/ui";
import { ISSUE_STATUS, ISSUE_TYPES, ROOMS } from "@/lib/types";

const statusTone = (s: string) => (s === "done" ? "green" : s === "disputed" ? "red" : s === "reported" ? "amber" : "blue") as "green" | "red" | "amber" | "blue";

export default async function Issues({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ filter?: string }> }) {
  const { id } = await params;
  const { filter = "all" } = await searchParams;
  const { rental: r } = await loadRental(id);
  const all = issuesFor(r.id);
  const shown = all.filter((i) => filter === "all" || (filter === "open" ? i.status !== "done" : filter === "done" ? i.status === "done" : i.type === filter));
  const photoCount = (iid: number) => (db().prepare("SELECT COUNT(*) n FROM media WHERE context='issue' AND ref_id=? AND deleted_at IS NULL").get(iid) as { n: number }).n;
  const base = `/rentals/${r.id}/issues`;
  const filters = [["all", "All"], ["open", "Open"], ["done", "Done"], ["maintenance", "Maintenance"], ["damage", "Breakage"], ["wear_tear", "Wear & tear"]];
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-3 lg:col-span-3">
        <div className="flex flex-wrap gap-1.5">
          {filters.map(([k, l]) => <Link key={k} href={`${base}?filter=${k}`} className={`badge px-3 py-1 ${filter === k ? "bg-gray-900 text-white" : "bg-white ring-1 ring-gray-200"}`}>{l}</Link>)}
        </div>
        <p className="muted">Every report stays in this log for the whole lease, including Done items, with photos, comments and dates.</p>
        {shown.length === 0 && <p className="muted">Nothing here.</p>}
        {shown.map((i) => (
          <Link key={i.id} href={`${base}/${i.id}`} className="card block transition hover:border-brand-600">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{i.title}</p>
                <p className="muted">{ISSUE_TYPES[i.type]}{i.room ? ` · ${i.room}` : ""} · by {i.reporter_name} · {fmt(i.created_at)}</p>
              </div>
              <Badge tone={statusTone(i.status)}>{ISSUE_STATUS[i.status]}{i.status === "done" && i.confirmed_at ? " ✓" : ""}</Badge>
            </div>
            {i.description && <p className="mt-2 line-clamp-2 text-sm text-gray-700">{i.description}</p>}
            <p className="mt-1 text-xs text-gray-500">{photoCount(i.id)} attachment(s){i.done_at ? ` · Done ${fmt(i.done_at)}` : ""}</p>
          </Link>
        ))}
      </div>
      <div className="card h-fit space-y-3 lg:col-span-2">
        <h2 className="h2">Report an issue</h2>
        <Form url={`/api/rentals/${r.id}/issues`} multipart submitLabel="Send report">
          <div>
            <label className="label">Type</label>
            <select name="type" className="input" required defaultValue="maintenance">
              {Object.entries(ISSUE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label className="label">Room</label><input name="room" list="issue-rooms" className="input" placeholder="Optional" /><datalist id="issue-rooms">{ROOMS.map((x) => <option key={x} value={x} />)}</datalist></div>
          <div><label className="label">Title</label><input name="title" required className="input" placeholder="e.g. Kitchen tap leaking" /></div>
          <div><label className="label">What happened?</label><textarea name="description" rows={3} className="input" /></div>
          <FilePickers />
        </Form>
        <p className="muted">The other side gets an email right away.</p>
      </div>
    </div>
  );
}
