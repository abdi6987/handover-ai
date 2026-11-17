# Running Handover AI on Google Cloud (Doha)

Built for **1,000,000 registered users and 25,000 active users**, hosted in Google Cloud's Doha region (`me-central1`), so tenants' and landlords' data stays in Qatar.

## What runs where

| Part | Google Cloud service | Size at launch | Grows to |
|---|---|---|---|
| Web app | Cloud Run `handover-web` | 2 instances always on (1 vCPU, 1 GB each) | 60 instances, automatically |
| Background work: video previews, AI move-out reports, emails, inspection reminders (WhatsApp, push) | Cloud Run `handover-worker` | 1 instance (2 vCPU, 4 GB) | 6 instances |
| Database | Cloud SQL for PostgreSQL 16, high availability (a standby copy in a second zone) | 4 vCPU, 16 GB, 100 GB SSD | Disk grows by itself. Move to 8 vCPU past ~100k active users |
| Photos, videos, documents | Cloud Storage bucket in Doha | Pay per GB | Unlimited |
| Front door | Global HTTPS load balancer, Google-managed certificate, Cloud CDN for app files, Cloud Armor | | |
| Keys and passwords | Secret Manager | | |

**How it holds up under load**
- **Web servers keep no state.** Sessions, rate limits and jobs live in Postgres. Files live in Cloud Storage. Any instance can answer any request, so Cloud Run can add instances in seconds.
- **Big files skip the web servers.** Phones upload videos straight to Cloud Storage through a 2-hour signed link, and downloads use a 15-minute signed link. Cloud Run's 32 MB request limit never applies, and a 500 MB video uses no web server time.
- **Slow work runs in the background.** Video conversion, AI comparisons and emails go into a jobs table. Workers pick jobs up with `FOR UPDATE SKIP LOCKED`, so you can run any number of workers side by side. A failed job is retried 5 times, with growing waits between tries.
- **Each rental has its own tamper-proof chain.** Writes for one rental never wait on another rental. The proof page checks the chain and every move-in file's fingerprint.
- **Database connections are capped.** 60 web instances × 5 connections plus 6 workers × 4 is 324, under the limit of 500.

**Backups and recovery**
- The database is backed up every night, and backups are kept 30 days.
- Point-in-time restore covers any second in the last 7 days.
- If a zone fails, the standby copy takes over on its own in about a minute.
- The bucket keeps old versions of files, and deleted files can be recovered for 90 days.

## Monthly cost (rough estimate)

