#!/usr/bin/env bash
# Sets up Handover AI on Google Cloud in Doha (me-central1). Safe to re-run: each step skips what already exists.
#
#   PROJECT_ID=my-project DOMAIN=app.example.com ./deploy/gcp-setup.sh
#
# Needs: gcloud (logged in as a project owner), a project with billing turned on, and a domain you can add a DNS record to.
# See deploy/README.md for what this creates, the sizing, and the monthly cost.
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
: "${DOMAIN:?Set DOMAIN, for example app.handover.qa}"
REGION="${REGION:-me-central1}"            # Doha
SQL_TIER="${SQL_TIER:-db-custom-4-16384}"  # 4 vCPU, 16 GB
BUCKET="${BUCKET:-${PROJECT_ID}-handover-media}"
REPO=handover
SQL=handover-db
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app:$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
APP_URL="https://${DOMAIN}"

g() { gcloud --project "$PROJECT_ID" "$@"; }
exists() { "$@" >/dev/null 2>&1; }
step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

step "APIs"
g services enable run.googleapis.com sqladmin.googleapis.com storage.googleapis.com secretmanager.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com compute.googleapis.com iamcredentials.googleapis.com

step "Container registry and image"
exists g artifacts repositories describe "$REPO" --location "$REGION" ||
  g artifacts repositories create "$REPO" --repository-format docker --location "$REGION"
g builds submit --region "$REGION" --tag "$IMAGE" .

step "Service accounts"
for sa in handover-web handover-worker; do
  exists g iam service-accounts describe "${sa}@${PROJECT_ID}.iam.gserviceaccount.com" ||
    g iam service-accounts create "$sa" --display-name "Handover AI ${sa#handover-}"
done
WEB_SA="handover-web@${PROJECT_ID}.iam.gserviceaccount.com"
WORKER_SA="handover-worker@${PROJECT_ID}.iam.gserviceaccount.com"
for sa in "$WEB_SA" "$WORKER_SA"; do
  g projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$sa" --role roles/cloudsql.client --condition None >/dev/null
  # Lets the app sign short-lived download/upload links without a key file.
  g iam service-accounts add-iam-policy-binding "$sa" --member "serviceAccount:$sa" --role roles/iam.serviceAccountTokenCreator >/dev/null
done

step "Database (Cloud SQL for PostgreSQL 16, high availability, daily backups + point-in-time restore)"
if ! exists g sql instances describe "$SQL"; then
  g sql instances create "$SQL" --database-version POSTGRES_16 --edition ENTERPRISE --tier "$SQL_TIER" --region "$REGION" \
    --availability-type REGIONAL --storage-type SSD --storage-size 100 --storage-auto-increase \
    --backup-start-time 23:00 --retained-backups-count 30 --enable-point-in-time-recovery --retained-transaction-log-days 7 \
    --maintenance-window-day SAT --maintenance-window-hour 0 \
    --database-flags max_connections=500,log_min_duration_statement=500 \
    --insights-config-query-insights-enabled
fi
exists g sql databases describe handover --instance "$SQL" || g sql databases create handover --instance "$SQL"
CONN="${PROJECT_ID}:${REGION}:${SQL}"
if ! exists g secrets describe database-url; then
  DB_PASS="$(openssl rand -base64 33 | tr -d '/+=' | cut -c1-32)"
  g sql users create handover --instance "$SQL" --password "$DB_PASS"
  printf 'postgres://handover:%s@localhost/handover?host=/cloudsql/%s' "$DB_PASS" "$CONN" |
    g secrets create database-url --data-file=- --replication-policy user-managed --locations "$REGION"
fi

step "Photo and video storage (Cloud Storage in Doha)"
if ! exists gcloud storage buckets describe "gs://$BUCKET" --project "$PROJECT_ID"; then
  gcloud storage buckets create "gs://$BUCKET" --project "$PROJECT_ID" --location "$REGION" \
    --uniform-bucket-level-access --public-access-prevention --soft-delete-duration 90d
fi
gcloud storage buckets update "gs://$BUCKET" --versioning
TMP="$(mktemp -d)"
cat > "$TMP/cors.json" <<EOF
[{"origin": ["$APP_URL"], "method": ["PUT", "GET"], "responseHeader": ["Content-Type"], "maxAgeSeconds": 3600}]
EOF
# Originals are rarely opened after move-in: move them to cheaper storage classes over time.
# Unfinished direct uploads (staging/) are removed after a day.
cat > "$TMP/lifecycle.json" <<'EOF'
{"rule": [
  {"action": {"type": "Delete"}, "condition": {"age": 1, "matchesPrefix": ["staging/"]}},
  {"action": {"type": "SetStorageClass", "storageClass": "NEARLINE"}, "condition": {"age": 60, "matchesStorageClass": ["STANDARD"]}},
  {"action": {"type": "SetStorageClass", "storageClass": "COLDLINE"}, "condition": {"age": 400, "matchesStorageClass": ["NEARLINE"]}},
  {"action": {"type": "Delete"}, "condition": {"daysSinceNoncurrentTime": 30}}
]}
EOF
gcloud storage buckets update "gs://$BUCKET" --cors-file "$TMP/cors.json" --lifecycle-file "$TMP/lifecycle.json"
for sa in "$WEB_SA" "$WORKER_SA"; do
  gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member "serviceAccount:$sa" --role roles/storage.objectAdmin >/dev/null
done

step "Secrets (fill these in: see README)"
for s in anthropic-api-key resend-api-key google-client-secret; do
  exists g secrets describe "$s" || printf 'unset' | g secrets create "$s" --data-file=- --replication-policy user-managed --locations "$REGION"
