"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { LANGS, makeT, type Dict, type Lang, type TFn } from "@/lib/i18n/langs";
import { ACCEPT_MEDIA, ACCEPT_MEDIA_AUDIO } from "@/lib/formats";

type Resp = { error?: string; redirect?: string; [k: string]: unknown };

let directUploads: boolean | null = null; // learned from the first /api/uploads answer

function put(url: string, file: File, contentType: string, onProgress: (loaded: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => resolve(xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}

/**
 * In production, send each file straight to cloud storage first (no size limit, no load on the app server),
 * then submit the form with a short reference in its place. Locally, files go with the form as usual.
 */
async function stageFiles(fd: FormData, onProgress?: (p: number) => void): Promise<FormData | { error: string }> {
  const files = [...fd.entries()].filter((e): e is [string, File] => e[1] instanceof File && e[1].size > 0);
  if (!files.length || directUploads === false) return fd;
  const total = files.reduce((n, [, f]) => n + f.size, 0);
  const done = new Map<File, number>();
  const report = () => onProgress?.([...done.values()].reduce((a, b) => a + b, 0) / total);
  const out = new FormData();
  for (const [k, v] of fd.entries()) if (!(v instanceof File)) out.append(k, v);
  for (const [k, f] of files) {
    const r = await send("/api/uploads", "POST", { name: f.name, size: f.size, type: f.type });
    if (r.error) return { error: r.error };
    if (!r.direct) { directUploads = false; return fd; }
    directUploads = true;
    const ok = await put(String(r.url), f, String(r.contentType), (n) => { done.set(f, n); report(); });
    if (!ok) return { error: `Upload of ${f.name} failed. Check your connection and try again.` };
    done.set(f, f.size); report();
    out.append(k, `staged:${String(r.token)}`);
  }
  return out;
}

async function send(url: string, method: string, body: FormData | object | undefined, onProgress?: (p: number) => void): Promise<Resp> {
  if (body instanceof FormData) {
    const staged = await stageFiles(body, onProgress);
    if (!(staged instanceof FormData)) return staged;
    if (staged !== body) return sendNow(url, method, staged);
  }
  return sendNow(url, method, body, onProgress);
}

function sendNow(url: string, method: string, body: FormData | object | undefined, onProgress?: (p: number) => void): Promise<Resp> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.responseType = "json";
    if (onProgress) xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const r = (xhr.response ?? {}) as Resp;
      resolve(xhr.status >= 400 ? { error: r.error || `Request failed (${xhr.status})` } : r);
    };
    xhr.onerror = () => resolve({ error: "Network error, please try again" });
    if (body instanceof FormData) xhr.send(body);
    else if (body) { xhr.setRequestHeader("Content-Type", "application/json"); xhr.send(JSON.stringify(body)); }
    else xhr.send();
  });
}

/** Form that posts its fields as JSON (or multipart when it has files) and refreshes the page. */
export function Form({
  url, method = "POST", multipart = false, submitLabel, className = "", children, onDone, resetOnSuccess = true, buttonClass = "btn-primary", extra,
}: {
  url: string; method?: string; multipart?: boolean; submitLabel: string; className?: string; children: React.ReactNode;
  onDone?: (r: Resp) => void; resetOnSuccess?: boolean; buttonClass?: string; extra?: Record<string, string>;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
    let body: FormData | object = fd;
    if (!multipart) {
      const o: Record<string, unknown> = {};
      fd.forEach((v, k) => (o[k] = v));
      form.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((c) => c.name && (o[c.name] = c.checked));
      body = o;
    }
    setBusy(true); setError("");
    const r = await send(url, method, body, multipart ? setProgress : undefined);
    setBusy(false); setProgress(null);
    if (r.error) return setError(r.error);
    if (resetOnSuccess) form.reset();
    if (onDone) onDone(r);
    else if (r.redirect) router.push(r.redirect);
    router.refresh();
  }
  return (
    <form onSubmit={onSubmit} className={`space-y-3 ${className}`}>
      {children}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button className={buttonClass} disabled={busy}>
        {busy ? (progress !== null && progress < 1 ? t("Uploading {p}%", { p: Math.round(progress * 100) }) : t("Working...")) : submitLabel}
      </button>
    </form>
  );
}

