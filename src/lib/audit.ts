import { db, now, tx } from "./db";
import { canonical, sha256 } from "./hash";

const GENESIS = "0".repeat(64);

type AuditRow = { id: number; rental_id: number | null; chain_key: number; seq: number; actor_id: number | null; action: string; details: string; created_at: string; prev_hash: string; hash: string };

function entryHash(prev: string, e: { rental_id: number | null; actor_id: number | null; action: string; details: string; created_at: string; seq: number }) {
  return sha256(prev + canonical(e));
}

/**
 * Append an entry to the rental's hash-chained log. Each entry commits to the one before it in the same chain.
 * Every rental has its own chain, so busy rentals never block each other. Account-level events use chain 0.
 */
export async function audit(rentalId: number | null, actorId: number | null, action: string, details: Record<string, unknown> = {}) {
  const key = rentalId ?? 0;
  await tx(async () => {
    const d = db();
    await d.run("INSERT INTO chain_heads (chain_key, seq, hash) VALUES (?, 0, ?) ON CONFLICT (chain_key) DO NOTHING", key, GENESIS);
    const head = (await d.get("SELECT seq, hash FROM chain_heads WHERE chain_key = ? FOR UPDATE", key)) as { seq: number; hash: string };
    const seq = head.seq + 1;
    const e = { rental_id: rentalId, actor_id: actorId, action, details: canonical(details), created_at: now(), seq };
    const hash = entryHash(head.hash, e);
    await d.run(
      "INSERT INTO audit_log (rental_id, chain_key, seq, actor_id, action, details, created_at, prev_hash, hash) VALUES (?,?,?,?,?,?,?,?,?)",
      e.rental_id, key, seq, e.actor_id, e.action, e.details, e.created_at, head.hash, hash,
    );
    await d.run("UPDATE chain_heads SET seq = ?, hash = ? WHERE chain_key = ?", seq, hash, key);
  });
}

/** Walk one rental's chain and report the first broken link, if any. Also checks the stored head still matches. */
export async function verifyAuditChain(rentalId: number | null): Promise<{ ok: boolean; count: number; brokenAt?: number }> {
  const key = rentalId ?? 0;
  const rows = (await db().all("SELECT * FROM audit_log WHERE chain_key = ? ORDER BY seq", key)) as AuditRow[];
  let prev = GENESIS;
  let expectSeq = 1;
  for (const r of rows) {
    const h = entryHash(prev, { rental_id: r.rental_id, actor_id: r.actor_id, action: r.action, details: r.details, created_at: r.created_at, seq: r.seq });
    if (r.seq !== expectSeq || r.prev_hash !== prev || r.hash !== h) return { ok: false, count: rows.length, brokenAt: r.id };
    prev = r.hash;
    expectSeq++;
  }
  const head = (await db().get("SELECT seq, hash FROM chain_heads WHERE chain_key = ?", key)) as { seq: number; hash: string } | undefined;
  if (rows.length && (!head || head.seq !== rows.length || head.hash !== prev)) return { ok: false, count: rows.length, brokenAt: rows[rows.length - 1].id };
  return { ok: true, count: rows.length };
}

export async function rentalAudit(rentalId: number) {
  return (await db()
    .prepare(`SELECT a.*, u.name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id WHERE a.chain_key = ? ORDER BY a.seq DESC`)
    .all(rentalId)) as (AuditRow & { actor_name: string | null })[];
}