done
for s in database-url anthropic-api-key resend-api-key google-client-secret; do
  for sa in "$WEB_SA" "$WORKER_SA"; do
    g secrets add-iam-policy-binding "$s" --member "serviceAccount:$sa" --role roles/secretmanager.secretAccessor >/dev/null
  done
done

COMMON_ENV="APP_URL=${APP_URL},GCS_BUCKET=${BUCKET},JOB_MODE=worker,DISPLAY_TZ=Asia/Qatar,TRUSTED_PROXY_HOPS=2,GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}"
SECRETS="DATABASE_URL=database-url:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest,RESEND_API_KEY=resend-api-key:latest,GOOGLE_CLIENT_SECRET=google-client-secret:latest"

step "Web app (Cloud Run)"
# Node renders pages on one core, so many small instances beat a few big ones. The load test measured ~55 requests/s
# (about 400 people browsing at once) per 1-vCPU instance; concurrency 40 keeps each one below that.
# 2 instances always warm (no cold starts), up to 60 at peak. 60 x 5 DB connections = 300, under the 500 allowed.
g run deploy handover-web --image "$IMAGE" --region "$REGION" --service-account "$WEB_SA" \
  --add-cloudsql-instances "$CONN" --set-env-vars "${COMMON_ENV},PG_POOL_MAX=5" --set-secrets "$SECRETS" \
  --cpu 1 --memory 1Gi --concurrency 40 --min-instances 2 --max-instances 60 --timeout 300 --cpu-boost \
  --ingress internal-and-cloud-load-balancing --allow-unauthenticated

step "Background worker (Cloud Run): video previews, AI reports, emails"
g run deploy handover-worker --image "$IMAGE" --region "$REGION" --service-account "$WORKER_SA" \
  --command node --args worker.js \
  --add-cloudsql-instances "$CONN" --set-env-vars "${COMMON_ENV},PG_POOL_MAX=4,WORKER_CONCURRENCY=2" --set-secrets "$SECRETS" \
  --cpu 2 --memory 4Gi --no-cpu-throttling --min-instances 1 --max-instances 6 --timeout 3600 \
  --ingress internal --no-allow-unauthenticated

step "Load balancer, HTTPS certificate, CDN for static files, Cloud Armor"
exists g compute addresses describe handover-ip --global || g compute addresses create handover-ip --global
IP="$(g compute addresses describe handover-ip --global --format 'value(address)')"
exists g compute network-endpoint-groups describe handover-neg --region "$REGION" ||
  g compute network-endpoint-groups create handover-neg --region "$REGION" --network-endpoint-type serverless --cloud-run-service handover-web
if ! exists g compute security-policies describe handover-armor; then
  g compute security-policies create handover-armor --description "Handover AI edge protection"
  # Block an IP for 10 minutes if it sends more than 1,500 requests a minute (generous: phones share carrier IPs).
  g compute security-policies rules create 1000 --security-policy handover-armor --expression "true" \
    --action rate-based-ban --rate-limit-threshold-count 1500 --rate-limit-threshold-interval-sec 60 \
    --ban-duration-sec 600 --conform-action allow --exceed-action deny-429 --enforce-on-key IP
  g compute security-policies rules create 900 --security-policy handover-armor \
    --expression "evaluatePreconfiguredWaf('sqli-v33-stable', {'sensitivity': 1}) || evaluatePreconfiguredWaf('xss-v33-stable', {'sensitivity': 1})" \
    --action deny-403
fi
if ! exists g compute backend-services describe handover-backend --global; then
  g compute backend-services create handover-backend --global --load-balancing-scheme EXTERNAL_MANAGED \
    --enable-cdn --cache-mode USE_ORIGIN_HEADERS --security-policy handover-armor
  g compute backend-services add-backend handover-backend --global --network-endpoint-group handover-neg --network-endpoint-group-region "$REGION"
fi
exists g compute url-maps describe handover-map || g compute url-maps create handover-map --default-service handover-backend
exists g compute ssl-certificates describe handover-cert --global ||
  g compute ssl-certificates create handover-cert --domains "$DOMAIN" --global
exists g compute target-https-proxies describe handover-https ||
  g compute target-https-proxies create handover-https --url-map handover-map --ssl-certificates handover-cert
exists g compute forwarding-rules describe handover-https-rule --global ||
  g compute forwarding-rules create handover-https-rule --global --load-balancing-scheme EXTERNAL_MANAGED \
    --address handover-ip --target-https-proxy handover-https --ports 443
# Plain http:// redirects to https://
if ! exists g compute url-maps describe handover-http-redirect; then
  printf 'name: handover-http-redirect\ndefaultUrlRedirect:\n  httpsRedirect: true\n  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT\n' > "$TMP/redirect.yaml"
  g compute url-maps import handover-http-redirect --global --source "$TMP/redirect.yaml" --quiet
  g compute target-http-proxies create handover-http --url-map handover-http-redirect
  g compute forwarding-rules create handover-http-rule --global --load-balancing-scheme EXTERNAL_MANAGED \
    --address handover-ip --target-http-proxy handover-http --ports 80
fi

cat <<EOF

Done. Next:
  1. Add a DNS A record:  ${DOMAIN}  ->  ${IP}
     The HTTPS certificate turns active 15-60 minutes after the record is live.
  2. Put the real keys in Secret Manager (see deploy/README.md), then redeploy:
       gcloud run services update handover-web --region ${REGION} --project ${PROJECT_ID}
  3. Check: curl ${APP_URL}/api/health
EOF
