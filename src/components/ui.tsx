import Link from "next/link";
import { ActionButton } from "./client";
import { whatsappLink } from "@/lib/notify";
import type { Media } from "@/lib/types";

const TZ = process.env.DISPLAY_TZ || "Asia/Qatar";
export function fmt(iso: string | null | undefined, withTime = true) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", ...(withTime ? { timeStyle: "short" } : {}), timeZone: TZ }).format(new Date(iso));
}
export function fmtMoney(n: number | null | undefined, cur = "QAR") {
  if (n === null || n === undefined) return "—";
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${cur}`;
}
export function fmtSize(b: number) {
  return b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.ceil(b / 1e3)} KB`;
}

const TONES = {
  gray: "bg-gray-100 text-gray-700", green: "bg-green-100 text-green-800", amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800", blue: "bg-blue-100 text-blue-800", teal: "bg-brand-100 text-brand-800",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`badge ${TONES[tone]}`}>{children}</span>;
}

export function WhatsAppLink({ text, label = "Send on WhatsApp", className = "btn-whatsapp" }: { text: string; label?: string; className?: string }) {
  return <a href={whatsappLink(text)} target="_blank" rel="noreferrer" className={className}>{label}</a>;
}

export function MediaTile({ m, uploader, canDelete, t }: { m: Media; uploader?: string; canDelete?: boolean; t?: number | null }) {
  const src = `/api/media/${m.id}/file`;
  return (
    <figure className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <a href={src} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-gray-100">
        {m.kind === "photo" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={m.original_name} loading="lazy" className="h-full w-full object-cover" />
        ) : m.kind === "video" ? (
          <video src={`${src}#t=${t ?? 0.5}`} controls preload="metadata" playsInline className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full place-items-center text-sm text-gray-500">📄 {m.original_name}</span>
        )}
      </a>
      <figcaption className="space-y-0.5 p-2 text-xs text-gray-600">
        <div className="truncate font-medium text-gray-800">{m.kind === "video" ? "🎥 " : ""}{m.title && m.context === "document" ? m.title : m.original_name}{t != null ? ` @ ${t}s` : ""}</div>
        <div>{uploader ? `${uploader} · ` : ""}{fmt(m.uploaded_at)}</div>
        <div className="mono text-[10px] text-gray-400" title={`SHA-256 ${m.sha256}`}>#{m.sha256.slice(0, 12)} · {fmtSize(m.size)}</div>
        {canDelete && <ActionButton url={`/api/media/${m.id}`} method="DELETE" label="Remove" className="mt-1 text-xs font-semibold text-red-700" confirmText="Remove this file? The removal is logged." />}
      </figcaption>
    </figure>
  );
}

export function MediaGrid({ media, names, canDelete }: { media: Media[]; names: Map<number, string>; canDelete?: (m: Media) => boolean }) {
  if (!media.length) return <p className="muted">Nothing uploaded yet.</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {media.map((m) => <MediaTile key={m.id} m={m} uploader={names.get(m.uploaded_by)} canDelete={canDelete?.(m)} />)}
    </div>
  );
}

export function groupByRoom(media: Media[]) {
  const map = new Map<string, Media[]>();
  for (const m of media) {
    const k = m.room || "Other";
    map.set(k, [...(map.get(k) ?? []), m]);
  }
  return map;
}

export function EmptyState({ title, children, href, cta }: { title: string; children?: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 p-6 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="muted mt-1">{children}</div>}
      {href && cta && <Link href={href} className="btn-primary mt-3">{cta}</Link>}
    </div>
  );
}
