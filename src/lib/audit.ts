import { db, now } from "./db";
import { canonical, sha256 } from "./hash";

const GENESIS = "0".repeat(64);

type AuditRow = { id: number; rental_id: number | null; actor_id: number | null; action: string; details: string; created_at: string; prev_hash: string; hash: string };

function entryHash(prev: string, e: { rental_id: number | null; actor_id: number | null; action: string; details: string; created_at: string }) {
  return sha256(prev + canonical(e));
}

/** Append an entry to the global hash-chained audit log. Each entry commits to the previous one. */
export function audit(rentalId: number | null, actorId: number | null, action: string, details: Record<string, unknown> = {}) {
  const d = db();
  const tx = d.transaction(() => {
    const last = d.prepare("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1").get() as { hash: string } | undefined;
    const prev = last?.hash ?? GENESIS;
    const e = { rental_id: rentalId, actor_id: actorId, action, details: canonical(details), created_at: now() };
    const hash = entryHash(prev, e);
    d.prepare("INSERT INTO audit_log (rental_id, actor_id, action, details, created_at, prev_hash, hash) VALUES (?,?,?,?,?,?,?)")
      .run(e.rental_id, e.actor_id, e.action, e.details, e.created_at, prev, hash);
  });
  tx();
}

/** Walk the whole chain and report the first broken link, if any. */
export function verifyAuditChain(): { ok: boolean; count: number; brokenAt?: number } {
  const rows = db().prepare("SELECT * FROM audit_log ORDER BY id").all() as AuditRow[];
  let prev = GENESIS;
  for (const r of rows) {
    const h = entryHash(prev, { rental_id: r.rental_id, actor_id: r.actor_id, action: r.action, details: r.details, created_at: r.created_at });
    if (r.prev_hash !== prev || r.hash !== h) return { ok: false, count: rows.length, brokenAt: r.id };
    prev = r.hash;
  }
  return { ok: true, count: rows.length };
}

export function rentalAudit(rentalId: number) {
  return db()
    .prepare(`SELECT a.*, u.name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id WHERE a.rental_id = ? ORDER BY a.id DESC`)
    .all(rentalId) as (AuditRow & { actor_name: string | null })[];
}