export function ActionButton({ url, method = "POST", body, label, className = "btn-secondary", confirmText }: {
  url: string; method?: string; body?: object; label: string; className?: string; confirmText?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="inline-flex flex-col gap-1">
      <button className={className} disabled={busy} onClick={async () => {
        if (confirmText && !window.confirm(confirmText)) return;
        setBusy(true); setError("");
        const r = await send(url, method, body ?? {});
        setBusy(false);
        if (r.error) return setError(r.error);
        if (r.redirect) router.push(r.redirect);
        router.refresh();
      }}>{busy ? t("Working...") : t(label)}</button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}

export function LogoutButton() {
  const t = useT();
  const router = useRouter();
  return (
    <button className="rounded-lg px-2.5 py-1.5 hover:bg-gray-100" onClick={async () => {
      await send("/api/auth/logout", "POST", {});
      router.push("/"); router.refresh();
    }}>{t("Log out")}</button>
  );
}

export function RolePicker({ name, value, onChange }: { name: string; value: "tenant" | "owner"; onChange: (v: "tenant" | "owner") => void }) {
  const t = useT();
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["tenant", "owner"] as const).map((r) => (
        <label key={r} className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center text-sm font-semibold ${value === r ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-300"}`}>
          <input type="radio" name={name} value={r} checked={value === r} onChange={() => onChange(r)} className="sr-only" />
          {r === "owner" ? `🏢 ${t("Landlord")}` : `🏠 ${t("Tenant")}`}
        </label>
      ))}
    </div>
  );
}

export function AuthForm({ mode, invite, email, as = "tenant", staff }: { mode: "login" | "signup"; invite?: string; email?: string; as?: "tenant" | "owner"; staff?: string }) {
  const t = useT();
  const router = useRouter();
  const [role, setRole] = useState<"tenant" | "owner">(as);
  return (
    <Form url={`/api/auth/${mode}`} submitLabel={t(mode === "login" ? "Log in" : staff ? "Create staff account" : role === "owner" ? "Create landlord account" : "Create tenant account")} buttonClass="btn-primary w-full"
      extra={invite ? { invite } : staff ? { staff } : undefined} resetOnSuccess={false}
      onDone={(r) => { router.push(r.redirect || "/dashboard"); router.refresh(); }}>
      {mode === "signup" && (
        <>
          {!invite && !staff && <div><span className="label">{t("I am a")}</span><RolePicker name="accountType" value={role} onChange={setRole} /></div>}
          <div><label className="label">{t("Full name")}</label><input name="name" required className="input" autoComplete="name" /></div>
          <div><label className="label">{t("Phone (optional, for WhatsApp)")}</label><input name="phone" className="input" type="tel" autoComplete="tel" /></div>
        </>
      )}
      <div><label className="label">{t("Email")}</label><input name="email" type="email" required className="input" defaultValue={email} autoComplete="email" /></div>
      <div><label className="label">{t("Password")}</label><input name="password" type="password" required minLength={mode === "signup" ? 8 : 1} className="input" autoComplete={mode === "login" ? "current-password" : "new-password"} /></div>
    </Form>
  );
}

export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn-secondary" onClick={async () => {
      try { await navigator.clipboard.writeText(text); } catch { window.prompt("Copy this link", text); }
      setDone(true); setTimeout(() => setDone(false), 1500);
    }}>{done ? t("Copied") : t(label)}</button>
  );
}

export function InviteResult({ link, whatsapp, emailed }: { link: string; whatsapp: string; emailed?: boolean }) {
  const t = useT();
  return (
    <div className="space-y-3 rounded-xl bg-brand-50 p-4">
      <p className="text-sm font-medium text-brand-800">{emailed ? "Invite emailed. You can also send it on WhatsApp:" : "Send this invite link:"}</p>
      <p className="mono rounded-lg bg-white p-2">{link}</p>
      <div className="flex flex-wrap gap-2">
        <a href={whatsapp} target="_blank" rel="noreferrer" className="btn-whatsapp">{t("Send on WhatsApp")}</a>
        <CopyButton text={link} />
      </div>
    </div>
  );
}

