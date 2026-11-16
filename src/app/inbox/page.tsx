import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmt, Badge } from "@/components/ui";

type Mail = { id: number; subject: string; body: string; link: string | null; created_at: string; delivered: number; error: string | null };

export default async function Inbox() {
  const user = await requireUser();
  const mails = db().prepare("SELECT * FROM outbox WHERE to_email = ? ORDER BY id DESC LIMIT 100").all(user.email) as Mail[];
  const live = !!process.env.RESEND_API_KEY;
  return (
    <div className="space-y-4">
      <h1 className="h1">Emails sent to you</h1>
      <p className="muted">{live ? "Emails are delivered to your inbox. This is a copy of what was sent." : "Email sending isn't connected yet (add a Resend key), so notifications are shown here instead."}</p>
      {mails.length === 0 && <p className="muted">No emails yet.</p>}
      {mails.map((m) => (
        <div key={m.id} className="card space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{m.subject}</h2>
            <span className="text-xs text-gray-500">{fmt(m.created_at)} {m.delivered ? <Badge tone="green">delivered</Badge> : m.error ? <Badge tone="red">failed</Badge> : null}</span>
          </div>
          <p className="whitespace-pre-line text-sm text-gray-700">{m.body}</p>
          {m.link && <a href={m.link.replace(/^https?:\/\/[^/]+/, "")} className="text-sm font-semibold text-brand-700">Open →</a>}
        </div>
      ))}
    </div>
  );
}
