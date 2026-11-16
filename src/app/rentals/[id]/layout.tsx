import { loadRental } from "@/lib/page";
import { getT } from "@/lib/i18n";
import { db } from "@/lib/db";
import { stage } from "@/lib/rentals";
import { TabNav } from "@/components/client";
import { Badge } from "@/components/ui";

const STEPS = ["Both joined", "Move-in approved", "Lease signed", "Lease active", "Moved out"];

export default async function RentalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  const { rental, role } = await loadRental(id);
  const s = stage(rental);
  const open = (db().prepare("SELECT COUNT(*) n FROM issues WHERE rental_id = ? AND status != 'done'").get(rental.id) as { n: number }).n;
  const tabs = [
    { href: "", label: t("Overview") },
    { href: "/move-in", label: t("Move-in") },
    { href: "/lease", label: t("Lease") },
    { href: "/issues", label: t("Issues & repairs"), badge: open },
    { href: "/move-out", label: t("Move-out") },
    { href: "/documents", label: t("Documents") },
    ...(role === "tenant" ? [{ href: "/spending", label: t("My spending") }] : []),
    { href: "/timeline", label: t("Timeline") },
  ];
  return (
    <div className="space-y-4">
      <div className="no-print">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="h1">{rental.name}</h1>
          <Badge tone={role === "owner" ? "blue" : "teal"}>{t(role === "owner" ? "You're the owner" : "You're the tenant")}</Badge>
        </div>
        <p className="muted">{rental.address}</p>
        <ol className="mt-3 flex gap-1">
          {STEPS.map((label, i) => (
            <li key={label} className="flex-1">
              <div className={`h-1.5 rounded-full ${i < s.step ? "bg-brand-600" : i === s.step ? "bg-brand-600/40" : "bg-gray-200"}`} />
              <p className={`mt-1 hidden text-[11px] sm:block ${i <= s.step ? "text-gray-800" : "text-gray-400"}`}>{t(label)}</p>
            </li>
          ))}
        </ol>
      </div>
      <TabNav base={`/rentals/${rental.id}`} tabs={tabs} />
      <div>{children}</div>
    </div>
  );
}
