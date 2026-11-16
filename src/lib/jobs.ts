import { db } from "./db";

/**
 * Background jobs, stored in Postgres so nothing is lost when a server restarts.
 * - JOB_MODE=worker (production): the web app only queues jobs; the separate worker service (`npm run worker`)
 *   claims them with FOR UPDATE SKIP LOCKED, so any number of workers can run side by side.
 * - Otherwise (dev, tests): the web process runs each job right after queueing it.
 * Failed jobs are retried with growing delays, then marked failed.
 */
export type JobKind = "preview" | "email" | "compare";
type Job = { id: number; kind: JobKind; payload: Record<string, unknown>; attempts: number };

const MAX_ATTEMPTS = Number(process.env.JOB_MAX_ATTEMPTS || 5);
const LOCK_MINUTES = 20; // longer than the slowest job (video transcode); a crashed worker's job is picked up after this

const handlers: Record<JobKind, (p: Record<string, unknown>) => Promise<void>> = {
  async preview(p) {
    const { makePreview } = await import("./preview");
    const m = await db().get("SELECT * FROM media WHERE id = ?", p.mediaId);
    if (m) await makePreview(m as Parameters<typeof makePreview>[0]);
  },
  async email(p) {
    const { deliverEmail } = await import("./notify");
    await deliverEmail(Number(p.outboxId));
  },
  async compare(p) {
    const { runComparison } = await import("./ai");
    const { getRental } = await import("./rentals");
    const rental = await getRental(Number(p.rentalId));
    if (rental) await runComparison(Number(p.comparisonId), rental, Number(p.actorId));
  },
};

export const inlineJobs = () => process.env.JOB_MODE !== "worker";

export async function enqueue(kind: JobKind, payload: Record<string, unknown>) {
  const { lastInsertRowid: id } = await db().run("INSERT INTO jobs (kind, payload) VALUES (?, ?)", kind, JSON.stringify(payload));
  if (inlineJobs()) setImmediate(() => void runJob(id).catch((e) => console.error("[jobs] inline", kind, e)));
  return id;
}

const CLAIM = `UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_until = now() + interval '${LOCK_MINUTES} minutes'
  WHERE id = (SELECT id FROM jobs WHERE %WHERE% ORDER BY run_at LIMIT 1 FOR UPDATE SKIP LOCKED)
  RETURNING id, kind, payload, attempts`;
const READY = "(status = 'queued' AND run_at <= now()) OR (status = 'running' AND locked_until < now())";

/** Claim and run one job: a specific one (inline mode) or the next one that is due. Returns false when idle. */
export async function runJob(id?: number): Promise<boolean> {
  const job = (await db().get(CLAIM.replace("%WHERE%", id ? `id = ? AND (${READY})` : READY), ...(id ? [id] : []))) as Job | undefined;
  if (!job) return false;
  const started = Date.now();
  try {
    await handlers[job.kind](job.payload);
    await db().run("UPDATE jobs SET status = 'done', done_at = now(), locked_until = NULL WHERE id = ?", job.id);
    console.log(`[jobs] ${job.kind} #${job.id} done in ${Date.now() - started}ms`);
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
    const failed = job.attempts >= MAX_ATTEMPTS;
    const delay = Math.min(3600, 15 * 2 ** job.attempts); // 30s, 1m, 2m, 4m ... capped at 1h
    await db().run(
      `UPDATE jobs SET status = ?, last_error = ?, locked_until = NULL, run_at = now() + (? * interval '1 second') WHERE id = ?`,
      failed ? "failed" : "queued", msg, delay, job.id,
    );
    console.error(`[jobs] ${job.kind} #${job.id} attempt ${job.attempts} failed${failed ? " (giving up)" : ""}: ${msg}`);
  }
  return true;
}

/** Housekeeping, run by the worker every few minutes. */
export async function cleanup() {
  const d = db();
  await d.run("DELETE FROM sessions WHERE expires_at < ?", new Date().toISOString());
  await d.run("DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'");
  await d.run("DELETE FROM jobs WHERE status = 'done' AND done_at < now() - interval '7 days'");
  await d.run("DELETE FROM email_codes WHERE expires_at < ?", new Date(Date.now() - 86400_000).toISOString());
}
