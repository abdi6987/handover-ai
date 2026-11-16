import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { membershipsOf, staffJobs } from "@/lib/staff";
import { Badge, fmt } from "@/components/ui";
import { ISSUE_CATEGORIES, ISSUE_STATUS, ISSUE_TYPES } from "@/lib/types";

type Job = ReturnType<typeof staffJobs>[number];
const tone = (s: string) => (s === "done" ? "green" : s === "reported" ? "amber" : "blue") as "green" | "amber" | "blue";

function JobCard({ j }: { j: Job }) {
  return (
    <Link href={`/jobs/${j.id}`} className="card block !p-4 transition hover:border-brand-600">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{j.category ? `${ISSUE_CATEGORIES[j.category]?.icon} ` : ""}{j.title}{j.urgency === "urgent" && j.status !== "done" ? <span className="ml-2 badge bg-red-600 text-white">Urgent</span> : null}</p>
          <p className="muted">{j.rental_name}{j.room ? ` · ${j.room}` : ""} · {ISSUE_TYPES[j.type]}</p>
        </div>
        <Badge tone={tone(j.status)}>{ISSUE_STATUS[j.status]}</Badge>
      </div>
      <p className="mt-1 text-xs text-gray-500">{j.address} · reported {fmt(j.created_at)} by {j.reporter_name}{j.assignee_name ? ` · assigned to ${j.assignee_name}` : " · unassigned"}</p>
    </Link>
  );
}

export default async function StaffDashboard() {
  const user = await requireUser();
  const teams = membershipsOf(user.id);
  const jobs = staffJobs(user.id);
  const mine = jobs.filter((j) => j.assignee_user === user.id && j.status !== "done");
  const others = jobs.filter((j) => j.assignee_user !== user.id && j.status !== "done");
  const done = jobs.filter((j) => j.status === "done" && j.assignee_user === user.id).slice(0, 10);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Staff</p>
        <h1 className="h1">Hi {user.name.split(" ")[0]}</h1>
        <p className="muted">{teams.length ? `Working for ${teams.map((t) => t.owner_name).join(", ")}` : "You're not on any landlord's team yet. Open the invite link you were sent."}</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="card !p-3"><p className="muted">My open jobs</p><p className="text-2xl font-bold text-amber-700">{mine.length}</p></div>
        <div className="card !p-3"><p className="muted">Other open</p><p className="text-2xl font-bold">{others.length}</p></div>
        <div className="card !p-3"><p className="muted">Done by me</p><p className="text-2xl font-bold text-green-700">{jobs.filter((j) => j.status === "done" && j.done_by === user.id).length}</p></div>
      </div>
      <section className="space-y-2">
        <h2 className="h2">My jobs</h2>
        {mine.length === 0 ? <p className="muted">Nothing assigned to you right now.</p> : mine.map((j) => <JobCard key={j.id} j={j} />)}
      </section>
      <section className="space-y-2">
        <h2 className="h2">Other open requests and complaints</h2>
        {others.length === 0 ? <p className="muted">None.</p> : others.map((j) => <JobCard key={j.id} j={j} />)}
      </section>
      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="h2">Recently done</h2>
          {done.map((j) => <JobCard key={j.id} j={j} />)}
        </section>
      )}
    </div>
  );
}