export function InviteBox({ rentalId, other }: { rentalId: number; other: string }) {
  const t = useT();
  const [res, setRes] = useState<{ link: string; whatsapp: string; emailed: boolean } | null>(null);
  return (
    <div className="space-y-3">
      <Form url={`/api/rentals/${rentalId}/invite`} submitLabel={t(other === "owner" ? "Invite the landlord" : "Invite the tenant")} onDone={(r) => setRes({ link: r.link as string, whatsapp: r.whatsapp as string, emailed: !!(r as { emailed?: boolean }).emailed })}>
        <div>
          <label className="label">{t(other === "owner" ? "Landlord email (optional, leave empty to only get a link)" : "Tenant email (optional, leave empty to only get a link)")}</label>
          <input name="email" type="email" className="input" placeholder={t("name@example.com")} onChange={() => setRes(null)} />
        </div>
      </Form>
      {res && <InviteResult {...res} />}
    </div>
  );
}

export function NewRentalForm({ defaultRole = "owner" }: { defaultRole?: "owner" | "tenant" }) {
  const t = useT();
  const router = useRouter();
  const [created, setCreated] = useState<{ id: number; link: string; whatsapp: string; emailed: boolean } | null>(null);
  const [role, setRole] = useState<"owner" | "tenant">(defaultRole);
  if (created) return (
    <div className="space-y-4">
      <p className="font-semibold">{t("Rental created.")}</p>
      <InviteResult link={created.link} whatsapp={created.whatsapp} emailed={created.emailed} />
      <button className="btn-primary" onClick={() => router.push(`/rentals/${created.id}`)}>{t("Open the rental")}</button>
    </div>
  );
  const other = role === "owner" ? "tenant" : "owner";
  return (
    <Form url="/api/rentals" submitLabel={t("Create rental")} resetOnSuccess={false}
      onDone={(r) => { const inv = r.invite as { link: string; whatsapp: string; emailed: boolean }; setCreated({ id: r.id as number, ...inv }); }}>
      <div>
        <span className="label">{t("I am the")}</span>
        <RolePicker name="myRole" value={role} onChange={setRole} />
      </div>
      <div><label className="label">{t("Name")}</label><input name="name" required className="input" placeholder={t("e.g. Pearl Tower apt 1204")} /></div>
      <div><label className="label">{t("Address")}</label><input name="address" required className="input" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">{t("Monthly rent")}</label><input name="rent" type="number" min="0" step="any" className="input" /></div>
        <div><label className="label">{t("Currency")}</label><input name="currency" defaultValue="QAR" className="input" /></div>
        <div><label className="label">{t("Start date")}</label><input name="start_date" type="date" className="input" /></div>
        <div><label className="label">{t("End date")}</label><input name="end_date" type="date" className="input" /></div>
        <div><label className="label">{t("Deposit")}</label><input name="deposit" type="number" min="0" step="any" className="input" /></div>
      </div>
      <div><label className="label">{t("Lease terms (optional, can be edited until signing)")}</label><textarea name="terms" rows={3} className="input" /></div>
      <div>
        <label className="label">{t(other === "owner" ? "Landlord email (we'll send them an invite)" : "Tenant email (we'll send them an invite)")}</label>
        <input name="otherEmail" type="email" className="input" placeholder={t("Leave empty to share by WhatsApp instead")} />
      </div>
    </Form>
  );
}

