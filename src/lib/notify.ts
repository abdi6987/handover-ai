import { db, now } from "./db";
import { getUser } from "./auth";
import { enqueue } from "./jobs";

export function appUrl(path = "") {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "") + path;
}

/** Store every email in the outbox (visible in the in-app test inbox); a background job sends it through Resend when configured. */
export async function sendEmail(to: string, subject: string, body: string, path?: string) {
  const link = path ? appUrl(path) : null;
  const info = await db().run("INSERT INTO outbox (to_email, subject, body, link, created_at) VALUES (?,?,?,?,?)", to.toLowerCase(), subject, body, link, now());
  if (process.env.RESEND_API_KEY) await enqueue("email", { outboxId: info.lastInsertRowid });
}

/** Send one outbox message. Throws on failure so the job is retried. */
export async function deliverEmail(outboxId: number) {
  const key = process.env.RESEND_API_KEY;
  const m = (await db().get("SELECT * FROM outbox WHERE id = ?", outboxId)) as { id: number; to_email: string; subject: string; body: string; link: string | null; delivered: number } | undefined;
  if (!key || !m || m.delivered) return;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">
      <p>${escapeHtml(m.body).replace(/\n/g, "<br>")}</p>
      ${m.link ? `<p><a href="${m.link}" style="background:#0f766e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open in Handover AI</a></p>` : ""}
      <p style="color:#888;font-size:12px">Handover AI · rental records both sides can trust</p></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    // The idempotency key stops a retried job from sending the same email twice.
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `outbox-${m.id}` },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "Handover AI <onboarding@resend.dev>", to: [m.to_email], subject: m.subject, html, text: `${m.body}\n\n${m.link ?? ""}` }),
  });
  if (!res.ok) {
    const err = `${res.status} ${await res.text()}`.slice(0, 500);
    await db().run("UPDATE outbox SET error = ? WHERE id = ?", err, m.id);
    throw new Error(err);
  }
  await db().run("UPDATE outbox SET delivered = 1, error = NULL WHERE id = ?", m.id);
}

/** Notify a rental participant by user id (no-op if they haven't joined yet). */
export async function notifyUser(userId: number | null, subject: string, body: string, path: string) {
  const u = await getUser(userId);
  if (u) await sendEmail(u.email, subject, body, path);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Normalise a phone number for wa.me (digits only, country code added for local numbers). */
export function waNumber(phone: string | null | undefined) {
  if (!phone) return "";
  const d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d.slice(1);
  if (d.startsWith("00")) return d.slice(2);
  const cc = process.env.DEFAULT_COUNTRY_CODE || "974";
  return d.length <= 8 ? cc + d : d;
}

/** WhatsApp link: straight to the person's chat when we know their number, otherwise a contact picker. */
export function whatsappLink(text: string, phone?: string | null) {
  return `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
}
