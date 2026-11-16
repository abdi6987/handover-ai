import Link from "next/link";
import { loadRental } from "@/lib/page";
import { db } from "@/lib/db";
import { fullySigned, mediaFor } from "@/lib/rentals";
import { ActionButton, AutoRefresh, ItemResponse, UploadBox } from "@/components/client";
import { Badge, fmt, groupByRoom, MediaGrid, MediaTile } from "@/components/ui";
import { ROOMS, type Media } from "@/lib/types";

type Comparison = { id: number; created_at: string; status: string; summary: string | null; error: string | null; model: string | null; demo: number; created_by: number };
type Item = { id: number; room: string; title: string; description: string; severity: string; classification: string; confidence: number; before_media: string; after_media: string; related_issue_id: number | null; status: string; owner_response: string | null; tenant_response: string | null; owner_note: string | null; tenant_note: string | null };

const CLASS: Record<string, [string, "red" | "amber" | "blue" | "gray" | "green"]> = {
  new_damage: ["New damage", "red"], reported_during_lease: ["Reported during lease", "blue"],
  wear_and_tear: ["Normal wear and tear", "green"], cleaning: ["Cleaning", "amber"], unclear: ["Unclear", "gray"],
};

export default async function MoveOut({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, rental: r, role, names } = await loadRental(id);
  if (!fullySigned(r)) return (
    <div className="card space-y-2">
      <h2 className="h2">Move-out</h2>
      <p className="muted">Move-out photos and the AI comparison open once the lease is signed by both sides.</p>
      <Link href={`/rentals/${r.id}/lease`} className="btn-secondary">Go to lease</Link>
    </div>
  );
  const after = mediaFor(r.id, "move_out");
  const before = mediaFor(r.id, "move_in");
  const all = new Map<number, Media>([...before, ...after].map((m) => [m.id, m]));
  const comps = db().prepare("SELECT * FROM comparisons WHERE rental_id = ? ORDER BY id DESC").all(r.id) as Comparison[];
  const latest = comps[0];
  const items = latest ? db().prepare("SELECT * FROM comparison_items WHERE comparison_id = ? ORDER BY CASE classification WHEN 'new_damage' THEN 0 ELSE 1 END, room").all(latest.id) as Item[] : [];
  const rooms = [...new Set([...before.map((m) => m.room || "Other"), ...ROOMS])];
  const refs = (json: string) => (JSON.parse(json || "[]") as { media_id: number; t: number | null }[]).filter((x) => all.has(x.media_id));
  return (
    <div className="space-y-4">
      {latest?.status === "running" && <AutoRefresh />}
      {!r.ended_at && (
        <div className="card space-y-3">
          <h2 className="h2">Move-out photos and videos</h2>
          <p className="muted">Use the same room names as move-in so the AI can compare like with like. Try to take the same angles.</p>
          <UploadBox rentalId={r.id} context="move_out" rooms={rooms} />
        </div>
      )}
      {[...groupByRoom(after).entries()].map(([room, items]) => (
        <div key={room} className="card space-y-3">
          <h3 className="font-semibold">{room} <span className="muted">({items.length})</span></h3>
          <MediaGrid media={items} names={names} canDelete={(m) => m.uploaded_by === user.id && !r.ended_at} />
        </div>
      ))}

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">AI comparison</h2>
          {after.length > 0 && latest?.status !== "running" && !r.ended_at && <ActionButton url={`/api/rentals/${r.id}/compare`} label={latest ? "Run again" : "Compare with move-in"} className="btn-primary" />}
        </div>
        <p className="muted">The AI compares move-out pictures room by room with the sealed move-in set and checks the issue log, so already-reported problems and normal wear and tear aren&apos;t blamed as new damage. It&apos;s a suggestion: both sides agree or dispute each item.</p>
        {!latest && <p className="text-sm">{after.length ? "Ready to compare." : "Upload move-out pictures first."}</p>}
        {latest?.status === "running" && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">⏳ Comparing… this can take a minute or two per room. This page updates by itself.</p>}
        {latest?.status === "failed" && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">Comparison failed: {latest.error}</p>}
        {latest?.status === "done" && (
          <div className="space-y-3">
            {latest.demo ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Demo mode: no AI key is configured, so this report contains placeholder text, not a real analysis.</p> : null}
            <p className="text-xs text-gray-500">Run {fmt(latest.created_at)} by {names.get(latest.created_by)} · model {latest.model}</p>
            {latest.summary && <div className="whitespace-pre-line rounded-lg bg-gray-50 p-3 text-sm">{latest.summary}</div>}
            {items.length === 0 && <p className="text-sm font-medium text-green-800">No differences found. 🎉</p>}
            {items.map((it) => {
              const [label, t] = CLASS[it.classification] ?? CLASS.unclear;
              const mine = role === "owner" ? it.owner_response : it.tenant_response;
              return (
                <div key={it.id} className="space-y-2 rounded-xl border border-gray-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{it.title}</span>
                    <Badge tone={t}>{label}</Badge>
                    <Badge tone={it.severity === "major" ? "red" : it.severity === "moderate" ? "amber" : "gray"}>{it.severity}</Badge>
                    <span className="text-xs text-gray-500">{it.room} · confidence {Math.round((it.confidence || 0) * 100)}%</span>
                  </div>
                  <p className="text-sm text-gray-700">{it.description}</p>
                  {it.related_issue_id && <Link href={`/rentals/${r.id}/issues/${it.related_issue_id}`} className="text-sm font-semibold text-brand-700">Related issue report →</Link>}
                  <div className="grid grid-cols-2 gap-2">
                    <div><p className="mb-1 text-xs font-semibold text-gray-500">BEFORE (sealed)</p>{refs(it.before_media).map((x, k) => <MediaTile key={k} m={all.get(x.media_id)!} t={x.t} />)}</div>
                    <div><p className="mb-1 text-xs font-semibold text-gray-500">AFTER</p>{refs(it.after_media).map((x, k) => <MediaTile key={k} m={all.get(x.media_id)!} t={x.t} />)}</div>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-600">
                    <span>Owner: {it.owner_response ?? "no answer"}{it.owner_note ? ` (“${it.owner_note}”)` : ""}</span>
                    <span>Tenant: {it.tenant_response ?? "no answer"}{it.tenant_note ? ` (“${it.tenant_note}”)` : ""}</span>
                  </div>
                  {!r.ended_at && <ItemResponse itemId={it.id} mine={mine} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {role === "owner" && !r.ended_at && latest?.status === "done" && (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">When move-out is settled, close the rental. Everything stays saved as a read-only record.</p>
          <ActionButton url={`/api/rentals/${r.id}/end`} label="Close rental" confirmText="Close this rental? Uploads and responses will stop." />
        </div>
      )}
    </div>
  );
}
