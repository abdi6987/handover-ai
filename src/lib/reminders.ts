import webpush from "web-push";
import { db } from "./db";
import { enqueue } from "./jobs";
import { appUrl, sendEmail, waNumber } from "./notify";
import { tFor } from "./i18n/dicts";
import { daysBetween, dueDate, dueText, localDate, reportDone, reportRow, type Stage } from "./inspections";
import type { Rental } from "./types";

/**
 * Reminders that keep chasing until an inspection is finished.
 * - Due dates: move-in on the lease start date, move-out on the end date.
 * - Sent 7, 3 and 1 days before, on the day, then every 2 days while overdue (for up to 2 weeks).
 * - Only the person who has something to do is reminded, with what exactly: upload and rate, approve, or sign.
 * - Finished means both sides signed that stage's inspection report.
 * - By email always, by WhatsApp when the person turned it on, and by push on every device they turned it on for.
 * - Only between 9:00 and 21:00 Qatar time. reminders_sent makes each reminder go out once, even with many workers.
 */
const BEFORE = [7, 3, 1, 0];
const OVERDUE_EVERY = 2;
const OVERDUE_MAX = 14;
const HOURS = { from: 9, to: 21 };

export function reminderDay(days: number) {
  if (days >= 0) return BEFORE.includes(days);
  return -days % OVERDUE_EVERY === 0 && -days <= OVERDUE_MAX;
}

type Action = "upload" | "approve" | "sign";
type Todo = { userId: number; stage: Stage; action: Action };

/** Who has to do what for this rental and stage. Empty when the stage is finished or not open yet. */
export async function todos(r: Rental, stage: Stage): Promise<Todo[]> {
  if (!r.owner_id || !r.tenant_id || r.ended_at) return [];
  const row = await reportRow(r.id, stage);
  if (reportDone(row)) return [];
  if (stage === "move_in") {
    if (r.movein_status === "open" || r.movein_status === "changes_requested") return [{ userId: r.tenant_id, stage, action: "upload" }];
    if (r.movein_status === "submitted") return [{ userId: r.owner_id, stage, action: "approve" }];
  } else if (!(r.owner_signed_at && r.tenant_signed_at)) return [];
  return (["owner", "tenant"] as const)
    .filter((side) => !row?.[`${side}_signed_at`])
    .map((side) => ({ userId: side === "owner" ? r.owner_id! : r.tenant_id!, stage, action: stage === "move_out" && !row ? "upload" : "sign" }));
}

const ACTION_TEXT: Record<Stage, Record<Action, string>> = {
  move_in: {
    upload: "Add photos of every room and rate each item in the checklist, then send the move-in inspection for approval.",
    approve: "The move-in inspection is waiting for your approval.",
    sign: "Please check and sign the move-in inspection report.",
  },
  move_out: {
    upload: "Do the move-out inspection: photos of every room, a rating for each item, then sign the report.",
    approve: "",
    sign: "Please check and sign the move-out inspection report.",
  },
};

type Recipient = { id: number; email: string; name: string; phone: string | null; lang: string | null; whatsapp_reminders: boolean };

/** Find everything due around today and send what's scheduled. Safe to run as often as you like. */
export async function reminderTick(at = new Date()) {
  const tz = process.env.DISPLAY_TZ || "Asia/Qatar";
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(at));
  if (process.env.REMINDERS === "off" || hour < HOURS.from || hour >= HOURS.to) return 0;
  const today = localDate(at, tz);
  const shift = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const from = shift(-OVERDUE_MAX), to = shift(Math.max(...BEFORE));
  let sent = 0;
  for (const stage of ["move_in", "move_out"] as const) {
    const col = stage === "move_in" ? "start_date" : "end_date";
    let after = 0;
    for (;;) {
      // Page through by id; the partial date index keeps this cheap with hundreds of thousands of rentals.
      const page = (await db().all(
        `SELECT r.* FROM rentals r WHERE r.ended_at IS NULL AND r.${col} IS NOT NULL AND substr(r.${col}, 1, 10) BETWEEN ? AND ? AND r.id > ?
           AND r.owner_id IS NOT NULL AND r.tenant_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM inspection_reports x WHERE x.rental_id = r.id AND x.stage = ? AND x.owner_signed_at IS NOT NULL AND x.tenant_signed_at IS NOT NULL)
         ORDER BY r.id LIMIT 500`,
        from, to, after, stage,
      )) as Rental[];
      for (const r of page) {
        const due = dueDate(r, stage)!;
        const days = daysBetween(today, due);
        if (!reminderDay(days)) continue;
        for (const todo of await todos(r, stage)) if (await remind(r, todo, days)) sent++;
      }
      if (page.length < 500) break;
      after = page[page.length - 1].id;
    }
  }
  return sent;
}

