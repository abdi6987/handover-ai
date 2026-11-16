"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Form, useT } from "./client";
import { COUNTRIES, PROPERTY_COUNTS } from "@/lib/countries";

/** 0 = too short, 1 weak, 2 ok, 3 strong */
export function passwordScore(pw: string) {
  if (pw.length < 8) return 0;
  let s = 0;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s <= 1 ? 1 : s === 2 ? 2 : 3;
}

export function PasswordField({ name = "password", label = "Password", autoComplete = "new-password", strength = false }: { name?: string; label?: string; autoComplete?: string; strength?: boolean }) {
  const t = useT();
  const [show, setShow] = useState(false);
  const [pw, setPw] = useState("");
  const score = passwordScore(pw);
  const meta = [["Too short", "bg-red-500", "text-red-700"], ["Weak", "bg-orange-500", "text-orange-700"], ["OK", "bg-amber-400", "text-amber-700"], ["Strong", "bg-green-600", "text-green-700"]][score];
  return (
    <div>
      <label className="label" htmlFor={name}>{t(label)}</label>
      <div className="relative">
        <input id={name} name={name} type={show ? "text" : "password"} required minLength={strength ? 8 : 1} className="input pe-20" autoComplete={autoComplete} value={pw} onChange={(e) => setPw(e.target.value)} />
        <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 end-0 px-3 text-sm font-semibold text-brand-700" aria-label={t(show ? "Hide password" : "Show password")}>
          {show ? "🙈 " + t("Hide") : "👁 " + t("Show")}
        </button>
      </div>
      {strength && pw && (
        <div className="mt-1.5">
          <div className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < Math.max(score, 1) ? meta[1] : "bg-gray-200"}`} />)}</div>
          <p className={`mt-1 text-xs ${meta[2]}`}>{t(meta[0])}{score < 3 ? ` · ${t("Use 12+ characters with upper and lower case, a number and a symbol.")}` : ""}</p>
        </div>
      )}
    </div>
  );
}

export function PhoneField({ required = false }: { required?: boolean }) {
  const t = useT();
  return (
    <div>
      <label className="label" htmlFor="phone">{t(required ? "WhatsApp number" : "Phone (optional, for WhatsApp)")}</label>
      <div className="flex gap-2" dir="ltr">
        <select name="phoneCode" defaultValue="974" className="input !w-32 shrink-0" aria-label={t("Country code")}>
          {COUNTRIES.map((c) => <option key={c.iso} value={c.dial}>{c.flag} +{c.dial}</option>)}
        </select>
        <input id="phone" name="phone" type="tel" inputMode="tel" className="input" autoComplete="tel-national" placeholder="5555 1234" required={required} />
      </div>
    </div>
  );
}

function Terms() {
  const t = useT();
  return (
    <label className="flex items-start gap-2 text-sm text-gray-700">
      <input type="checkbox" name="terms" required className="mt-1 h-4 w-4 accent-brand-700" />
      <span>{t("I agree to the")} <Link href="/terms" target="_blank" className="font-semibold text-brand-700">{t("Terms of use")}</Link> {t("and the")} <Link href="/privacy" target="_blank" className="font-semibold text-brand-700">{t("Privacy policy")}</Link>.</span>
    </label>
  );
}

export function GoogleButton({ as, invite }: { as: "owner" | "tenant"; invite?: string }) {
  const t = useT();
  const q = new URLSearchParams({ as, ...(invite ? { invite } : {}) });
  return (
    <a href={`/api/auth/google?${q}`} className="btn-secondary w-full">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
      {t("Continue with Google")}
    </a>
  );
}

export function SignupForm({ role, invite, staff, email, google }: { role: "owner" | "tenant"; invite?: string; staff?: string; email?: string; google?: boolean }) {
  const t = useT();
  const router = useRouter();
  const owner = role === "owner" && !invite && !staff;
  const label = staff ? "Create staff account" : role === "owner" ? "Create landlord account" : "Create tenant account";
  return (
    <div className="space-y-4">
      {google && !staff && (
        <>
          <GoogleButton as={role} invite={invite} />
          <div className="flex items-center gap-3 text-xs text-gray-400"><span className="h-px flex-1 bg-gray-200" />{t("or with email")}<span className="h-px flex-1 bg-gray-200" /></div>
        </>
      )}
      <Form url="/api/auth/signup" submitLabel={t(label)} buttonClass="btn-primary w-full" resetOnSuccess={false}
        extra={{ accountType: role, ...(invite ? { invite } : {}), ...(staff ? { staff } : {}) }}
        onDone={(r) => { router.push(r.redirect || "/dashboard"); router.refresh(); }}>
        <div><label className="label" htmlFor="name">{t("Full name")}</label><input id="name" name="name" required className="input" autoComplete="name" /></div>
        <div><label className="label" htmlFor="email">{t("Email")}</label><input id="email" name="email" type="email" required className="input" defaultValue={email} autoComplete="email" placeholder="name@example.com" /></div>
        <PhoneField required={owner} />
        {owner && (
          <>
            <div><label className="label" htmlFor="company">{t("Company or agency (optional)")}</label><input id="company" name="company" className="input" autoComplete="organization" placeholder={t("Leave empty if you rent out your own property")} /></div>
            <div>
              <span className="label">{t("How many properties do you manage?")}</span>
              <div className="grid grid-cols-5 gap-1.5">
                {PROPERTY_COUNTS.map((c, i) => (
                  <label key={c} className="cursor-pointer">
                    <input type="radio" name="propertyCount" value={c} defaultChecked={i === 0} className="peer sr-only" />
                    <span className="block rounded-xl border border-gray-300 py-2 text-center text-sm font-semibold peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-800">{c}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label" htmlFor="country">{t("Country")}</label>
                <select id="country" name="country" defaultValue="Qatar" className="input">{COUNTRIES.map((c) => <option key={c.iso} value={c.name}>{c.flag} {c.name}</option>)}</select></div>
              <div><label className="label" htmlFor="city">{t("City")}</label><input id="city" name="city" className="input" autoComplete="address-level2" placeholder={t("e.g. Doha")} /></div>
            </div>
          </>
        )}
        {role === "tenant" && !invite && !staff && (
          <div>
            <label className="label" htmlFor="inviteCode">{t("Invite code or link (optional)")}</label>
            <input id="inviteCode" name="inviteCode" className="input" autoComplete="off" placeholder={t("Paste the link your landlord sent you")} />
            <p className="mt-1 text-xs text-gray-500">{t("Got an invite from your landlord? Paste it here to join your home straight away. No invite? You can add your home after signing up.")}</p>
          </div>
        )}
        <PasswordField strength />
        <Terms />
      </Form>
    </div>
  );
}

export function LoginForm({ invite, staff, google }: { invite?: string; staff?: string; google?: boolean }) {
  const t = useT();
  const router = useRouter();
  return (
    <div className="space-y-4">
      {google && !staff && (
        <>
          <GoogleButton as="tenant" invite={invite} />
          <div className="flex items-center gap-3 text-xs text-gray-400"><span className="h-px flex-1 bg-gray-200" />{t("or with email")}<span className="h-px flex-1 bg-gray-200" /></div>
        </>
      )}
      <Form url="/api/auth/login" submitLabel={t("Log in")} buttonClass="btn-primary w-full" resetOnSuccess={false}
        extra={invite ? { invite } : staff ? { staff } : undefined}
        onDone={(r) => { router.push(r.redirect || "/dashboard"); router.refresh(); }}>
        <div><label className="label" htmlFor="email">{t("Email")}</label><input id="email" name="email" type="email" required className="input" autoComplete="email" /></div>
        <PasswordField autoComplete="current-password" />
        <div className="text-end"><Link href="/forgot-password" className="text-sm font-semibold text-brand-700">{t("Forgot password?")}</Link></div>
      </Form>
    </div>
  );
}

export function VerifyForm({ next, email }: { next: string; email: string }) {
  const t = useT();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <Form url="/api/auth/verify" submitLabel={t("Confirm email")} buttonClass="btn-primary w-full" resetOnSuccess={false} extra={{ next }}
        onDone={(r) => { router.push(r.redirect || "/dashboard"); router.refresh(); }}>
        <div>
          <label className="label" htmlFor="code">{t("6-digit code sent to {email}", { email })}</label>
          <input id="code" name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} dir="ltr"
            className="input text-center font-mono text-2xl tracking-[0.5em]" placeholder="••••••" autoFocus />
        </div>
      </Form>
      <button type="button" disabled={busy} className="text-sm font-semibold text-brand-700 disabled:opacity-50" onClick={async () => {
        setBusy(true); setNote("");
        const r = await fetch("/api/auth/verify/resend", { method: "POST" }).then((x) => x.json()).catch(() => ({ error: "Network error, please try again" }));
        setBusy(false); setNote(r.error ? r.error : t("A new code is on its way. Check your inbox and spam folder."));
      }}>{t("Send a new code")}</button>
      {note && <p className="text-sm text-gray-600">{note}</p>}
    </div>
  );
}

export function ForgotForm() {
  const t = useT();
  const [sent, setSent] = useState("");
  if (sent) return <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{t("If {email} has an account, a reset link is on its way. It works for 1 hour. Check your spam folder too.", { email: sent })}</p>;
  return (
    <Form url="/api/auth/forgot" submitLabel={t("Send reset link")} buttonClass="btn-primary w-full" resetOnSuccess={false}
      onDone={() => setSent((document.getElementById("femail") as HTMLInputElement)?.value || "")}>
      <div><label className="label" htmlFor="femail">{t("Email")}</label><input id="femail" name="email" type="email" required className="input" autoComplete="email" /></div>
    </Form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const t = useT();
  const router = useRouter();
  return (
    <Form url="/api/auth/reset" submitLabel={t("Save new password")} buttonClass="btn-primary w-full" resetOnSuccess={false} extra={{ token }}
      onDone={(r) => { router.push(r.redirect || "/dashboard"); router.refresh(); }}>
      <PasswordField label="New password" strength />
    </Form>
  );
}
