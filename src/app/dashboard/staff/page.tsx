import Link from "next/link";
import { getT } from "@/lib/i18n";
import { requireUser } from "@/lib/auth";
import { membershipsOf, staffJobs } from "@/lib/staff";
import { Badge, fmt } from "@/components/ui";
import { ISSUE_CATEGORIES, ISSUE_STATUS, ISSUE_TYPES } from "@/lib/types";

type Job = ReturnType<typeof staffJobs>[number];
const tone = (s: string) => (s === "done" ? "green" : s === "reported" ? "amber" : "blue") as "green" | "amber" | "blue";

async function JobCard({ j }: { j: Job }) {
  const t = await getT();
  return (
    <Link href={`/jobs/${j.id}`} className="card block !p-4 transition hover:border-brand-600">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{j.category ? `${ISSUE_CATEGORIES[j.category]?.icon} ` : ""}{j.title}{j.urgency === "urgent" && j.status !== "done" ? <span className="ms-2 badge bg-red-600 text-white">{t("Urgent")}</span> : null}</p>
          <p className="muted">{j.rental_name}{j.room ? ` · ${t(j.room)}` : ""} · {t(ISSUE_TYPES[j.type])}</p>
        </div>
        <Badge tone={tone(j.status)}>{t(ISSUE_STATUS[j.status])}</Badge>
      </div>
      <p className="mt-1 text-xs text-gray-500">{j.address} · {t("Reported {date} by {name}", { date: fmt(j.created_at), name: j.reporter_name })} · {j.assignee_name ? t("Assigned to {name}", { name: j.assignee_name }) : t("unassigned")}</p>
    </Link>
  );
}

export default async function StaffDashboard() {
  const t = await getT();
  const user = await requireUser();
  const teams = membershipsOf(user.id);
  const jobs = staffJobs(user.id);
  const mine = jobs.filter((j) => j.assignee_user === user.id && j.status !== "done");
  const others = jobs.filter((j) => j.assignee_user !== user.id && j.status !== "done");
  const done = jobs.filter((j) => j.status === "done" && j.assignee_user === user.id).slice(0, 10);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{t("Staff")}</p>
        <h1 className="h1">{t("Hi")} {user.name.split(" ")[0]}</h1>
        <p className="muted">{teams.length ? t("Working for {names}", { names: teams.map((x) => x.owner_name).join(", ") }) : t("You're not on any landlord's team yet. Open the invite link you were sent.")}</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="card !p-3"><p className="muted">{t("My open jobs")}</p><p className="text-2xl font-bold text-amber-700">{mine.length}</p></div>
        <div className="card !p-3"><p className="muted">{t("Other open")}</p><p className="text-2xl font-bold">{others.length}</p></div>
        <div className="card !p-3"><p className="muted">{t("Done by me")}</p><p className="text-2xl font-bold text-green-700">{jobs.filter((j) => j.status === "done" && j.done_by === user.id).length}</p></div>
      </div>
      <section className="space-y-2">
        <h2 className="h2">{t("My jobs")}</h2>
        {mine.length === 0 ? <p className="muted">{t("Nothing assigned to you right now.")}</p> : mine.map((j) => <JobCard key={j.id} j={j} />)}
      </section>
      <section className="space-y-2">
        <h2 className="h2">{t("Other open requests and complaints")}</h2>
        {others.length === 0 ? <p className="muted">{t("None.")}</p> : others.map((j) => <JobCard key={j.id} j={j} />)}
      </section>
      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="h2">{t("Recently done")}</h2>
          {done.map((j) => <JobCard key={j.id} j={j} />)}
        </section>
      )}
    </div>
  );
}
