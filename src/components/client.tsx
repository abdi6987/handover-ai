"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Resp = { error?: string; redirect?: string; [k: string]: unknown };

function send(url: string, method: string, body: FormData | object | undefined, onProgress?: (p: number) => void): Promise<Resp> {
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
        {busy ? (progress !== null && progress < 1 ? `Uploading ${Math.round(progress * 100)}%` : "Working...") : submitLabel}
      </button>
    </form>
  );
}

export function ActionButton({ url, method = "POST", body, label, className = "btn-secondary", confirmText }: {
  url: string; method?: string; body?: object; label: string; className?: string; confirmText?: string;
}) {
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
      }}>{busy ? "Working..." : label}</button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button className="rounded-lg px-2.5 py-1.5 hover:bg-gray-100" onClick={async () => {
      await send("/api/auth/logout", "POST", {});
      router.push("/"); router.refresh();
    }}>Log out</button>
  );
}

export function RolePicker({ name, value, onChange }: { name: string; value: "tenant" | "owner"; onChange: (v: "tenant" | "owner") => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["tenant", "owner"] as const).map((r) => (
        <label key={r} className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center text-sm font-semibold ${value === r ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-300"}`}>
          <input type="radio" name={name} value={r} checked={value === r} onChange={() => onChange(r)} className="sr-only" />
          {r === "owner" ? "🏢 Landlord" : "🏠 Tenant"}
        </label>
      ))}
    </div>
  );
}

export function AuthForm({ mode, invite, email, as = "tenant" }: { mode: "login" | "signup"; invite?: string; email?: string; as?: "tenant" | "owner" }) {
  const router = useRouter();
  const [role, setRole] = useState<"tenant" | "owner">(as);
  return (
    <Form url={`/api/auth/${mode}`} submitLabel={mode === "login" ? "Log in" : `Create ${role === "owner" ? "landlord" : "tenant"} account`} buttonClass="btn-primary w-full"
      extra={invite ? { invite } : undefined} resetOnSuccess={false}
      onDone={(r) => { router.push(r.redirect || "/dashboard"); router.refresh(); }}>
      {mode === "signup" && (
        <>
          {!invite && <div><span className="label">I am a</span><RolePicker name="accountType" value={role} onChange={setRole} /></div>}
          <div><label className="label">Full name</label><input name="name" required className="input" autoComplete="name" /></div>
          <div><label className="label">Phone (optional, for WhatsApp)</label><input name="phone" className="input" type="tel" autoComplete="tel" /></div>
        </>
      )}
      <div><label className="label">Email</label><input name="email" type="email" required className="input" defaultValue={email} autoComplete="email" /></div>
      <div><label className="label">Password</label><input name="password" type="password" required minLength={mode === "signup" ? 8 : 1} className="input" autoComplete={mode === "login" ? "current-password" : "new-password"} /></div>
    </Form>
  );
}

export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn-secondary" onClick={async () => {
      try { await navigator.clipboard.writeText(text); } catch { window.prompt("Copy this link", text); }
      setDone(true); setTimeout(() => setDone(false), 1500);
    }}>{done ? "Copied" : label}</button>
  );
}

export function InviteResult({ link, whatsapp, emailed }: { link: string; whatsapp: string; emailed?: boolean }) {
  return (
    <div className="space-y-3 rounded-xl bg-brand-50 p-4">
      <p className="text-sm font-medium text-brand-800">{emailed ? "Invite emailed. You can also send it on WhatsApp:" : "Send this invite link:"}</p>
      <p className="mono rounded-lg bg-white p-2">{link}</p>
      <div className="flex flex-wrap gap-2">
        <a href={whatsapp} target="_blank" rel="noreferrer" className="btn-whatsapp">Send on WhatsApp</a>
        <CopyButton text={link} />
      </div>
    </div>
  );
}

export function InviteBox({ rentalId, other }: { rentalId: number; other: string }) {
  const [res, setRes] = useState<{ link: string; whatsapp: string; emailed: boolean } | null>(null);
  return (
    <div className="space-y-3">
      <Form url={`/api/rentals/${rentalId}/invite`} submitLabel={`Invite the ${other}`} onDone={(r) => setRes({ link: r.link as string, whatsapp: r.whatsapp as string, emailed: !!(r as { emailed?: boolean }).emailed })}>
        <div>
          <label className="label">{other === "owner" ? "Owner" : "Tenant"} email (optional, leave empty to only get a link)</label>
          <input name="email" type="email" className="input" placeholder="name@example.com" onChange={() => setRes(null)} />
        </div>
      </Form>
      {res && <InviteResult {...res} />}
    </div>
  );
}