Prices are estimates for `me-central1`, before tax. Check them in the [Google Cloud pricing calculator](https://cloud.google.com/products/calculator) before you commit.

| Item | Launch | At 25k active users |
|---|---|---|
| Cloud SQL (high availability, 4 vCPU, 16 GB) | ~$500 | ~$500 |
| Cloud Run web + worker | ~$250 | $400–800 |
| Load balancer + Cloud Armor | ~$30 | ~$60 |
| Cloud Storage (old files move to cheaper storage automatically) | ~$10 | $150–400 (5–20 TB) |
| Internet egress (people viewing photos and videos) | ~$10 | $100–300 |
| **Total** | **~$800** | **~$1,200–2,000** |

Claude API costs for AI reports are billed separately by Anthropic. Each move-out comparison costs a few cents.

## Set it up

You need:
- A Google Cloud project with billing turned on.
- The `gcloud` CLI, logged in as a project owner.
- A domain you can add a DNS record to.

```bash
PROJECT_ID=your-project DOMAIN=app.yourdomain.qa GOOGLE_CLIENT_ID=your-google-oauth-client-id ./deploy/gcp-setup.sh
```

The script takes about 20 minutes. Most of that is creating the database. You can run it again safely: it skips anything that already exists. When it finishes:

1. **Point your domain** at the IP address it prints, with an `A` record. The HTTPS certificate turns on 15–60 minutes later.
2. **Add the keys.** They go into Secret Manager, never into code or chat:
   ```bash
   printf '%s' 'sk-ant-...' | gcloud secrets versions add anthropic-api-key --data-file=-
   printf '%s' 're_...'     | gcloud secrets versions add resend-api-key --data-file=-
   printf '%s' 'GOCSPX-...' | gcloud secrets versions add google-client-secret --data-file=-
   ```
   WhatsApp and push reminders are optional. See "Inspection reminders" below.
   In the Google sign-in client, add `https://<DOMAIN>/api/auth/google/callback` as a redirect URI.
3. **Restart both services** so they read the new keys:
   ```bash
   gcloud run services update handover-web --region me-central1
   gcloud run services update handover-worker --region me-central1
   ```
4. **Check it works:** `curl https://<DOMAIN>/api/health` should answer `{"ok":true}`.

The database tables are created automatically the first time the app starts.

## Paid plans (switched off)

Landlords can pay for **Pro** (QAR 49/month or 490/year) or **Business** (QAR 199/month or 1,990/year) with Apple Pay or a card, through [Tap Payments](https://www.tap.company). Tenants and staff are always free. While payments are off, nobody sees prices and every landlord gets every feature.

To switch payments on:
1. Open a Tap account with your commercial registration. Ask Tap to enable **Apple Pay** and **Save Card / recurring payments**.
2. Put the secret key in Secret Manager:
   ```bash
   printf '%s' 'sk_live_...' | gcloud secrets versions add tap-secret-key --data-file=-
   ```
3. In Tap's dashboard, set the webhook URL to `https://<DOMAIN>/api/billing/webhook`.
4. Turn payments on for both services:
   ```bash
   gcloud run services update handover-web --region me-central1 --update-env-vars PAYMENTS_ENABLED=1
   gcloud run services update handover-worker --region me-central1 --update-env-vars PAYMENTS_ENABLED=1
   ```
   To test first, use Tap's `sk_test_...` key on a staging copy.

How it works:
- The first payment goes through Tap's payment page, which shows Apple Pay on iPhone, iPad and Mac Safari and a card form everywhere else. That payment saves the card.
- The worker renews each plan automatically on its renewal date.
- If a renewal fails, the landlord gets 7 days' grace, daily retries and emails. After that the account drops to Free, and nothing is deleted.
- Every payment produces a receipt (by email and on the Billing page) and an entry in the tamper-proof log.
- Prices can be changed with `PRICE_PRO_MONTH`, `PRICE_PRO_YEAR`, `PRICE_BUSINESS_MONTH` and `PRICE_BUSINESS_YEAR`.

## Inspection reminders

The worker checks every 15 minutes, between 9:00 and 21:00 Qatar time. It reminds whoever has something to do before move-in (the lease start date) and move-out (the end date): 7, 3 and 1 days before, on the day, then every 2 days for up to 2 weeks while it's overdue. It stops once both sides have signed that inspection report. Each reminder goes out once, however many workers run.

- **Email** always works, through Resend.
- **WhatsApp** is opt-in. WhatsApp requires that. Each person turns it on under 🔔 in the app and gives their number. To send:
  1. In Meta Business Manager, set up the WhatsApp Business Cloud API for your number. Note the **phone number ID** and make a **permanent access token** (a system user token).
  2. Create a *Utility* message template named `inspection_reminder` in each language you need (en, ar, hi, ml, ur, fr, es). The body is `Hi {{1}}, reminder for {{2}}: {{3}}`. Add one *Visit website* button with a dynamic URL `https://<DOMAIN>/{{1}}`. Wait for Meta to approve it.
  3. Add the token and the phone number ID:
     ```bash
     printf '%s' 'EAAG...' | gcloud secrets versions add whatsapp-token --data-file=-
     gcloud run services update handover-worker --region me-central1 --update-env-vars WHATSAPP_PHONE_ID=1234567890
     ```
- **Phone and browser notifications** (web push). Each person turns them on per device under 🔔. On iPhone they work once Handover AI is added to the Home Screen. To send:
  ```bash
  npx web-push generate-vapid-keys        # prints a public and a private key
  printf '%s' '<private key>' | gcloud secrets versions add vapid-private-key --data-file=-
  gcloud run services update handover-web    --region me-central1 --update-env-vars VAPID_PUBLIC_KEY=<public key>
  gcloud run services update handover-worker --region me-central1 --update-env-vars VAPID_PUBLIC_KEY=<public key>,VAPID_SUBJECT=mailto:you@yourdomain.qa
  ```

Until WhatsApp or push is set up, every message is still kept and shown under Messages, marked "not sent".

## Shipping updates

```bash
IMAGE=me-central1-docker.pkg.dev/$PROJECT_ID/handover/app:$(git rev-parse --short HEAD)
gcloud builds submit --region me-central1 --tag $IMAGE .
gcloud run deploy handover-web --image $IMAGE --region me-central1
gcloud run deploy handover-worker --image $IMAGE --region me-central1
```

Cloud Run switches traffic over only once the new version is healthy, so updates cause no downtime. Database changes are applied by the first instance that starts. An advisory lock stops two instances from applying them at once.

## Load test

`deploy/loadtest/` holds a k6 script and a data generator.

- **Data:** the generator fills a test database with 1,000,000 users, 400,000 rentals, 1,000,000 repair requests, 2,000,000 photo records and 4,000,000 audit entries. It also gives 25,000 of the users a live session.
- **Traffic:** the k6 script plays people on their phones. Each one opens their dashboard, a rental, its repairs and a repair's details, reading each page for 3–8 seconds. 15% of them post a comment. Separately, 2 people sign in every second.

Never point it at production.

```bash
# 1. a separate test database, migrated by starting the app once against it, then:
psql "$TEST_DATABASE_URL" -v pw_hash="'$(node -e 'const c=require("crypto"),s=c.randomBytes(16).toString("hex");console.log(s+":"+c.scryptSync("password123",s,64).toString("hex"))')'" -f deploy/loadtest/seed.sql
# 2. run the app against it with RATE_LIMITS=off (all test traffic comes from one IP), then:
k6 run -e BASE=https://staging.yourdomain.qa -e PEAK=2500 deploy/loadtest/k6.js
```

### Results (16 Nov 2026)

These were measured on a 4-core test machine against the full 1M-user database (2.6 GB), with one web server process. The server was the limit; Postgres stayed at about 20% CPU.

| People browsing at once | Requests/s | Typical page | Slowest 5% | Errors |
|---|---|---|---|---|
| 300 | 45 | 31 ms | 115 ms | 0% |
| 600 | 67 (one server maxed out) | 1.8 s | 3.4 s | 0.01% |

So one 1-vCPU Cloud Run instance comfortably serves about 400 people browsing at once. These numbers come from one test machine, so they are an estimate for Cloud Run, which may differ.
- If 10% of the 25,000 active users are on the app at the same moment, that is 2,500 people, about 7 instances.
- Even all 25,000 at once would need about 60 instances, which is the configured maximum.

Confirm this on a staging copy in Google Cloud before launch.

## Running locally

- **Day to day:** `docker compose up db` starts Postgres, then run `npm run dev`. Background jobs run inside the app.
- **Full production setup:** `docker compose up --build` runs Postgres, the web app and the worker together.

## Things to decide later

- **Retention lock.** You can lock the bucket so nobody can delete files for N years, not even you. That makes the evidence stronger, but it conflicts with deleting a user's data when they ask. Get your lawyer's view under Qatar's data protection law (PDPPL) first.
- **Staging environment.** Run the same script with another `PROJECT_ID` to get a copy for testing.
