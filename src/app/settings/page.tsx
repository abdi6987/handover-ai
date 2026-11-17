import { requireUser } from "@/lib/auth";
import { getLang, getT, langInfo } from "@/lib/i18n";
import { pushReady, whatsappReady } from "@/lib/reminders";
import { Form, PushToggle } from "@/components/client";
import { Badge } from "@/components/ui";

export default async function Settings() {
  const t = await getT();
  const user = await requireUser();
  const lang = langInfo(await getLang());
  const vapid = process.env.VAPID_PUBLIC_KEY;
  return (
    <div className="space-y-4">
      <h1 className="h1">{t("Reminders")}</h1>
      <p className="muted">{t("Before each move-in and move-out we remind whoever has something to do: 7, 3 and 1 days before, on the day, then every 2 days until it's done.")}</p>
      <p className="muted">{t("Reminders are sent in the language you use the app in: {lang}.", { lang: lang.name })}</p>

      <div className="card space-y-1">
        <div className="flex items-center justify-between gap-2"><h2 className="h2">{t("Email")}</h2><Badge tone="green">{t("Always on")}</Badge></div>
        <p className="text-sm text-gray-700">{user.email}</p>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="h2">{t("WhatsApp")}</h2>
          <Badge tone={user.whatsapp_reminders ? "green" : "gray"}>{t(user.whatsapp_reminders ? "On" : "Off")}</Badge>
        </div>
        {!whatsappReady() && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t("WhatsApp sending isn't connected yet, so for now reminders are only shown under Messages.")}</p>}
        <Form url="/api/account/reminders" submitLabel={t("Save")} resetOnSuccess={false}>
          <div><label className="label">{t("WhatsApp number")}</label><input name="phone" type="tel" defaultValue={user.phone ?? ""} placeholder="+974 5555 1234" className="input" /></div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="whatsapp" defaultChecked={!!user.whatsapp_reminders} className="mt-1" /> {t("Send me inspection reminders on WhatsApp")}</label>
        </Form>
      </div>

      <div className="card space-y-3">
        <h2 className="h2">{t("Notifications on this device")}</h2>
        {vapid ? <PushToggle publicKey={vapid} /> : <p className="text-sm text-gray-600">{t("Phone and browser notifications aren't set up on this server yet.")}</p>}
        {vapid && !pushReady() && <p className="text-xs text-gray-500">{t("The server can't send them yet.")}</p>}
      </div>
    </div>
  );
}