export function NewRentalForm({ defaultRole = "owner" }: { defaultRole?: "owner" | "tenant" }) {
  const router = useRouter();
  const [created, setCreated] = useState<{ id: number; link: string; whatsapp: string; emailed: boolean } | null>(null);
  const [role, setRole] = useState<"owner" | "tenant">(defaultRole);
  if (created) return (
    <div className="space-y-4">
      <p className="font-semibold">Rental created.</p>
      <InviteResult link={created.link} whatsapp={created.whatsapp} emailed={created.emailed} />
      <button className="btn-primary" onClick={() => router.push(`/rentals/${created.id}`)}>Open the rental</button>
    </div>
  );
  const other = role === "owner" ? "tenant" : "owner";
  return (
    <Form url="/api/rentals" submitLabel="Create rental" resetOnSuccess={false}
      onDone={(r) => { const inv = r.invite as { link: string; whatsapp: string; emailed: boolean }; setCreated({ id: r.id as number, ...inv }); }}>
      <div>
        <span className="label">I am the</span>
        <RolePicker name="myRole" value={role} onChange={setRole} />
      </div>
      <div><label className="label">Name</label><input name="name" required className="input" placeholder="e.g. Pearl Tower apt 1204" /></div>
      <div><label className="label">Address</label><input name="address" required className="input" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Monthly rent</label><input name="rent" type="number" min="0" step="any" className="input" /></div>
        <div><label className="label">Currency</label><input name="currency" defaultValue="QAR" className="input" /></div>
        <div><label className="label">Start date</label><input name="start_date" type="date" className="input" /></div>
        <div><label className="label">End date</label><input name="end_date" type="date" className="input" /></div>
        <div><label className="label">Deposit</label><input name="deposit" type="number" min="0" step="any" className="input" /></div>
      </div>
      <div><label className="label">Lease terms (optional, can be edited until signing)</label><textarea name="terms" rows={3} className="input" /></div>
      <div>
        <label className="label">{other === "owner" ? "Owner" : "Tenant"} email (we&apos;ll send them an invite)</label>
        <input name="otherEmail" type="email" className="input" placeholder="Leave empty to share by WhatsApp instead" />
      </div>
    </Form>
  );
}

export function UploadBox({ rentalId, context, rooms, defaultRoom }: { rentalId: number; context: "move_in" | "move_out"; rooms: string[]; defaultRoom?: string }) {
  const [count, setCount] = useState(0);
  const pick = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);
  const files = useRef<File[]>([]);
  const sync = () => {
    const all = [...(pick.current?.files ?? []), ...(cam.current?.files ?? [])];
    files.current = all; setCount(all.length);
  };
  return (
    <Form url={`/api/rentals/${rentalId}/media`} multipart submitLabel={count ? `Upload ${count} file${count > 1 ? "s" : ""}` : "Upload"} extra={{ context }}
      onDone={() => setCount(0)}>
      <div>
        <label className="label">Room</label>
        <input name="room" list={`rooms-${context}`} required className="input" defaultValue={defaultRoom} placeholder="Pick or type a room" />
        <datalist id={`rooms-${context}`}>{rooms.map((r) => <option key={r} value={r} />)}</datalist>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="btn-secondary cursor-pointer">
          Take photo / video
          <input ref={cam} name="files" type="file" accept="image/*,video/*" capture="environment" className="sr-only" onChange={sync} />
        </label>
        <label className="btn-secondary cursor-pointer">
          Choose files
          <input ref={pick} name="files" type="file" accept="image/*,video/*" multiple className="sr-only" onChange={sync} />
        </label>
      </div>
      {count > 0 && <p className="text-sm text-gray-600">{count} file{count > 1 ? "s" : ""} selected</p>}
    </Form>
  );
}

export function FilePickers({ name = "files", accept = "image/*,video/*" }: { name?: string; accept?: string }) {
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
        <label className="btn-secondary cursor-pointer">Take photo / video<input ref={refs[0]} name={name} type="file" accept={accept} capture="environment" className="sr-only" onChange={sync} /></label>
        <label className="btn-secondary cursor-pointer">Attach files<input ref={refs[1]} name={name} type="file" accept={accept} multiple className="sr-only" onChange={sync} /></label>
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
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionButton url={`/api/comparison-items/${itemId}`} body={{ response: "agree" }} label={mine === "agree" ? "Agreed ✓" : "Agree"} className={mine === "agree" ? "btn-primary !py-1.5" : "btn-secondary !py-1.5"} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (if disputing)" className="input !w-48 !py-1.5" />
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
            {t.label}{t.badge ? <span className={`ml-1.5 rounded-full px-1.5 text-xs ${active ? "bg-white/25" : "bg-amber-100 text-amber-800"}`}>{t.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function PrintButton() {
  return <button className="btn-secondary no-print" onClick={() => window.print()}>Print / save as PDF</button>;
}

/** Collapsible "add rental" box that keeps its own open state across page refreshes. */
export function AddRentalBox({ title, defaultOpen, role }: { title: string; defaultOpen: boolean; role: "owner" | "tenant" }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <button type="button" className="w-full text-left font-semibold" onClick={() => setOpen(!open)}>{open ? "−" : "+"} {title}</button>
      {open && <div className="mt-4"><NewRentalForm defaultRole={role} /></div>}
    </div>
  );
}