export function UploadBox({ rentalId, context, rooms, defaultRoom }: { rentalId: number; context: "move_in" | "move_out"; rooms: string[]; defaultRoom?: string }) {
  const t = useT();
  const [count, setCount] = useState(0);
  const pick = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);
  const files = useRef<File[]>([]);
  const sync = () => {
    const all = [...(pick.current?.files ?? []), ...(cam.current?.files ?? [])];
    files.current = all; setCount(all.length);
  };
  return (
    <Form url={`/api/rentals/${rentalId}/media`} multipart submitLabel={count ? t("Upload {n} files", { n: count }) : t("Upload")} extra={{ context }}
      onDone={() => setCount(0)}>
      <div>
        <label className="label">{t("Room")}</label>
        <input name="room" list={`rooms-${context}`} required className="input" defaultValue={defaultRoom} placeholder={t("Pick or type a room")} />
        <datalist id={`rooms-${context}`}>{rooms.map((r) => <option key={r} value={r} />)}</datalist>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="btn-secondary cursor-pointer">
          {t("Take photo / video")}
          <input ref={cam} name="files" type="file" accept={ACCEPT_MEDIA} capture="environment" className="sr-only" onChange={sync} />
        </label>
        <label className="btn-secondary cursor-pointer">
          {t("Choose files")}
          <input ref={pick} name="files" type="file" accept={ACCEPT_MEDIA} multiple className="sr-only" onChange={sync} />
        </label>
      </div>
      {count > 0 && <p className="text-sm text-gray-600">{count} file{count > 1 ? "s" : ""} selected</p>}
    </Form>
  );
}

export function FilePickers({ name = "files", accept = ACCEPT_MEDIA }: { name?: string; accept?: string }) {
  const t = useT();
  const [count, setCount] = useState(0);
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const sync = () => setCount(refs.reduce((n, r) => n + (r.current?.files?.length ?? 0), 0));
  useEffect(() => {
    const form = refs[0].current?.form;
    const reset = () => setCount(0);
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  });
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <label className="btn-secondary cursor-pointer">{t("Take photo / video")}<input ref={refs[0]} name={name} type="file" accept={accept} capture="environment" className="sr-only" onChange={sync} /></label>
        <label className="btn-secondary cursor-pointer">{t("Attach files")}<input ref={refs[1]} name={name} type="file" accept={accept} multiple className="sr-only" onChange={sync} /></label>
      </div>
      {count > 0 && <p className="mt-1 text-sm text-gray-600">{count} file{count > 1 ? "s" : ""} attached</p>}
    </div>
  );
}

export function AutoRefresh({ ms = 4000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => { const t = setInterval(() => router.refresh(), ms); return () => clearInterval(t); }, [router, ms]);
  return null;
}

export function ItemResponse({ itemId, mine }: { itemId: number; mine: string | null }) {
  const t = useT();
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionButton url={`/api/comparison-items/${itemId}`} body={{ response: "agree" }} label={mine === "agree" ? "Agreed ✓" : "Agree"} className={mine === "agree" ? "btn-primary !py-1.5" : "btn-secondary !py-1.5"} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Reason (if disputing)")} className="input !w-48 !py-1.5" />
      <ActionButton url={`/api/comparison-items/${itemId}`} body={{ response: "dispute", note }} label={mine === "dispute" ? "Disputed" : "Dispute"} className="btn-danger !py-1.5" />
    </div>
  );
}

