// Load test: busy-hour traffic from the 25,000 active users created by seed.sql.
//   k6 run -e BASE=https://staging.example.com -e PEAK=2500 deploy/loadtest/k6.js
// Each virtual user is a person on their phone: open a page, read it for a few seconds, open the next.
// Run the target with RATE_LIMITS=off (every request comes from the load generator's one IP).
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE || "http://localhost:3000";
const PEAK = Number(__ENV.PEAK || 1000); // people on the app at the same moment
const RAMP = __ENV.RAMP || "2m";
const HOLD = __ENV.HOLD || "5m";

export const options = {
  scenarios: {
    browsing: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [{ duration: RAMP, target: PEAK }, { duration: HOLD, target: PEAK }, { duration: "30s", target: 0 }],
      gracefulRampDown: "10s",
    },
    // People signing in (password check is the most CPU-hungry request): 2 per second.
    logins: { executor: "constant-arrival-rate", rate: 2, timeUnit: "1s", duration: HOLD, startTime: RAMP, preAllocatedVUs: 20, exec: "login" },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{kind:page}": ["p(95)<800"],
    "http_req_duration{kind:write}": ["p(95)<1000"],
    "http_req_duration{kind:login}": ["p(95)<1500"],
  },
};

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const think = () => sleep(3 + Math.random() * 5);

// seed.sql: users 1..5000 are active landlords (rentals i, i+100k, i+200k, i+300k);
// users 100001..120000 are active tenants (rental = user - 100000). Rental r has issues r, r+400k, r+800k.
function persona(vu) {
  const n = vu % 25000;
  if (n < 5000) {
    const id = n + 1;
    return { id, role: "landlord", rentals: [id, id + 100000, id + 200000, id + 300000] };
  }
  const id = 100001 + (n - 5000);
  return { id, role: "tenant", rentals: [id - 100000] };
}

function get(path, cookie) {
  const r = http.get(`${BASE}${path}`, { headers: { Cookie: cookie }, redirects: 0, tags: { kind: "page", name: path.replace(/\d+/g, ":id") } });
  check(r, { "page ok": (x) => x.status === 200 });
  if (r.status !== 200 && __ENV.DEBUG) console.warn(`${r.status} ${path} ${r.error || ""}`);
  return r;
}

export default function () {
  const p = persona(__VU);
  const cookie = `handover_session=lt-${p.id}; lang=${pick(["en", "en", "ar", "hi", "ur", "ml"])}`;
  const r = pick(p.rentals);
  const issue = pick([r, r + 400000, r + 800000].filter((k) => k <= 1000000));
  get(p.role === "landlord" ? "/dashboard/landlord" : "/dashboard/tenant", cookie); think();
  get(`/rentals/${r}`, cookie); think();
  get(`/rentals/${r}/issues`, cookie); think();
  get(`/rentals/${r}/issues/${issue}`, cookie); think();
  if (Math.random() < 0.15) {
    // Comment on a repair: a write, a hash-chain append and an email.
    const w = http.post(`${BASE}/api/issues/${issue}`, { action: "comment", body: "Any update on this?" }, { headers: { Cookie: cookie }, tags: { kind: "write", name: "/api/issues/:id" } });
    check(w, { "write ok": (x) => x.status === 200 });
    if (w.status !== 200 && __ENV.DEBUG) console.warn(`${w.status} write ${w.error || ""} ${String(w.body).slice(0, 120)}`);
    think();
  }
  if (p.role === "landlord") get("/dashboard/landlord/maintenance", cookie);
  else get(`/rentals/${r}/spending`, cookie);
  think();
}

export function login() {
  const id = 120001 + Math.floor(Math.random() * 800000);
  const res = http.post(`${BASE}/api/auth/login`, JSON.stringify({ email: `lt${id}@loadtest.invalid`, password: __ENV.PASSWORD || "password123" }), {
    headers: { "Content-Type": "application/json" }, tags: { kind: "login", name: "/api/auth/login" },
  });
  check(res, { "login ok": (x) => x.status === 200 });
}
