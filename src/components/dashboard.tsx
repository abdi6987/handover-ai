import Link from "next/link";
import { getT } from "@/lib/i18n";
import { ActionButton, AddRentalBox } from "./client";
import { Badge, fmt } from "./ui";
import type { Todo } from "@/lib/dashboard";
import { ISSUE_STATUS, ISSUE_TYPES, type Issue } from "@/lib/types";

export async function Todos({ todos }: { todos: Todo[] }) {
  const t = await getT();
  return (
    <div className="card space-y-2">
      <h2 className="h2">{t("Needs your attention")}</h2>
      {todos.length === 0 ? <p className="muted">{t("You're all caught up. 🎉")}</p> : (
        <ul className="divide-y divide-gray-100">
          {todos.map((t, i) => (
            <li key={i}>
              <Link href={t.href} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-start gap-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${{ amber: "bg-amber-500", red: "bg-red-500", blue: "bg-blue-500", green: "bg-green-500" }[t.tone]}`} />
                  <span><span className="block font-medium">{t.title}</span><span className="muted">{t.text}</span></span>
                </span>
                <span className="text-gray-400">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export async function IssueList({ issues, title }: { issues: (Issue & { reporter_name: string; rental_name: string })[]; title: string }) {
  const t = await getT();
  return (
    <div className="card space-y-2">
      <h2 className="h2">{title}</h2>
      {issues.length === 0 ? <p className="muted">{t("No open issues.")}</p> : (
        <ul className="divide-y divide-gray-100">
          {issues.slice(0, 8).map((i) => (
            <li key={i.id}>
              <Link href={`/rentals/${i.rental_id}/issues/${i.id}`} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span><span className="font-medium">{i.title}</span><span className="block text-xs text-gray-500">{t(ISSUE_TYPES[i.type])} · {i.rental_name} · {fmt(i.created_at, false)}</span></span>
                <Badge tone={i.status === "reported" ? "amber" : i.status === "disputed" ? "red" : "blue"}>{t(ISSUE_STATUS[i.status])}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export async function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  const t = await getT();
  return <div className="card !p-3"><p className="muted">{t(label)}</p><p className={`text-2xl font-bold ${tone ?? ""}`}>{value}</p></div>;
}

export async function AddRental({ role, open }: { role: "owner" | "tenant"; open: boolean }) {
  return <AddRentalBox title={role === "owner" ? "Add a property" : "Add your rental"} defaultOpen={open} role={role} />;
}

export async function SwitchView({ to }: { to: "owner" | "tenant" }) {
  return <ActionButton url="/api/account" body={{ accountType: to }} label={to === "owner" ? "Switch to landlord dashboard" : "Switch to tenant dashboard"} className="text-sm font-semibold text-brand-700" />;
}