export function TabNav({ base, tabs }: { base: string; tabs: { href: string; label: string; badge?: number }[] }) {
  const path = usePathname();
  return (
    <nav className="no-print -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 text-sm">
      {tabs.map((t) => {
        const href = base + t.href;
        const active = t.href === "" ? path === base : path.startsWith(href);
        return (
          <Link key={t.href} href={href} className={`whitespace-nowrap rounded-full px-3.5 py-1.5 font-medium ${active ? "bg-brand-700 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"}`}>
            {t.label}{t.badge ? <span className={`ms-1.5 rounded-full px-1.5 text-xs ${active ? "bg-white/25" : "bg-amber-100 text-amber-800"}`}>{t.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function PrintButton() {
  const t = useT();
  return <button className="btn-secondary no-print" onClick={() => window.print()}>{t("Print / save as PDF")}</button>;
}

/** Collapsible "add rental" box that keeps its own open state across page refreshes. */
export function AddRentalBox({ title, defaultOpen, role }: { title: string; defaultOpen: boolean; role: "owner" | "tenant" }) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <button type="button" className="w-full text-start font-semibold" onClick={() => setOpen(!open)}>{open ? "−" : "+"} {t(title)}</button>
      {open && <div className="mt-4"><NewRentalForm defaultRole={role} /></div>}
    </div>
  );
}

export function StaffForm() {
  const t = useT();
  const [res, setRes] = useState<{ link: string; whatsapp: string; emailed: boolean } | null>(null);
  return (
    <div className="space-y-3">
      <Form url="/api/staff" submitLabel={t("Add and invite")} onDone={(r) => setRes({ link: r.link as string, whatsapp: r.whatsapp as string, emailed: !!r.emailed })}>
        <div><label className="label">{t("Name")}</label><input name="name" required className="input" /></div>
        <div><label className="label">{t("Role")}</label><input name="trade" list="trades" className="input" placeholder={t("e.g. Maintenance, Plumber, AC technician")} /><datalist id="trades">{["Maintenance", "Plumber", "Electrician", "AC technician", "Cleaner", "Building manager"].map((t) => <option key={t} value={t} />)}</datalist></div>
        <div><label className="label">{t("WhatsApp number")}</label><input name="phone" type="tel" className="input" placeholder="+974 5555 1234" /></div>
        <div><label className="label">{t("Email (optional)")}</label><input name="email" type="email" className="input" /></div>
      </Form>
      {res && <InviteResult {...res} />}
    </div>
  );
}

export function AssignForm({ issueId, staff, current }: { issueId: number; staff: { id: number; name: string; trade: string | null }[]; current: number | null }) {
  const t = useT();
  return (
    <Form url={`/api/issues/${issueId}`} multipart submitLabel={t("Assign")} buttonClass="btn-secondary" extra={{ action: "assign" }} resetOnSuccess={false}>
      <select name="staff_id" defaultValue={current ?? ""} className="input">
        <option value="">{t("Not assigned")}</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.trade ? ` (${s.trade})` : ""}</option>)}
      </select>
    </Form>
  );
}

/** Record a voice note in the browser and attach it to the surrounding form as a file input. */
export function VoiceRecorder({ name = "files" }: { name?: string }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const [state, setState] = useState<"idle" | "recording" | "done" | "unsupported">("idle");
  const [secs, setSecs] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);
  useEffect(() => {
    const form = input.current?.form;
    const reset = () => { setState("idle"); setUrl(null); setSecs(0); };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  });
  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return setState("unsupported");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = r.mimeType || "audio/webm";
        const file = new File(chunks, `voice-note-${Date.now()}.${mime.includes("mp4") ? "m4a" : "webm"}`, { type: mime.split(";")[0] });
        const dt = new DataTransfer(); dt.items.add(file);
        if (input.current) input.current.files = dt.files;
        setUrl(URL.createObjectURL(file)); setState("done");
      };
      rec.current = r; r.start(); setSecs(0); setState("recording");
    } catch { setState("unsupported"); }
  }
  return (
    <div className="rounded-xl border border-dashed border-gray-300 p-3">
      <input ref={input} type="file" name={name} className="hidden" />
      {state === "idle" && <button type="button" className="btn-secondary w-full" onClick={start}>{t("🎙️ Record a voice note")}</button>}
      {state === "recording" && <button type="button" className="btn-danger w-full" onClick={() => rec.current?.stop()}>{t("⏹ Stop recording (")}{secs}{t("s)")}</button>}
      {state === "done" && url && (
        <div className="space-y-1">
          <audio src={url} controls className="w-full" />
          <button type="button" className="text-xs font-semibold text-red-700" onClick={() => { if (input.current) input.current.value = ""; setUrl(null); setState("idle"); }}>{t("Delete and re-record")}</button>
        </div>
      )}
      {state === "unsupported" && <p className="text-xs text-gray-500">{t("Voice recording isn't available in this browser. You can attach an audio file instead.")}</p>}
    </div>
  );
}

