import { db, now } from "./db";
import { getUser } from "./auth";

export function appUrl(path = "") {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "") + path;
}

/** Store every email in the outbox (visible in the in-app test inbox) and send through Resend when configured. */
export async function sendEmail(to: string, subject: string, body: string, path?: string) {
  const link = path ? appUrl(path) : null;
  const info = db().prepare("INSERT INTO outbox (to_email, subject, body, link, created_at) VALUES (?,?,?,?,?)")
    .run(to.toLowerCase(), subject, body, link, now());
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  try {
    const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">
      <p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>
      ${link ? `<p><a href="${link}" style="background:#0f766e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open in Handover AI</a></p>` : ""}
      <p style="color:#888;font-size:12px">Handover AI · rental records both sides can trust</p></div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || "Handover AI <onboarding@resend.dev>", to: [to], subject, html, text: `${body}\n\n${link ?? ""}` }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    db().prepare("UPDATE outbox SET delivered = 1 WHERE id = ?").run(info.lastInsertRowid);
  } catch (e) {
    db().prepare("UPDATE outbox SET error = ? WHERE id = ?").run(String(e).slice(0, 500), info.lastInsertRowid);
  }
}

/** Notify a rental participant by user id (no-op if they haven't joined yet). */
export async function notifyUser(userId: number | null, subject: string, body: string, path: string) {
  const u = getUser(userId);
  if (u) await sendEmail(u.email, subject, body, path);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function whatsappLink(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