async function remind(r: Rental, todo: Todo, days: number) {
  const key = `${todo.stage}:${days}`;
  const claim = await db().run("INSERT INTO reminders_sent (rental_id, user_id, key) VALUES (?,?,?) ON CONFLICT DO NOTHING", r.id, todo.userId, key);
  if (!claim.changes) return false;
  const u = (await db().get("SELECT id, email, name, phone, lang, whatsapp_reminders FROM users WHERE id = ?", todo.userId)) as Recipient | undefined;
  if (!u) return false;
  const t = tFor(u.lang);
  const what = t(todo.stage === "move_in" ? "Move-in inspection" : "Move-out inspection");
  const title = t("{what} for \"{property}\": {due}", { what, property: r.name, due: dueText(days, t) });
  const action = t(ACTION_TEXT[todo.stage][todo.action]);
  const path = todo.action === "sign" ? `/rentals/${r.id}/report/${todo.stage === "move_in" ? "move-in" : "move-out"}` : `/rentals/${r.id}/${todo.stage === "move_in" ? "move-in" : "move-out"}`;
  const body = `${t("Hi {name},", { name: u.name })}\n\n${action} ${dueText(days, t)}.\n\n${t("We'll keep reminding you until it's done. Choose how you get reminders: {link}", { link: appUrl("/settings") })}`;
  await sendEmail(u.email, title, body, path);
  if (u.whatsapp_reminders && u.phone)
    await queueNotification(u.id, "whatsapp", title, `${action} ${dueText(days, t)}.`, path, { name: u.name, property: r.name, text: `${action} ${dueText(days, t)}.`, lang: u.lang ?? "en", to: waNumber(u.phone) });
  const devices = (await db().get("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?", u.id)) as { n: number };
  if (devices.n) await queueNotification(u.id, "push", title, action, path);
  return true;
}

/** A setting counts only when it's filled in: the setup script creates secrets with the placeholder "unset". */
const set = (v: string | undefined) => !!v && v !== "unset";
export const whatsappReady = () => set(process.env.WHATSAPP_TOKEN) && set(process.env.WHATSAPP_PHONE_ID);
export const pushReady = () => set(process.env.VAPID_PUBLIC_KEY) && set(process.env.VAPID_PRIVATE_KEY);

/** Keep a copy (shown under Messages) and send it in the background. Without credentials it's kept as a test copy. */
async function queueNotification(userId: number, channel: "whatsapp" | "push", title: string, body: string, path: string, params?: Record<string, string>) {
  const ready = channel === "whatsapp" ? whatsappReady() : pushReady();
  const { lastInsertRowid: id } = await db().run(
    "INSERT INTO notifications (user_id, channel, title, body, link, params, status) VALUES (?,?,?,?,?,?,?)",
    userId, channel, title, body, path, params ? JSON.stringify(params) : null, ready ? "queued" : "test",
  );
  if (ready) await enqueue(channel, { notificationId: id });
}

type NotificationRow = { id: number; user_id: number; channel: string; title: string; body: string; link: string | null; params: string | null; status: string };

/** Send one WhatsApp reminder with the approved message template. Throws so the job is retried. */
export async function deliverWhatsApp(id: number) {
  const n = (await db().get("SELECT * FROM notifications WHERE id = ?", id)) as NotificationRow | undefined;
  if (!n || n.status === "sent" || !whatsappReady()) return;
  const p = JSON.parse(n.params ?? "{}") as Record<string, string>;
  const version = process.env.WHATSAPP_API_VERSION || "v23.0";
  const res = await fetch(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: p.to,
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE || "inspection_reminder",
        language: { code: p.lang || "en" },
        components: [
          { type: "body", parameters: [{ type: "text", text: p.name }, { type: "text", text: p.property }, { type: "text", text: p.text }] },
          // The template's button links to https://<your domain>/{{1}}; this fills in the page.
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: (n.link ?? "/").replace(/^\//, "") }] },
        ],
      },
    }),
  });
  if (!res.ok) {
    const err = `${res.status} ${await res.text()}`.slice(0, 500);
    await db().run("UPDATE notifications SET status = 'failed', error = ? WHERE id = ?", err, id);
    throw new Error(`WhatsApp ${err}`);
  }
  await db().run("UPDATE notifications SET status = 'sent', error = NULL WHERE id = ?", id);
}

/** Send one push reminder to each of the person's devices. Devices that unsubscribed are forgotten. */
export async function deliverPush(id: number) {
  const n = (await db().get("SELECT * FROM notifications WHERE id = ?", id)) as NotificationRow | undefined;
  if (!n || n.status === "sent" || !pushReady()) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || appUrl(), process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const subs = (await db().all("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?", n.user_id)) as { endpoint: string; p256dh: string; auth: string }[];
  const payload = JSON.stringify({ title: n.title, body: n.body, url: n.link ?? "/" });
  let ok = 0;
  const errors: string[] = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86_400, timeout: 20_000 });
      ok++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db().run("DELETE FROM push_subscriptions WHERE endpoint = ?", s.endpoint);
      else errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  await db().run("UPDATE notifications SET status = ?, error = ? WHERE id = ?", ok || !errors.length ? "sent" : "failed", errors.join("; ").slice(0, 500) || null, id);
  if (!ok && errors.length) throw new Error(`Push failed: ${errors[0]}`);
}
