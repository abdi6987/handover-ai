import { getT } from "@/lib/i18n";

export async function LegalPage({ title, points }: { title: string; points: string[] }) {
  const t = await getT();
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-6">
      <h1 className="h1">{t(title)}</h1>
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{t("Draft for review: have a lawyer check this text before launch.")}</p>
      <ol className="card list-decimal space-y-3 ps-10 text-sm leading-relaxed text-gray-700">
        {points.map((p) => <li key={p}>{t(p)}</li>)}
      </ol>
      <p className="muted">{t("Last updated: 16 November 2026")}</p>
    </div>
  );
}
