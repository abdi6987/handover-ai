/**
 * Background worker: `npm run worker`. Runs as its own Cloud Run service (or several), next to the web app.
 * Picks up video/audio previews, AI move-out comparisons and emails from the jobs table.
 */
import http from "node:http";
import { cleanup, runJob } from "./lib/jobs";
import { ping } from "./lib/db";
import { billingTick } from "./lib/subscriptions";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 2);
let stopping = false;

async function loop(n: number) {
  while (!stopping) {
    try {
      if (!(await runJob())) await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error(`[worker ${n}]`, e);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

async function main() {
  await ping();
  console.log(`[worker] started with ${CONCURRENCY} slots`);
  const loops = Array.from({ length: CONCURRENCY }, (_, i) => loop(i));
  const tidy = setInterval(() => void cleanup().catch((e) => console.error("[worker] cleanup", e)), 10 * 60 * 1000);
  // Subscription renewals and plan expiry (does nothing while payments are switched off).
  const tick = () => void billingTick().catch((e) => console.error("[worker] billing", e));
  tick();
  const billing = setInterval(tick, 5 * 60 * 1000);
  // Cloud Run expects something listening on $PORT; it doubles as a health check.
  const server = http.createServer((_req, res) => res.end(stopping ? "stopping" : "ok")).listen(Number(process.env.PORT || 8081));
  const stop = () => { stopping = true; clearInterval(tidy); clearInterval(billing); server.close(); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  await Promise.all(loops);
  process.exit(0);
}

void main().catch((e) => { console.error(e); process.exit(1); });
