import { notFound } from "next/navigation";
import { loadRental } from "@/lib/page";
import { db } from "@/lib/db";
import { ActionButton, Form } from "@/components/client";
import { Badge, fmt, fmtMoney } from "@/components/ui";
import { BILL_CATEGORIES } from "@/lib/types";

type Bill = { id: number; category: keyof typeof BILL_CATEGORIES; amount: number; period: string; due_date: string | null; paid_at: string | null; note: string | null; file_id: number | null };
const COLORS: Record<string, string> = { electricity: "bg-amber-400", water: "bg-sky-500", internet: "bg-violet-500", other: "bg-gray-400" };

export default async function Spending({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, rental: r, role } = await loadRental(id);
  if (role !== "tenant") notFound(); // private to the tenant
  const bills = db().prepare(`SELECT b.*, (SELECT m.id FROM media m WHERE m.context='bill' AND m.ref_id=b.id AND m.deleted_at IS NULL LIMIT 1) file_id
    FROM bills b WHERE b.rental_id = ? AND b.user_id = ? ORDER BY b.period DESC, b.id DESC`).all(r.id, user.id) as Bill[];
  const months = [...new Set(bills.map((b) => b.period))].sort().slice(-12);
  const total = (p: string, c?: string) => bills.filter((b) => b.period === p && (!c || b.category === c)).reduce((s, b) => s + b.amount, 0);
  const max = Math.max(1, ...months.map((m) => total(m)));
  const sum = (c?: string) => bills.filter((b) => !c || b.category === c).reduce((s, b) => s + b.amount, 0);
  const unpaid = bills.filter((b) => !b.paid_at).reduce((s, b) => s + b.amount, 0);
  const cur = r.currency;
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">🔒 Private: only you can see your spending. The owner never sees this page.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Object.entries(BILL_CATEGORIES).map(([k, v]) => (
          <div key={k} className="card !p-3"><p className="muted">{v}</p><p className="text-lg font-bold">{fmtMoney(sum(k), cur)}</p></div>
        ))}
        <div className="card !p-3"><p className="muted">Unpaid</p><p className={`text-lg font-bold ${unpaid ? "text-red-700" : ""}`}>{fmtMoney(unpaid, cur)}</p></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-3 lg:col-span-2">
          <h2 className="h2">Monthly spending</h2>
          {months.length === 0 ? <p className="muted">Add your first bill to see the chart.</p> : (
            <div className="space-y-2">
              {months.map((m) => (
                <div key={m} className="flex items-center gap-2 text-sm">
                  <span className="w-16 shrink-0 text-gray-500">{m}</span>
                  <div className="flex h-5 flex-1 overflow-hidden rounded bg-gray-100">
                    {Object.keys(BILL_CATEGORIES).map((c) => <div key={c} className={COLORS[c]} style={{ width: `${(total(m, c) / max) * 100}%` }} title={`${BILL_CATEGORIES[c as keyof typeof BILL_CATEGORIES]}: ${total(m, c)}`} />)}
                  </div>
                  <span className="w-24 shrink-0 text-right font-medium">{fmtMoney(total(m), "")}</span>
                </div>
              ))}
              <div className="flex flex-wrap gap-3 pt-1 text-xs text-gray-600">{Object.entries(BILL_CATEGORIES).map(([k, v]) => <span key={k} className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-sm ${COLORS[k]}`} />{v}</span>)}</div>
            </div>
          )}
          <h3 className="pt-2 font-semibold">Bills</h3>
          <ul className="divide-y divide-gray-100">
            {bills.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <span className="font-medium">{BILL_CATEGORIES[b.category]}</span> <span className="text-gray-500">· {b.period}{b.due_date ? ` · due ${fmt(b.due_date, false)}` : ""}</span>
                  {b.note && <p className="text-xs text-gray-500">{b.note}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{fmtMoney(b.amount, cur)}</span>
                  {b.paid_at ? <Badge tone="green">Paid</Badge> : <Badge tone="red">Unpaid</Badge>}
                  {b.file_id && <a href={`/api/media/${b.file_id}/file`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-700">Bill</a>}
                  <ActionButton url={`/api/bills/${b.id}`} method="PATCH" body={{ paid: !b.paid_at }} label={b.paid_at ? "Mark unpaid" : "Mark paid"} className="text-xs font-semibold text-brand-700" />
                  <ActionButton url={`/api/bills/${b.id}`} method="DELETE" label="Delete" className="text-xs font-semibold text-red-700" confirmText="Delete this bill?" />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="card h-fit space-y-3">
          <h2 className="h2">Add a bill</h2>
          <Form url={`/api/rentals/${r.id}/bills`} multipart submitLabel="Save bill">
            <div><label className="label">Category</label><select name="category" className="input">{Object.entries(BILL_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">Amount ({cur})</label><input name="amount" type="number" step="any" min="0" required className="input" /></div>
              <div><label className="label">Month</label><input name="period" type="month" required defaultValue={new Date().toISOString().slice(0, 7)} className="input" /></div>
            </div>
            <div><label className="label">Due date</label><input name="due_date" type="date" className="input" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="paid" value="true" /> Already paid</label>
            <div><label className="label">Note</label><input name="note" className="input" placeholder="Optional, e.g. meter reading" /></div>
            <div><label className="label">Photo or PDF of the bill</label><input name="file" type="file" accept="image/*,application/pdf" className="block w-full text-sm" /></div>
          </Form>
        </div>
      </div>
    </div>
  );
}