export function IssueReportForm({ rentalId, role, currency, rooms, types, categories, urgency }: {
  rentalId: number; role: "owner" | "tenant"; currency: string; rooms: string[];
  types: Record<string, string>; categories: Record<string, { label: string; icon: string; hint: string }>; urgency: Record<string, string>;
}) {
  const t = useT();
  const [cat, setCat] = useState("other");
  const [urg, setUrg] = useState("normal");
  const other = role === "owner" ? "tenant" : "landlord";
  return (
    <Form url={`/api/rentals/${rentalId}/issues`} multipart submitLabel={t(other === "landlord" ? "Send to the landlord" : "Send to the tenant")} extra={{ category: cat, urgency: urg }} onDone={undefined}>
      <div>
        <span className="label">{t("What's the problem about?")}</span>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-3">
          {Object.entries(categories).map(([k, c]) => (
            <button type="button" key={k} onClick={() => setCat(k)} className={`rounded-xl border px-1.5 py-2 text-center text-xs font-medium ${cat === k ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-200 bg-white"}`}>
              <span className="block text-lg">{c.icon}</span>{t(c.label)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="label">{t("How urgent?")}</span>
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(urgency).map(([k, l]) => (
            <button type="button" key={k} onClick={() => setUrg(k)} className={`rounded-xl border py-2 text-sm font-semibold ${urg === k ? (k === "urgent" ? "border-red-500 bg-red-50 text-red-700" : "border-brand-600 bg-brand-50 text-brand-800") : "border-gray-200"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">{t("Type")}</label>
        <select name="type" className="input" required defaultValue={role === "owner" ? "upkeep" : "maintenance"}>
          {Object.entries(types).filter(([k]) => role === "owner" || k !== "upkeep").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div><label className="label">{t("Room / area")}</label><input name="room" list="issue-rooms" className="input" placeholder={t("Optional, e.g. Kitchen, whole apartment")} /><datalist id="issue-rooms">{rooms.map((x) => <option key={x} value={x} />)}</datalist></div>
      <div><label className="label">{t("Short title")}</label><input name="title" required className="input" placeholder={t("e.g. {what} in the {room}", { what: t(categories[cat].label), room: t(cat === "pests" ? "Kitchen" : "Bathroom") })} /></div>
      <div>
        <label className="label">{t("Describe it")}</label>
        <textarea name="description" rows={4} className="input" placeholder={categories[cat].hint} />
        <p className="mt-1 text-xs text-gray-500">{t("Photos are optional. Not everything can be photographed (smells, noise, pests at night), so describe it, record a voice note, or both.")}</p>
      </div>
      <VoiceRecorder />
      <FilePickers accept={ACCEPT_MEDIA_AUDIO} />
      {role === "owner" && (
        <div className="space-y-2 rounded-xl bg-gray-50 p-3">
          <p className="text-xs font-semibold text-gray-500">{t("Landlord only (the tenant doesn't see costs)")}</p>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">{t("Cost (")}{currency})</label><input name="repair_cost" type="number" step="any" min="0" className="input" /></div>
            <div><label className="label">{t("Paid to / note")}</label><input name="cost_note" className="input" placeholder={t("e.g. CoolAir Services")} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="already_done" value="true" /> {t("Already done (log finished work, e.g. AC service)")}</label>
        </div>
      )}
    </Form>
  );
}

const I18nCtx = createContext<{ lang: Lang; t: TFn }>({ lang: "en", t: makeT(null) });

export function I18nProvider({ lang, dict, children }: { lang: Lang; dict: Dict | null; children: React.ReactNode }) {
  return <I18nCtx.Provider value={{ lang, t: makeT(dict) }}>{children}</I18nCtx.Provider>;
}
export function useT() { return useContext(I18nCtx).t; }

export function LanguageMenu() {
  const { lang } = useContext(I18nCtx);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = LANGS.find((l) => l.code === lang) ?? LANGS[0];
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label="Language" className="flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-gray-100" onClick={() => setOpen(!open)}>
        <span className="text-lg leading-none">{cur.flag}</span><span className="text-xs font-semibold uppercase">{cur.code}</span>
      </button>
      {open && (
        <ul className="absolute end-0 z-30 mt-1 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {LANGS.map((l) => (
            <li key={l.code}>
              <button type="button" className={`flex w-full items-center gap-3 px-3 py-2 text-start text-sm hover:bg-gray-50 ${l.code === lang ? "font-bold text-brand-700" : ""}`}
                onClick={() => {
                  document.cookie = `lang=${l.code}; path=/; max-age=31536000; samesite=lax`;
                  setOpen(false); router.refresh();
                }}>
                <span className="text-xl leading-none">{l.flag}</span>{l.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
