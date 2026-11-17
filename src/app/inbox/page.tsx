import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { db } from "@/lib/db";
import { fmt, Badge } from "@/components/ui";

type Note = { id: number; channel: string; title: string; body: string; link: string | null; status: string; error: string | null; created_at: Date };
type Mail = { id: number; subject: string; body: string; link: string | null; created_at: string; delivered: number; error: string | null };

export default async function Inbox() {
  const t = await getT();
  const user = await requireUser({ allowUnverified: true });
  const mails = await db().prepare("SELECT * FROM outbox WHERE to_email = ? ORDER BY id DESC LIMIT 100").all(user.email) as Mail[];
  const live = !!process.env.RESEND_API_KEY;
  const notes = await db().prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50").all(user.id) as Note[];
  return (
    <div className="space-y-4">
      <h1 className="h1">{t("Emails sent to you")}</h1>
      <p className="muted">{t(live ? "Emails are delivered to your inbox. This is a copy of what was sent." : "Email sending isn't connected yet (add a Resend key), so notifications are shown here instead.")}</p>
      {notes.length > 0 && (
        <div className="card space-y-2">
          <h2 className="h2">{t("WhatsApp and phone notifications")}</h2>
          <ul className="divide-y divide-gray-100">
            {notes.map((n) => (
              <li key={n.id} className="space-y-0.5 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={n.channel === "whatsapp" ? "green" : "blue"}>{n.channel === "whatsapp" ? "WhatsApp" : t("Notification")}</Badge>
                  <span className="font-medium">{n.title}</span>
                  <span className="text-xs text-gray-500">{fmt(n.created_at.toISOString())}</span>
                  {n.status === "test" ? <Badge>{t("not sent: not connected yet")}</Badge> : n.status === "failed" ? <Badge tone="red">{t("failed")}</Badge> : n.status === "sent" ? <Badge tone="green">{t("sent")}</Badge> : null}
                </div>
                <p className="text-gray-700">{n.body}</p>
                {n.link && <a href={n.link} className="font-semibold text-brand-700">{t("Open →")}</a>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {mails.length === 0 && <p className="muted">{t("No emails yet.")}</p>}
      {mails.map((m) => (
        <div key={m.id} className="card space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{m.subject}</h2>
            <span className="text-xs text-gray-500">{fmt(m.created_at)} {m.delivered ? <Badge tone="green">delivered</Badge> : m.error ? <Badge tone="red">failed</Badge> : null}</span>
          </div>
          <p className="whitespace-pre-line text-sm text-gray-700">{m.body}</p>
          {m.link && <a href={m.link.replace(/^https?:\/\/[^/]+/, "")} className="text-sm font-semibold text-brand-700">{t("Open →")}</a>}
        </div>
      ))}
    </div>
  );
}
